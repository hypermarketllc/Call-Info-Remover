// server.js
const express = require('express');
const multer = require('multer');
const { Deepgram } = require('@deepgram/sdk');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const cors = require('cors');
const util = require('util');
const mkdir = util.promisify(fs.mkdir);
const { createLogger, format, transports } = require('winston');

// Configure logger
const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.File({ filename: 'error.log', level: 'error' }),
    new transports.File({ filename: 'combined.log' }),
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    })
  ]
});

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for development
app.use(cors());

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await mkdir('uploads', { recursive: true });
      cb(null, 'uploads/');
    } catch (err) {
      logger.error('Failed to create upload directory', { error: err.message });
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// Initialize Deepgram for speech-to-text
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY || 'YOUR_DEEPGRAM_API_KEY');

// Sensitive information patterns
const patterns = {
  ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  phoneNumber: /\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/g,
  bankAccount: /\b\d{8,17}\b/g,
  routingNumber: /\b\d{9}\b/g
};

// Simple in-memory database
// In production, replace with a real database
const callDatabase = [];

// Create necessary directories
const ensureDirectories = async () => {
  const dirs = ['uploads', 'processed', 'transcripts'];
  for (const dir of dirs) {
    try {
      await mkdir(dir, { recursive: true });
      logger.info(`Directory created: ${dir}`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        logger.error(`Error creating directory: ${dir}`, { error: error.message });
        throw error;
      }
    }
  }
};

// Function to find sensitive info with timestamps
function findSensitiveInfoWithTimestamps(transcript) {
  const sensitiveSections = [];
  
  if (transcript && transcript.words) {
    let currentMatch = null;
    
    for (let i = 0; i < transcript.words.length; i++) {
      const word = transcript.words[i];
      const text = word.word;
      
      // Check if this word contains sensitive information
      let isSensitive = false;
      Object.values(patterns).forEach(pattern => {
        if (pattern.test(text)) {
          isSensitive = true;
        }
      });
      
      // Also check if combining with nearby words creates sensitive info
      if (!isSensitive && i < transcript.words.length - 3) {
        const combinedText = transcript.words.slice(i, i + 4).map(w => w.word).join(' ');
        Object.values(patterns).forEach(pattern => {
          if (pattern.test(combinedText)) {
            isSensitive = true;
          }
        });
      }
      
      if (isSensitive) {
        if (!currentMatch) {
          // Start a new sensitive section
          currentMatch = {
            start: parseFloat(word.start),
            end: parseFloat(word.end)
          };
        } else {
          // Extend the current sensitive section
          currentMatch.end = parseFloat(word.end);
        }
      } else if (currentMatch) {
        // End the current sensitive section and add a bit of buffer
        currentMatch.end += 0.2; // Add 200ms buffer
        sensitiveSections.push(currentMatch);
        currentMatch = null;
      }
    }
    
    // Add the last section if there is one
    if (currentMatch) {
      currentMatch.end += 0.2; // Add 200ms buffer
      sensitiveSections.push(currentMatch);
    }
  }
  
  return sensitiveSections;
}

// Function to redact text
function redactSensitiveInfo(text) {
  let redactedText = text;
  
  Object.entries(patterns).forEach(([type, pattern]) => {
    redactedText = redactedText.replace(pattern, `[REDACTED ${type.toUpperCase()}]`);
  });
  
  return redactedText;
}

/**
 * Primary audio redaction method using SoX (Sound eXchange)
 * SoX is a highly reliable command-line utility available on most Linux systems
 */
function createRedactedAudioWithSox(originalPath, sensitiveSections, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      // Create a temporary copy of the original audio
      const tempFilePath = path.join('processed', `temp_${path.basename(originalPath)}.wav`);
      
      // First, convert the original audio to WAV format for consistent processing
      const convertProcess = spawn('sox', [originalPath, '-c', '1', tempFilePath]);
      
      convertProcess.on('error', (err) => {
        logger.error('Error spawning SoX for conversion', { error: err.message });
        reject(new Error(`SoX conversion failed: ${err.message}`));
      });

      convertProcess.on('close', async (code) => {
        if (code !== 0) {
          return reject(new Error(`SoX conversion process exited with code ${code}`));
        }
        
        if (sensitiveSections.length === 0) {
          // No sensitive sections to redact, just copy the file
          fs.copyFile(tempFilePath, outputPath, (err) => {
            if (err) reject(err);
            else resolve(outputPath);
          });
          return;
        }
        
        // We'll use the 'sox' command line tool to apply beep tones
        // Create a list of commands for each sensitive section
        let soxCommands = [];
        
        // Copy the original audio first
        fs.copyFile(tempFilePath, outputPath, (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Process each sensitive section with beep tones
          const processSection = (index) => {
            if (index >= sensitiveSections.length) {
              // All sections processed
              resolve(outputPath);
              return;
            }
            
            const section = sensitiveSections[index];
            const duration = section.end - section.start;
            const tempOutput = `${outputPath}.temp${index}`;
            
            // Generate beep tone and mix it into the output at the specified time
            const soxArgs = [
              outputPath,                    // Input file
              tempOutput,                    // Output file
              'synth', `${duration}`, 'sine', '1000',  // Generate 1kHz sine wave
              'gain', '-12',                 // Lower volume a bit
              'fade', 'q', '0.01', `${duration}`, '0.01',  // Quick fade in/out
              'pad', `${section.start}`, '0', // Pad before beep tone
              'norm'                         // Normalize audio
            ];
            
            const soxProcess = spawn('sox', soxArgs);
            
            soxProcess.on('error', (err) => {
              logger.error('Error spawning SoX for beep insertion', { 
                error: err.message,
                section: section
              });
              reject(new Error(`SoX beep insertion failed: ${err.message}`));
            });
            
            soxProcess.stdout.on('data', (data) => {
              logger.debug(`SoX stdout: ${data}`);
            });
            
            soxProcess.stderr.on('data', (data) => {
              logger.debug(`SoX stderr: ${data}`);
            });
            
            soxProcess.on('close', (code) => {
              if (code !== 0) {
                return reject(new Error(`SoX beep process exited with code ${code}`));
              }
              
              // Replace original with temporary file
              fs.rename(tempOutput, outputPath, (err) => {
                if (err) {
                  reject(err);
                } else {
                  // Process next section
                  processSection(index + 1);
                }
              });
            });
          };
          
          // Start processing the first section
          processSection(0);
        });
      });
      
    } catch (error) {
      logger.error('Error in SoX audio redaction', { error: error.message });
      reject(error);
    }
  });
}

/**
 * Fallback audio redaction method using direct buffer manipulation
 * This is used when SoX is not available or fails
 */
function createRedactedAudioWithBuffer(originalPath, sensitiveSections, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      // Use a child process to execute a specialized Node.js script for audio processing
      // This pattern allows for more memory-efficient processing of large audio files
      const bufferProcess = spawn('node', [
        path.join(__dirname, 'audioProcessor.js'),
        originalPath,
        outputPath,
        JSON.stringify(sensitiveSections)
      ]);
      
      bufferProcess.on('error', (err) => {
        logger.error('Error spawning buffer processor', { error: err.message });
        reject(new Error(`Buffer processor failed: ${err.message}`));
      });
      
      let errorOutput = '';
      bufferProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        logger.debug(`Buffer processor stderr: ${data}`);
      });
      
      bufferProcess.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Buffer processor exited with code ${code}: ${errorOutput}`));
        }
        resolve(outputPath);
      });
      
    } catch (error) {
      logger.error('Error in buffer-based audio redaction', { error: error.message });
      reject(error);
    }
  });
}

// Main redaction function with multiple fallback strategies
async function createRedactedAudio(originalPath, sensitiveSections, outputPath) {
  try {
    logger.info('Attempting audio redaction with SoX', { 
      original: originalPath,
      sensitiveCount: sensitiveSections.length
    });
    
    return await createRedactedAudioWithSox(originalPath, sensitiveSections, outputPath);
  } catch (error) {
    logger.warn('SoX redaction failed, falling back to buffer method', { error: error.message });
    
    try {
      return await createRedactedAudioWithBuffer(originalPath, sensitiveSections, outputPath);
    } catch (bufferError) {
      logger.error('All redaction methods failed', { error: bufferError.message });
      throw new Error(`Audio redaction failed: ${bufferError.message}`);
    }
  }
}

// Main upload endpoint
app.post('/api/upload', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const originalFilePath = req.file.path;
    const fileName = path.basename(originalFilePath);
    const mimetype = req.file.mimetype;
    
    logger.info('Processing uploaded file', { 
      filename: req.file.originalname,
      mimetype: mimetype,
      size: req.file.size
    });
    
    // Generate output paths
    const redactedAudioPath = path.join('processed', `redacted_${fileName}`);
    const transcriptPath = path.join('transcripts', `transcript_${fileName}.txt`);
    const redactedTranscriptPath = path.join('transcripts', `redacted_${fileName}.txt`);
    
    // Convert audio to text using Deepgram
    logger.info('Starting Deepgram transcription');
    const audioSource = {
      buffer: fs.readFileSync(originalFilePath),
      mimetype
    };
    
    const deepgramResponse = await deepgram.transcription.preRecorded(audioSource, {
      punctuate: true,
      diarize: true,
      utterances: true,
      model: 'nova',
      smart_format: true,
      detectEntities: true,
      words: true
    });
    
    // Get transcript text and timing information
    const transcriptionResult = deepgramResponse.results;
    const transcript = transcriptionResult.channels[0].alternatives[0].transcript;
    
    logger.info('Transcription complete, finding sensitive information');
    
    // Find sensitive sections with timestamps
    const sensitiveSections = findSensitiveInfoWithTimestamps(transcriptionResult.channels[0].alternatives[0]);
    
    // Create redacted transcript
    const redactedTranscript = redactSensitiveInfo(transcript);
    
    // Save original and redacted transcripts
    fs.writeFileSync(transcriptPath, transcript);
    fs.writeFileSync(redactedTranscriptPath, redactedTranscript);
    
    logger.info('Creating redacted audio', { 
      sensitiveCount: sensitiveSections.length
    });
    
    // Create audio with beeps
    await createRedactedAudio(originalFilePath, sensitiveSections, redactedAudioPath);
    
    logger.info('Redacted audio created successfully');
    
    // Add to database
    const callRecord = {
      id: Date.now().toString(),
      originalFileName: req.file.originalname,
      uploadDate: new Date(),
      originalFilePath,
      redactedFilePath: redactedAudioPath,
      transcriptPath,
      redactedTranscriptPath,
      sensitiveInfoCount: sensitiveSections.length
    };
    
    callDatabase.push(callRecord);
    
    res.json({
      success: true,
      id: callRecord.id,
      originalFileName: req.file.originalname,
      uploadDate: callRecord.uploadDate,
      sensitiveInfoCount: sensitiveSections.length
    });
    
  } catch (error) {
    logger.error('Error processing audio', { error: error.message });
    res.status(500).json({ error: 'Error processing audio file', details: error.message });
  }
});

// Get all calls
app.get('/api/calls', (req, res) => {
  res.json(callDatabase.map(call => ({
    id: call.id,
    originalFileName: call.originalFileName,
    uploadDate: call.uploadDate,
    sensitiveInfoCount: call.sensitiveInfoCount
  })));
});

// Get specific call details
app.get('/api/calls/:id', (req, res) => {
  const call = callDatabase.find(c => c.id === req.params.id);
  if (call) {
    res.json(call);
  } else {
    res.status(404).json({ error: 'Call not found' });
  }
});

// Download original audio
app.get('/api/download/original/:id', (req, res) => {
  const call = callDatabase.find(c => c.id === req.params.id);
  if (call && fs.existsSync(call.originalFilePath)) {
    res.download(call.originalFilePath, call.originalFileName);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Download redacted audio
app.get('/api/download/redacted/:id', (req, res) => {
  const call = callDatabase.find(c => c.id === req.params.id);
  if (call && fs.existsSync(call.redactedFilePath)) {
    res.download(call.redactedFilePath, `redacted_${call.originalFileName}`);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Download transcript
app.get('/api/download/transcript/:id', (req, res) => {
  const call = callDatabase.find(c => c.id === req.params.id);
  if (call && fs.existsSync(call.redactedTranscriptPath)) {
    res.download(call.redactedTranscriptPath, `transcript_${call.originalFileName}.txt`);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Error handler middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
async function start() {
  try {
    await ensureDirectories();
    app.listen(port, () => {
      logger.info(`Audio Redaction Server running on port ${port}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

start();
