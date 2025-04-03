// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const { Deepgram } = require('@deepgram/sdk');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const winston = require('winston');

// Import the fixed audio processor
const audioProcessor = require('./audio-processor-fix');

// Create a structured logging system
const logs = [];
const LOG_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  SUCCESS: 'success'
};

function addLog(level, category, message, details = null) {
  const log = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    details
  };
  
  logs.push(log);
  console.log(`[${log.level.toUpperCase()}][${log.category}] ${log.message}`);
  
  // Keep only the last 1000 logs to prevent memory issues
  if (logs.length > 1000) {
    logs.shift();
  }
  
  return log;
}

// Helper function to format timestamps as MM:SS.ms
function formatTimestamp(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

// Check if SoX is installed
async function isSoxInstalled() {
  return new Promise((resolve) => {
    const command = process.platform === 'win32' ? 'where sox' : 'which sox';
    require('child_process').exec(command, (error) => {
      resolve(!error);
    });
  });
}

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files
app.use(express.static('public'));

// Create required directories
const directories = ['uploads', 'processed', 'transcripts', 'temp'];
directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
    addLog(LOG_LEVELS.INFO, 'system', `Created directory: ${dir}/`);
  } else {
    addLog(LOG_LEVELS.INFO, 'system', `Directory exists: ${dir}/`);
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    // Accept audio files only
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// Import axios for direct HTTP requests
const axios = require('axios');

// Initialize Deepgram API key from environment variables
const apiKey = process.env.DEEPGRAM_API_KEY || 'YOUR_DEEPGRAM_API_KEY';
addLog(LOG_LEVELS.INFO, 'system', 'Initializing Deepgram API client', { 
  apiKeyProvided: apiKey !== 'YOUR_DEEPGRAM_API_KEY' 
});

// Function to transcribe audio using Deepgram API directly with axios
async function transcribeAudio(filePath, mimetype) {
  addLog(LOG_LEVELS.INFO, 'transcription', `Transcribing audio file: ${filePath}`, { mimetype });
  addLog(LOG_LEVELS.INFO, 'transcription', 'Reading file into buffer...');
  
  try {
    // Read the file into a buffer - make sure we're using the actual uploaded file
    const buffer = fs.readFileSync(filePath);
    addLog(LOG_LEVELS.INFO, 'transcription', `File read successfully, size: ${buffer.length} bytes`);
    
    // Maximum number of API connection attempts
    const maxRetries = 2;
    let attempt = 1;
    
    // Deepgram API endpoint with query parameters - exactly as it worked in Postman
    const apiUrl = 'https://api.deepgram.com/v1/listen?punctuate=true&diarize=true&utterances=true&model=nova-3&smart_format=true&words=true';
    
    while (attempt <= maxRetries) {
      addLog(LOG_LEVELS.INFO, 'api', `Connecting to Deepgram API for transcription (Attempt ${attempt}/${maxRetries})...`, {
        url: apiUrl,
        fileSize: buffer.length,
        mimetype: mimetype
      });
      
      try {
        const startTime = Date.now();
        
        // Make the API request using axios with the file data
        // This matches exactly the format that worked in Postman
        const response = await axios({
          method: 'post',
          url: apiUrl,
          data: buffer,
          headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': mimetype
          },
          responseType: 'json',
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        });
        
        const endTime = Date.now();
        
        // Log success and return results
        addLog(LOG_LEVELS.SUCCESS, 'api', 'Received transcription response from Deepgram', {
          responseTime: `${(endTime - startTime) / 1000} seconds`,
          statusCode: response.status,
          transcriptLength: response.data.results.channels[0].alternatives[0].transcript.length,
          wordCount: response.data.results.channels[0].alternatives[0].words.length
        });
        
        return response.data.results;
      } catch (error) {
        // Log the detailed error for debugging
        addLog(LOG_LEVELS.ERROR, 'api', `Error from Deepgram API (Attempt ${attempt}/${maxRetries})`, {
          error: error.message,
          stack: error.stack,
          statusCode: error.response?.status || 'N/A',
          response: error.response?.data || 'N/A',
          request: {
            url: apiUrl,
            method: 'POST',
            headers: {
              'Authorization': 'Token [REDACTED]',
              'Content-Type': mimetype
            },
            dataType: typeof buffer,
            dataSize: buffer.length
          }
        });
        
        // Log the full error object for debugging
        console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        
        if (attempt < maxRetries) {
          // Wait for 2 seconds before retrying
          addLog(LOG_LEVELS.WARNING, 'api', `Retrying connection in 2 seconds... (Attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempt++;
        } else {
          // All retry attempts failed
          addLog(LOG_LEVELS.ERROR, 'api', 'All connection attempts to Deepgram API failed', {
            error: error.message,
            attempts: maxRetries
          });
          
          // Throw the error to be handled by the caller
          throw new Error(`Failed to connect to Deepgram API after ${maxRetries} attempts: ${error.message}`);
        }
      }
    }
    
    // This should never be reached, but just in case
    throw new Error('Failed to transcribe audio: Maximum retry attempts exceeded');
  } catch (error) {
    // Handle file reading errors or other non-API errors
    addLog(LOG_LEVELS.ERROR, 'transcription', 'Error reading or processing file', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Setup regex patterns for sensitive information
const patterns = {
  ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  phoneNumber: /\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/g,
  bankAccount: /\b\d{8,17}\b/g,
  routingNumber: /\b\d{9}\b/g
};

// Function to redact sensitive information in text
function redactSensitiveInfo(text) {
  let redactedText = text;
  
  Object.entries(patterns).forEach(([type, pattern]) => {
    redactedText = redactedText.replace(pattern, `[REDACTED ${type.toUpperCase()}]`);
  });
  
  return redactedText;
}

// Function to find sensitive information with timestamps
function findSensitiveInfoWithTimestamps(transcript) {
  addLog(LOG_LEVELS.INFO, 'redaction', 'Analyzing transcript for sensitive information');
  const sensitiveSections = [];
  
  // Process each word with its timing information
  if (transcript && transcript.words) {
    const words = transcript.words;
    addLog(LOG_LEVELS.INFO, 'redaction', `Analyzing ${words.length} words in the transcript`);
    
    let currentMatch = null;
    let sensitivePatternFound = null;
    
    // First, scan the entire transcript for sensitive information
    addLog(LOG_LEVELS.INFO, 'redaction', 'Scanning entire transcript for sensitive patterns');
    const fullText = words.map(w => w.word).join(' ');
    let sensitivePatterns = [];
    
    Object.entries(patterns).forEach(([type, pattern]) => {
      const matches = fullText.match(pattern);
      if (matches) {
        addLog(LOG_LEVELS.INFO, 'redaction', `Found ${matches.length} instances of ${type} in the transcript`, {
          patternType: type,
          count: matches.length,
          examples: matches.slice(0, 3).map(m => m.replace(/\d/g, '*')) // Mask the actual sensitive data in logs
        });
        
        matches.forEach(match => {
          sensitivePatterns.push({
            type,
            pattern: match
          });
        });
      }
    });
    
    addLog(LOG_LEVELS.INFO, 'redaction', `Found ${sensitivePatterns.length} total sensitive patterns in the transcript`);
    
    // Now scan each word and nearby words for these patterns
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const text = word.word;
      
      // Check if this word contains sensitive information
      let isSensitive = false;
      let matchType = '';
      
      // Check single word
      Object.entries(patterns).forEach(([type, pattern]) => {
        if (pattern.test(text)) {
          isSensitive = true;
          matchType = type;
          addLog(LOG_LEVELS.INFO, 'redaction', `Found sensitive information (${type}) at word "${text.replace(/\d/g, '*')}"`, {
            startTime: formatTimestamp(parseFloat(word.start)),
            endTime: formatTimestamp(parseFloat(word.end)),
            wordIndex: i
          });
        }
      });
      
      // Check combinations of words (up to 6 words)
      if (!isSensitive) {
        for (let windowSize = 2; windowSize <= 6 && i + windowSize <= words.length; windowSize++) {
          const wordGroup = words.slice(i, i + windowSize);
          const combinedText = wordGroup.map(w => w.word).join(' ');
          
          Object.entries(patterns).forEach(([type, pattern]) => {
            if (pattern.test(combinedText)) {
              isSensitive = true;
              matchType = type;
              addLog(LOG_LEVELS.INFO, 'redaction', `Found sensitive information (${type}) in phrase "${combinedText.replace(/\d/g, '*')}"`, {
                startTime: formatTimestamp(parseFloat(wordGroup[0].start)),
                endTime: formatTimestamp(parseFloat(wordGroup[wordGroup.length - 1].end)),
                wordIndices: Array.from({ length: windowSize }, (_, idx) => i + idx)
              });
            }
          });
          
          if (isSensitive) break;
        }
      }
      
      if (isSensitive) {
        // Look ahead and behind for context (up to 3 words)
        const contextStart = Math.max(0, i - 3);
        const contextEnd = Math.min(words.length, i + 4);
        
        if (!currentMatch) {
          // Start a new sensitive section
          currentMatch = {
            start: parseFloat(words[contextStart].start),
            end: parseFloat(word.end),
            type: matchType
          };
        } else {
          // Extend the current sensitive section
          currentMatch.end = parseFloat(word.end);
        }
      } else if (currentMatch) {
        // End the current sensitive section and add a buffer
        currentMatch.end = parseFloat(words[Math.min(i + 2, words.length - 1)].end);
        sensitiveSections.push(currentMatch);
        addLog(LOG_LEVELS.INFO, 'redaction', `Added sensitive section: ${formatTimestamp(currentMatch.start)} - ${formatTimestamp(currentMatch.end)}`, {
          type: currentMatch.type,
          startSeconds: currentMatch.start,
          endSeconds: currentMatch.end,
          durationSeconds: (currentMatch.end - currentMatch.start).toFixed(2)
        });
        currentMatch = null;
      }
    }
    
    // Add the last section if there is one
    if (currentMatch) {
      sensitiveSections.push(currentMatch);
      addLog(LOG_LEVELS.INFO, 'redaction', `Added final sensitive section: ${formatTimestamp(currentMatch.start)} - ${formatTimestamp(currentMatch.end)}`, {
        type: currentMatch.type,
        startSeconds: currentMatch.start,
        endSeconds: currentMatch.end,
        durationSeconds: (currentMatch.end - currentMatch.start).toFixed(2)
      });
    }
    
    // Merge overlapping sections
    if (sensitiveSections.length > 1) {
      addLog(LOG_LEVELS.INFO, 'redaction', 'Merging overlapping sensitive sections...');
      const mergedSections = [sensitiveSections[0]];
      
      for (let i = 1; i < sensitiveSections.length; i++) {
        const current = sensitiveSections[i];
        const previous = mergedSections[mergedSections.length - 1];
        
        // If current section overlaps with previous, merge them
        if (current.start <= previous.end + 1) {
          previous.end = Math.max(previous.end, current.end);
          addLog(LOG_LEVELS.INFO, 'redaction', `Merged overlapping sections: ${formatTimestamp(previous.start)} - ${formatTimestamp(previous.end)}`, {
            type: previous.type,
            durationSeconds: (previous.end - previous.start).toFixed(2)
          });
        } else {
          mergedSections.push(current);
        }
      }
      
      addLog(LOG_LEVELS.INFO, 'redaction', `Reduced from ${sensitiveSections.length} to ${mergedSections.length} sections after merging`);
      return mergedSections;
    }
  } else {
    addLog(LOG_LEVELS.WARNING, 'redaction', 'No words found in transcript or invalid transcript format');
  }
  
  return sensitiveSections;
}

/**
 * Primary audio redaction method using SoX (Sound eXchange)
 */
function createRedactedAudioWithSox(originalPath, sensitiveSections, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      // Create a temporary copy of the original audio
      const tempFilePath = path.join('temp', `temp_${path.basename(originalPath)}`);
      
      // First, copy the original file to a temporary location
      fs.copyFileSync(originalPath, tempFilePath);
      
      if (sensitiveSections.length === 0) {
        // No sensitive sections to redact, just copy the file
        fs.copyFileSync(tempFilePath, outputPath);
        addLog(LOG_LEVELS.SUCCESS, 'audio', 'No sensitive sections to redact, file copied successfully');
        resolve(outputPath);
        return;
      }
      
      // Copy the original file to the output path
      fs.copyFileSync(tempFilePath, outputPath);
      
      // Process each sensitive section with SoX
      const processSection = (index) => {
        if (index >= sensitiveSections.length) {
          // All sections processed
          addLog(LOG_LEVELS.SUCCESS, 'audio', 'All sensitive sections processed with SoX');
          resolve(outputPath);
          return;
        }
        
        const section = sensitiveSections[index];
        const duration = section.end - section.start;
        const beepFile = path.join('temp', `beep_${index}.wav`);
        const tempOutput = path.join('temp', `temp_output_${index}${path.extname(outputPath)}`);
        
        // Generate a beep tone
        const beepCommand = process.platform === 'win32' ? 
          `sox -n ${beepFile} synth ${duration} sine 1000` :
          `sox -n "${beepFile}" synth ${duration} sine 1000`;
        
        addLog(LOG_LEVELS.INFO, 'audio', `Generating beep tone for section ${index + 1}`, {
          command: beepCommand
        });
        
        require('child_process').exec(beepCommand, (beepError) => {
          if (beepError) {
            addLog(LOG_LEVELS.ERROR, 'audio', `Error generating beep tone for section ${index + 1}`, {
              error: beepError.message
            });
            processSection(index + 1); // Continue with next section
            return;
          }
          
          // Create a copy of the current output file
          fs.copyFileSync(outputPath, tempOutput);
          
          // Mix the beep tone with the output file at the specified position
          const mixCommand = process.platform === 'win32' ?
            `sox ${tempOutput} ${beepFile} ${outputPath} splice ${section.start},${duration} mix` :
            `sox "${tempOutput}" "${beepFile}" "${outputPath}" splice ${section.start},${duration} mix`;
          
          addLog(LOG_LEVELS.INFO, 'audio', `Mixing beep tone for section ${index + 1}`, {
            command: mixCommand
          });
          
          require('child_process').exec(mixCommand, (mixError) => {
            // Clean up temporary files
            try {
              if (fs.existsSync(beepFile)) fs.unlinkSync(beepFile);
              if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
            } catch (cleanupError) {
              addLog(LOG_LEVELS.WARNING, 'audio', `Error cleaning up temporary files for section ${index + 1}`, {
                error: cleanupError.message
              });
            }
            
            if (mixError) {
              addLog(LOG_LEVELS.ERROR, 'audio', `Error mixing beep tone for section ${index + 1}`, {
                error: mixError.message
              });
              processSection(index + 1); // Continue with next section
              return;
            }
            
            addLog(LOG_LEVELS.SUCCESS, 'audio', `Section ${index + 1} processed successfully with SoX`);
            processSection(index + 1); // Process next section
          });
        });
      };
      
      // Start processing the first section
      processSection(0);
      
    } catch (error) {
      addLog(LOG_LEVELS.ERROR, 'audio', 'Error in SoX audio redaction', {
        error: error.message,
        stack: error.stack
      });
      reject(error);
    }
  });
}

/**
 * Fallback audio redaction method using FFmpeg
 */
function createRedactedAudioWithFFmpeg(originalPath, sensitiveSections, outputPath) {
  return new Promise((resolve, reject) => {
    addLog(LOG_LEVELS.INFO, 'audio', `Applying beep sounds to ${sensitiveSections.length} sensitive sections using FFmpeg`);
    
    try {
      // Create a temporary directory for intermediate files if it doesn't exist
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }
      
      // Use a simpler approach: process each sensitive section separately
      // First, copy the original file to the output path
      fs.copyFileSync(originalPath, outputPath);
      
      // Process each sensitive section one by one
      const processSection = (index) => {
        if (index >= sensitiveSections.length) {
          // All sections processed, resolve the promise
          resolve(outputPath);
          return;
        }
        
        const section = sensitiveSections[index];
        const duration = section.end - section.start;
        
        addLog(LOG_LEVELS.INFO, 'audio', `Processing section ${index + 1}: ${formatTimestamp(section.start)} - ${formatTimestamp(section.end)}`, {
          duration: `${duration.toFixed(2)}s`,
          type: section.type
        });
        
        // Create a temporary file for this step
        const tempOutputPath = path.join(tempDir, `temp_${index}_${path.basename(outputPath)}`);
        
        // Create a simple filter to mute the section and add a beep
        const command = ffmpeg(outputPath);
        
        // Create a filter to mute the sensitive section and add a beep tone
        const filter = `volume=enable='between(t,${section.start},${section.end})':volume=0,aevalsrc=0.5*sin(1000*2*PI*t):d=${duration}:s=44100:enable='between(t,${section.start},${section.end})':volume=0.8[a]`;
        
        command.audioFilters(filter);
        
        command
          .on('start', (commandLine) => {
            addLog(LOG_LEVELS.INFO, 'audio', `FFmpeg process started for section ${index + 1}`, { commandLine });
          })
          .on('error', (err) => {
            addLog(LOG_LEVELS.ERROR, 'audio', `Error processing section ${index + 1}`, {
              error: err.message,
              stack: err.stack
            });
            
            // Continue with the next section despite errors
            processSection(index + 1);
          })
          .on('end', () => {
            addLog(LOG_LEVELS.SUCCESS, 'audio', `Section ${index + 1} processed successfully`);
            
            // Replace the output file with the temporary file
            try {
              fs.copyFileSync(tempOutputPath, outputPath);
              fs.unlinkSync(tempOutputPath);
            } catch (copyError) {
              addLog(LOG_LEVELS.WARNING, 'audio', `Error copying temporary file for section ${index + 1}`, {
                error: copyError.message
              });
            }
            
            // Process the next section
            processSection(index + 1);
          })
          .save(tempOutputPath);
      };
      
      // Start processing the first section
      processSection(0);
    } catch (error) {
      addLog(LOG_LEVELS.ERROR, 'audio', 'Error setting up FFmpeg for audio redaction', {
        error: error.message,
        stack: error.stack
      });
      reject(new Error(`Failed to set up FFmpeg audio redaction: ${error.message}`));
    }
  });
}

/**
 * Main function to create a redacted audio file with configurable redaction method
 * Uses the integrated audio processor with automatic MP3 to WAV conversion and compression
 */
async function createRedactedAudio(originalPath, sensitiveSections, outputPath, options = {}) {
  return new Promise(async (resolve, reject) => {
    // Default options
    const config = {
      redactionMethod: 'beep', // 'beep' or 'mute'
      beepVolume: 0.2,         // Lower volume (0.0-1.0)
      ...options
    };
    
    addLog(LOG_LEVELS.INFO, 'audio', 'Starting audio redaction process...', {
      originalPath,
      outputPath,
      sectionsToRedact: sensitiveSections.length,
      redactionMethod: config.redactionMethod,
      beepVolume: config.redactionMethod === 'beep' ? config.beepVolume : 'N/A',
      audioVolume: config.audioVolume
    });
    
    try {
      // Use the integrated audio processor with options
      const result = await audioProcessor.processAudio(originalPath, sensitiveSections, outputPath, config);
      
      if (result.compressed) {
        addLog(LOG_LEVELS.SUCCESS, 'audio', `Audio file processed and compressed to match original size`);
      } else if (result.converted) {
        addLog(LOG_LEVELS.SUCCESS, 'audio', `Audio file converted from ${path.extname(originalPath)} to ${result.format} and processed successfully`);
      } else if (result.fallback) {
        addLog(LOG_LEVELS.WARNING, 'audio', `Direct audio processing failed, using fallback HTML player approach`, {
          beepTrack: result.beepTrack,
          htmlPlayer: result.htmlPlayer
        });
      } else {
        addLog(LOG_LEVELS.SUCCESS, 'audio', `Audio processed successfully in ${result.format} format`);
      }
      
      resolve(result.path);
    } catch (error) {
      addLog(LOG_LEVELS.ERROR, 'audio', 'Audio redaction failed', {
        error: error.message,
        stack: error.stack
      });
      reject(new Error(`CRITICAL SECURITY ERROR: Audio redaction failed. Cannot provide unredacted audio. Technical details: ${error.message}`));
    }
  });
}

// Simple in-memory database (replace with a real database in production)
const callDatabase = [];

// Upload endpoint
app.post('/api/upload', upload.single('audio'), async (req, res) => {
  try {
    addLog(LOG_LEVELS.INFO, 'system', '=== UPLOAD PROCESS STARTED ===');
    addLog(LOG_LEVELS.INFO, 'system', 'Request received for file upload');
    
    if (!req.file) {
      addLog(LOG_LEVELS.ERROR, 'system', 'Error: No file uploaded');
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    // Get redaction options from request
    const redactionMethod = req.body.redactionMethod || 'beep';
    const beepVolume = parseFloat(req.body.beepVolume) || 0.2;
    const audioVolume = parseFloat(req.body.audioVolume) || 1.0;
    
    addLog(LOG_LEVELS.INFO, 'system', 'Redaction options received', {
      redactionMethod,
      beepVolume: beepVolume,
      audioVolume: audioVolume
    });

    const originalFilePath = req.file.path;
    const fileName = path.basename(originalFilePath);
    const mimetype = req.file.mimetype;
    
    addLog(LOG_LEVELS.INFO, 'system', `File uploaded successfully: ${req.file.originalname}`, {
      mimetype,
      path: originalFilePath,
      size: `${(req.file.size / 1024 / 1024).toFixed(2)} MB`
    });
    
    // Generate output paths
    const redactedAudioPath = path.join('processed', `redacted_${fileName}`);
    const transcriptPath = path.join('transcripts', `transcript_${fileName}.txt`);
    const redactedTranscriptPath = path.join('transcripts', `redacted_${fileName}.txt`);
    
    addLog(LOG_LEVELS.INFO, 'system', 'Output paths generated', {
      redactedAudio: redactedAudioPath,
      originalTranscript: transcriptPath,
      redactedTranscript: redactedTranscriptPath
    });
    
    // Transcribe audio
    addLog(LOG_LEVELS.INFO, 'system', '=== TRANSCRIPTION PROCESS STARTED ===');

    let transcriptionResult;
    try {
      // Use Deepgram API for transcription (with fallback mechanism)
      transcriptionResult = await transcribeAudio(originalFilePath, mimetype);
      addLog(LOG_LEVELS.SUCCESS, 'transcription', 'Transcription completed successfully');
    } catch (transcriptionError) {
      addLog(LOG_LEVELS.ERROR, 'transcription', 'Error during transcription', {
        error: transcriptionError.message,
        stack: transcriptionError.stack
      });
      return res.status(500).json({ 
        error: 'Error transcribing audio file', 
        details: process.env.NODE_ENV === 'development' ? transcriptionError.message : undefined 
      });
    }
    
    if (!transcriptionResult || !transcriptionResult.channels || 
        !transcriptionResult.channels[0] || !transcriptionResult.channels[0].alternatives || 
        !transcriptionResult.channels[0].alternatives[0]) {
      addLog(LOG_LEVELS.ERROR, 'transcription', 'Invalid transcription result structure', {
        result: JSON.stringify(transcriptionResult)
      });
      return res.status(500).json({ error: 'Invalid transcription result' });
    }
    
    const transcript = transcriptionResult.channels[0].alternatives[0].transcript || '';
    addLog(LOG_LEVELS.INFO, 'transcription', 'Transcript extracted from result', {
      length: transcript.length,
      excerpt: transcript.substring(0, 100) + (transcript.length > 100 ? '...' : '')
    });
    
    // Find sensitive sections with timestamps
    addLog(LOG_LEVELS.INFO, 'system', '=== SENSITIVE INFORMATION DETECTION STARTED ===');
    const sensitiveSections = findSensitiveInfoWithTimestamps(transcriptionResult.channels[0].alternatives[0]);
    addLog(LOG_LEVELS.INFO, 'redaction', `Found ${sensitiveSections.length} sensitive sections in the audio`);
    
    // Create redacted transcript
    addLog(LOG_LEVELS.INFO, 'redaction', 'Creating redacted transcript...');
    const redactedTranscript = redactSensitiveInfo(transcript);
    addLog(LOG_LEVELS.SUCCESS, 'redaction', 'Redacted transcript created', {
      originalLength: transcript.length,
      redactedLength: redactedTranscript.length
    });
    
    // Save original and redacted transcripts
    addLog(LOG_LEVELS.INFO, 'system', '=== SAVING TRANSCRIPTS ===');
    try {
      fs.writeFileSync(transcriptPath, transcript);
      addLog(LOG_LEVELS.SUCCESS, 'system', `Original transcript saved to: ${transcriptPath}`);
      
      fs.writeFileSync(redactedTranscriptPath, redactedTranscript);
      addLog(LOG_LEVELS.SUCCESS, 'system', `Redacted transcript saved to: ${redactedTranscriptPath}`);
    } catch (fileError) {
      addLog(LOG_LEVELS.ERROR, 'system', 'Error saving transcript files', {
        error: fileError.message,
        stack: fileError.stack
      });
      return res.status(500).json({ error: 'Error saving transcript files' });
    }
    
    // Create audio with beeps
    addLog(LOG_LEVELS.INFO, 'system', '=== AUDIO REDACTION PROCESS STARTED ===');
    addLog(LOG_LEVELS.INFO, 'audio', `Processing audio with ${sensitiveSections.length} sensitive sections`);
    
    try {
      addLog(LOG_LEVELS.INFO, 'audio', `Applying ${redactionMethod === 'beep' ? 'beep sounds' : 'muting'} to sensitive sections...`);
      await createRedactedAudio(originalFilePath, sensitiveSections, redactedAudioPath, {
        redactionMethod,
        beepVolume,
        audioVolume
      });
      
      // Verify the redacted file exists and is different from the original
      if (!fs.existsSync(redactedAudioPath)) {
        throw new Error('Redacted audio file was not created');
      }
      
      // Additional verification that redaction was successful
      const originalStat = fs.statSync(originalFilePath);
      const redactedStat = fs.statSync(redactedAudioPath);
      
      if (originalStat.size === redactedStat.size) {
        // If files are the same size, do a more thorough check
        const originalBuffer = fs.readFileSync(originalFilePath);
        const redactedBuffer = fs.readFileSync(redactedAudioPath);
        
        if (originalBuffer.equals(redactedBuffer)) {
          throw new Error('Audio redaction failed: Output file is identical to input file');
        }
      }
      
      addLog(LOG_LEVELS.SUCCESS, 'audio', `Redacted audio saved to: ${redactedAudioPath}`);
    } catch (audioError) {
      addLog(LOG_LEVELS.ERROR, 'audio', 'Error creating redacted audio', {
        error: audioError.message,
        stack: audioError.stack
      });
      
      // Delete any partially created redacted file
      if (fs.existsSync(redactedAudioPath)) {
        try {
          fs.unlinkSync(redactedAudioPath);
        } catch (unlinkError) {
          addLog(LOG_LEVELS.WARNING, 'audio', 'Failed to delete partial redacted file', {
            error: unlinkError.message
          });
        }
      }
      
      return res.status(500).json({ 
        error: 'Critical Error: Audio redaction failed', 
        details: audioError.message,
        message: 'The system cannot proceed because audio redaction failed. This is a critical security feature.'
      });
    }
    
    // Add to database
    addLog(LOG_LEVELS.INFO, 'system', '=== STORING RECORD IN DATABASE ===');
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
    addLog(LOG_LEVELS.SUCCESS, 'system', `Record added to database with ID: ${callRecord.id}`);
    
    const processingTime = ((Date.now() - new Date(req.file.path.split('/').pop().split('.')[0])) / 1000).toFixed(2);
    addLog(LOG_LEVELS.SUCCESS, 'system', '=== PROCESS COMPLETED SUCCESSFULLY ===', {
      fileName: req.file.originalname,
      sensitiveItems: sensitiveSections.length,
      processingTime: `${processingTime} seconds`
    });
    
    res.json({
      success: true,
      id: callRecord.id,
      originalFileName: req.file.originalname,
      uploadDate: callRecord.uploadDate,
      sensitiveInfoCount: sensitiveSections.length
    });
    
  } catch (error) {
    console.error('Error processing audio:', error);
    res.status(500).json({ 
      error: 'Error processing audio file',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all call recordings
app.get('/api/calls', (req, res) => {
  addLog(LOG_LEVELS.INFO, 'api', '=== API REQUEST: GET ALL RECORDINGS ===');
  addLog(LOG_LEVELS.INFO, 'api', `Found ${callDatabase.length} recordings in database`);
  
  res.json(callDatabase.map(call => ({
    id: call.id,
    originalFileName: call.originalFileName,
    uploadDate: call.uploadDate,
    sensitiveInfoCount: call.sensitiveInfoCount
  })));
  
  addLog(LOG_LEVELS.INFO, 'api', 'Returned recording list to client');
});

// Get specific call details
app.get('/api/calls/:id', (req, res) => {
  addLog(LOG_LEVELS.INFO, 'api', `=== API REQUEST: GET RECORDING DETAILS (ID: ${req.params.id}) ===`);
  
  const call = callDatabase.find(c => c.id === req.params.id);
  if (call) {
    addLog(LOG_LEVELS.INFO, 'api', `Found recording: ${call.originalFileName}`);
    res.json(call);
  } else {
    addLog(LOG_LEVELS.WARNING, 'api', `Recording not found with ID: ${req.params.id}`);
    res.status(404).json({ error: 'Call not found' });
  }
});

// Download original audio
app.get('/api/download/original/:id', (req, res) => {
  addLog(LOG_LEVELS.INFO, 'api', `=== API REQUEST: DOWNLOAD ORIGINAL AUDIO (ID: ${req.params.id}) ===`);
  
  try {
    const call = callDatabase.find(c => c.id === req.params.id);
    if (!call) {
      addLog(LOG_LEVELS.WARNING, 'api', `Recording not found with ID: ${req.params.id}`);
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    addLog(LOG_LEVELS.INFO, 'api', `Found recording: ${call.originalFileName}`);
    addLog(LOG_LEVELS.INFO, 'api', `Original file path: ${call.originalFilePath}`);
    
    if (!fs.existsSync(call.originalFilePath)) {
      addLog(LOG_LEVELS.ERROR, 'api', `Original file not found: ${call.originalFilePath}`);
      return res.status(404).json({ error: 'Original audio file not found' });
    }
    
    addLog(LOG_LEVELS.INFO, 'api', `Sending original file: ${call.originalFileName}`);
    res.download(call.originalFilePath, call.originalFileName, (err) => {
      if (err) {
        addLog(LOG_LEVELS.ERROR, 'api', `Error downloading original file: ${err.message}`);
        // Headers may already be sent, so we can't send a response here
      } else {
        addLog(LOG_LEVELS.SUCCESS, 'api', `Original file download completed: ${call.originalFileName}`);
      }
    });
  } catch (error) {
    addLog(LOG_LEVELS.ERROR, 'api', 'Error in download original endpoint', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Server error while downloading file' });
  }
});

// Download redacted audio
app.get('/api/download/redacted/:id', (req, res) => {
  addLog(LOG_LEVELS.INFO, 'api', `=== API REQUEST: DOWNLOAD REDACTED AUDIO (ID: ${req.params.id}) ===`);
  
  try {
    const call = callDatabase.find(c => c.id === req.params.id);
    if (!call) {
      addLog(LOG_LEVELS.WARNING, 'api', `Recording not found with ID: ${req.params.id}`);
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    addLog(LOG_LEVELS.INFO, 'api', `Found recording: ${call.originalFileName}`);
    addLog(LOG_LEVELS.INFO, 'api', `Redacted file path: ${call.redactedFilePath}`);
    
    if (!fs.existsSync(call.redactedFilePath)) {
      addLog(LOG_LEVELS.ERROR, 'api', `Redacted file not found: ${call.redactedFilePath}`);
      return res.status(404).json({ error: 'Redacted audio file not found' });
    }
    
    const downloadFilename = `redacted_${call.originalFileName}`;
    addLog(LOG_LEVELS.INFO, 'api', `Sending redacted file: ${downloadFilename}`);
    
    res.download(call.redactedFilePath, downloadFilename, (err) => {
      if (err) {
        addLog(LOG_LEVELS.ERROR, 'api', `Error downloading redacted file: ${err.message}`);
        // Headers may already be sent, so we can't send a response here
      } else {
        addLog(LOG_LEVELS.SUCCESS, 'api', `Redacted file download completed: ${downloadFilename}`);
      }
    });
  } catch (error) {
    addLog(LOG_LEVELS.ERROR, 'api', 'Error in download redacted endpoint', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Server error while downloading file' });
  }
});

// Download transcript
app.get('/api/download/transcript/:id', (req, res) => {
  addLog(LOG_LEVELS.INFO, 'api', `=== API REQUEST: DOWNLOAD TRANSCRIPT (ID: ${req.params.id}) ===`);
  
  try {
    const call = callDatabase.find(c => c.id === req.params.id);
    if (!call) {
      addLog(LOG_LEVELS.WARNING, 'api', `Recording not found with ID: ${req.params.id}`);
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    addLog(LOG_LEVELS.INFO, 'api', `Found recording: ${call.originalFileName}`);
    addLog(LOG_LEVELS.INFO, 'api', `Transcript file path: ${call.redactedTranscriptPath}`);
    
    if (!fs.existsSync(call.redactedTranscriptPath)) {
      addLog(LOG_LEVELS.ERROR, 'api', `Transcript file not found: ${call.redactedTranscriptPath}`);
      return res.status(404).json({ error: 'Transcript file not found' });
    }
    
    const downloadFilename = `transcript_${call.originalFileName}.txt`;
    addLog(LOG_LEVELS.INFO, 'api', `Sending transcript file: ${downloadFilename}`);
    
    res.download(call.redactedTranscriptPath, downloadFilename, (err) => {
      if (err) {
        addLog(LOG_LEVELS.ERROR, 'api', `Error downloading transcript file: ${err.message}`);
        // Headers may already be sent, so we can't send a response here
      } else {
        addLog(LOG_LEVELS.SUCCESS, 'api', `Transcript file download completed: ${downloadFilename}`);
      }
    });
  } catch (error) {
    addLog(LOG_LEVELS.ERROR, 'api', 'Error in download transcript endpoint', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Server error while downloading file' });
  }
});

// Add API endpoints for logs
app.get('/api/logs', (req, res) => {
  // Don't log every request for logs to avoid cluttering the logs
  res.json(logs);
});

// Add endpoint to clear logs
app.post('/api/logs/clear', (req, res) => {
  addLog(LOG_LEVELS.INFO, 'system', 'Clearing logs at user request');
  logs.length = 0;
  addLog(LOG_LEVELS.INFO, 'system', 'Logs cleared');
  res.json({ success: true });
});

// Start server
app.listen(port, () => {
  addLog(LOG_LEVELS.INFO, 'system', '=== AUDIO REDACTION SERVER STARTED ===');
  addLog(LOG_LEVELS.INFO, 'system', `Server running on port ${port}`);
  addLog(LOG_LEVELS.INFO, 'system', `Server time: ${new Date().toISOString()}`);
  
  addLog(LOG_LEVELS.INFO, 'system', 'API endpoints available', {
    endpoints: [
      'POST /api/upload - Upload and process audio file',
      'GET /api/calls - List all processed recordings',
      'GET /api/calls/:id - Get details for a specific recording',
      'GET /api/download/original/:id - Download original audio',
      'GET /api/download/redacted/:id - Download redacted audio',
      'GET /api/download/transcript/:id - Download transcript',
      'GET /api/logs - Get processing logs',
      'POST /api/logs/clear - Clear logs'
    ]
  });
  
  addLog(LOG_LEVELS.SUCCESS, 'system', '=== SERVER READY ===');
});
