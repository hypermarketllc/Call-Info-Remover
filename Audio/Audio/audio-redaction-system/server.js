// server.js - Main API server for timestamp-based audio redaction

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Enable CORS
app.use(cors());

// Setup middleware
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads', { recursive: true });
    }
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // Create a unique filename
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    // Only accept audio files
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// Simple in-memory database to store processed files
const processedFiles = [];

// Load the audio processor module
const { processAudio } = require('./audio-processor');

/**
 * Process audio and add beeps at specified timestamps
 * @param {string} inputFile - Path to input file
 * @param {Array} timestamps - Array of {start, end} objects
 * @param {string} outputFile - Path for output file
 * @returns {Promise<string>} - Path to processed file
 */
async function addBeeps(inputFile, timestamps, outputFile) {
  if (!fs.existsSync(inputFile)) {
    throw new Error(`Input file not found: ${inputFile}`);
  }

  // If no timestamps provided, just copy the file
  if (!timestamps || !Array.isArray(timestamps) || timestamps.length === 0) {
    logger.warn('No timestamps provided, returning original file');
    
    fs.copyFileSync(inputFile, outputFile);
    return outputFile;
  }

  logger.info(`Redacting audio file with ${timestamps.length} timestamp(s)`, { 
    inputFile,
    outputFile
  });

  try {
    // Process audio with our custom processor
    return await processAudio(inputFile, timestamps, outputFile);
  } catch (error) {
    logger.error('Error processing audio', { error: error.message });
    throw error;
  }
}

/**
 * @api {post} /api/upload Upload audio file
 * @apiDescription Upload an audio file for redaction
 * @apiName UploadAudio
 */
app.post('/api/upload', upload.single('audio'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }
    
    const fileRecord = {
      id: Date.now().toString(),
      originalName: req.file.originalname,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadDate: new Date(),
      processed: false
    };
    
    processedFiles.push(fileRecord);
    
    const isMP3 = path.extname(req.file.originalname).toLowerCase() === '.mp3';
    
    res.json({
      success: true,
      message: 'File uploaded successfully',
      fileId: fileRecord.id,
      fileName: fileRecord.originalName,
      format: {
        extension: path.extname(fileRecord.originalName).toLowerCase(),
        isMP3: isMP3,
        redactionSupport: isMP3 ? 'html-player' : 'direct',
        note: isMP3 ? 'MP3 files will be processed with an HTML player for best results.' : null
      }
    });
  } catch (error) {
    logger.error('Error uploading file:', error);
    res.status(500).json({ error: 'Error uploading file', details: error.message });
  }
});

/**
 * @api {post} /api/redact/:fileId Redact audio file
 * @apiDescription Redact audio using provided timestamps
 * @apiName RedactAudio
 */
app.post('/api/redact/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { timestamps } = req.body;
    
    if (!timestamps || !Array.isArray(timestamps)) {
      return res.status(400).json({ 
        error: 'Invalid timestamps. Please provide an array of start and end times.' 
      });
    }
    
    // Validate timestamps
    for (const timestamp of timestamps) {
      if (typeof timestamp.start !== 'number' || typeof timestamp.end !== 'number') {
        return res.status(400).json({ 
          error: 'Invalid timestamp format. Each timestamp must have numeric start and end properties.'
        });
      }
      
      if (timestamp.start >= timestamp.end) {
        return res.status(400).json({
          error: 'Invalid timestamp range. End time must be greater than start time.'
        });
      }
    }
    
    // Find the file
    const fileRecord = processedFiles.find(f => f.id === fileId);
    if (!fileRecord) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Create output filename with the correct extension
    const originalExt = path.extname(fileRecord.originalName);
    const baseName = path.basename(fileRecord.originalName, originalExt);
    const isMP3 = originalExt.toLowerCase() === '.mp3';
    
    // Keep the extension the same for both MP3 and WAV
    const outputFile = path.join('processed', `${baseName}_redacted${originalExt}`);
    
    // Process the file
    const result = await addBeeps(fileRecord.filePath, timestamps, outputFile);
    
    // Update file record
    fileRecord.processed = true;
    fileRecord.redactedPath = result;
    fileRecord.redactedDate = new Date();
    fileRecord.timestampCount = timestamps.length;
    
    // Check for additional files
    const htmlPlayerPath = result + '.player.html';
    const beepTrackPath = result + '.beeps.wav';
    const hasHtmlPlayer = isMP3 && fs.existsSync(htmlPlayerPath);
    const hasBeepTrack = isMP3 && fs.existsSync(beepTrackPath);
    
    res.json({
      success: true,
      message: 'Audio redacted successfully',
      fileId: fileRecord.id,
      redactedFile: path.basename(result),
      timestampCount: timestamps.length,
      format: {
        originalExtension: originalExt.toLowerCase(),
        isMP3: isMP3,
        hasHtmlPlayer: hasHtmlPlayer,
        hasBeepTrack: hasBeepTrack,
        htmlPlayerPath: hasHtmlPlayer ? `/player/${fileRecord.id}` : null,
        beepTrackPath: hasBeepTrack ? `/api/download/beep-track/${fileRecord.id}` : null,
        notice: isMP3 ? 
          'MP3 file processing complete. For the best experience, use the HTML player to hear the original with beeps.' : 
          null
      }
    });
  } catch (error) {
    logger.error('Error redacting audio:', error);
    res.status(500).json({ error: 'Error redacting audio', details: error.message });
  }
});

/**
 * @api {get} /api/format-support Check format support
 * @apiDescription Check which audio formats can be fully processed
 * @apiName FormatSupport
 */
app.get('/api/format-support', (req, res) => {
  res.json({
    formats: [
      {
        extension: '.wav',
        mimeTypes: ['audio/wav', 'audio/wave', 'audio/x-wav'],
        fullSupport: true,
        description: 'WAV files are fully supported with direct beep redactions'
      },
      {
        extension: '.mp3',
        mimeTypes: ['audio/mpeg', 'audio/mp3'],
        fullSupport: true,
        description: 'MP3 files are supported with an HTML player that combines the original with beep sounds'
      }
    ],
    recommendations: [
      'WAV files are processed directly with beeps replacing sensitive content',
      'MP3 files are processed with a special HTML player that overlays beep sounds',
      'For the best MP3 experience, use the HTML player link provided after processing'
    ]
  });
});

/**
 * @api {get} /api/files List processed files
 * @apiDescription Get a list of all processed files
 * @apiName GetFiles
 */
app.get('/api/files', (req, res) => {
  // Return a simplified list without file paths
  const files = processedFiles.map(file => ({
    id: file.id,
    originalName: file.originalName,
    uploadDate: file.uploadDate,
    processed: file.processed,
    timestampCount: file.timestampCount,
    redactedDate: file.redactedDate,
    fileType: path.extname(file.originalName).toLowerCase(),
    hasHtmlPlayer: file.processed && 
                  path.extname(file.originalName).toLowerCase() === '.mp3' && 
                  fs.existsSync(file.redactedPath + '.player.html')
  }));
  
  res.json(files);
});

/**
 * @api {get} /api/download/original/:fileId Download original file
 * @apiDescription Download the original audio file
 * @apiName DownloadOriginal
 */
app.get('/api/download/original/:fileId', (req, res) => {
  const { fileId } = req.params;
  
  const fileRecord = processedFiles.find(f => f.id === fileId);
  if (!fileRecord || !fs.existsSync(fileRecord.filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.download(fileRecord.filePath, fileRecord.originalName);
});

/**
 * @api {get} /api/download/redacted/:fileId Download redacted file
 * @apiDescription Download the redacted audio file
 * @apiName DownloadRedacted
 */
app.get('/api/download/redacted/:fileId', (req, res) => {
  const { fileId } = req.params;
  
  const fileRecord = processedFiles.find(f => f.id === fileId);
  if (!fileRecord || !fileRecord.processed || !fs.existsSync(fileRecord.redactedPath)) {
    return res.status(404).json({ error: 'Redacted file not found' });
  }
  
  // Create a download filename
  const originalExt = path.extname(fileRecord.originalName);
  const baseName = path.basename(fileRecord.originalName, originalExt);
  const downloadName = `${baseName}_redacted${originalExt}`;
  
  res.download(fileRecord.redactedPath, downloadName);
});

/**
 * @api {get} /api/download/beep-track/:fileId Download beep track
 * @apiDescription Download just the beep sound track for an MP3 file
 * @apiName DownloadBeepTrack
 */
app.get('/api/download/beep-track/:fileId', (req, res) => {
  const { fileId } = req.params;
  
  const fileRecord = processedFiles.find(f => f.id === fileId);
  if (!fileRecord || !fileRecord.processed) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  const beepTrackPath = fileRecord.redactedPath + '.beeps.wav';
  if (!fs.existsSync(beepTrackPath)) {
    return res.status(404).json({ error: 'Beep track not found' });
  }
  
  // Create a download filename
  const baseName = path.basename(fileRecord.originalName, path.extname(fileRecord.originalName));
  const downloadName = `${baseName}_beep_track.wav`;
  
  res.download(beepTrackPath, downloadName);
});

/**
 * @api {get} /player/:fileId Display HTML player for redacted audio
 * @apiDescription Display an HTML player that plays the original MP3 with beeps
 * @apiName AudioPlayer
 */
app.get('/player/:fileId', (req, res) => {
  const { fileId } = req.params;
  
  const fileRecord = processedFiles.find(f => f.id === fileId);
  if (!fileRecord || !fileRecord.processed) {
    return res.status(404).send('File not found');
  }
  
  const htmlPlayerPath = fileRecord.redactedPath + '.player.html';
  if (!fs.existsSync(htmlPlayerPath)) {
    return res.status(404).send('Player not found for this file');
  }
  
  // Read the HTML file
  const htmlContent = fs.readFileSync(htmlPlayerPath, 'utf8');
  
  // Send the HTML content
  res.send(htmlContent);
});

/**
 * @api {post} /api/batch-redact Batch redact an audio file
 * @apiDescription Upload and process an audio file with timestamps in a single request
 * @apiName BatchRedact
 */
app.post('/api/batch-redact', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }
    
    let timestamps = req.body.timestamps;
    
    // Parse timestamps if they're sent as a string
    if (typeof timestamps === 'string') {
      try {
        timestamps = JSON.parse(timestamps);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid timestamps format' });
      }
    }
    
    if (!timestamps || !Array.isArray(timestamps)) {
      return res.status(400).json({ 
        error: 'Invalid timestamps. Please provide an array of start and end times.' 
      });
    }
    
    // Create output filename with the correct extension
    const originalExt = path.extname(req.file.originalname);
    const baseName = path.basename(req.file.originalname, originalExt);
    const isMP3 = originalExt.toLowerCase() === '.mp3';
    
    // Keep the original extension
    const outputFile = path.join('processed', `${baseName}_redacted${originalExt}`);
    
    // Process the file
    const redactedPath = await addBeeps(req.file.path, timestamps, outputFile);
    
    // Create file record
    const fileRecord = {
      id: Date.now().toString(),
      originalName: req.file.originalname,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadDate: new Date(),
      processed: true,
      redactedPath: redactedPath,
      redactedDate: new Date(),
      timestampCount: timestamps.length
    };
    
    processedFiles.push(fileRecord);
    
    // Check for additional files
    const htmlPlayerPath = redactedPath + '.player.html';
    const beepTrackPath = redactedPath + '.beeps.wav';
    const hasHtmlPlayer = isMP3 && fs.existsSync(htmlPlayerPath);
    const hasBeepTrack = isMP3 && fs.existsSync(beepTrackPath);
    
    res.json({
      success: true,
      message: 'Audio processed successfully',
      fileId: fileRecord.id,
      redactedFile: path.basename(redactedPath),
      timestampCount: timestamps.length,
      format: {
        originalExtension: originalExt.toLowerCase(),
        isMP3: isMP3,
        hasHtmlPlayer: hasHtmlPlayer,
        hasBeepTrack: hasBeepTrack,
        htmlPlayerPath: hasHtmlPlayer ? `/player/${fileRecord.id}` : null,
        beepTrackPath: hasBeepTrack ? `/api/download/beep-track/${fileRecord.id}` : null,
        notice: isMP3 ? 
          'MP3 file processing complete. For the best experience, use the HTML player to hear the original with beeps.' : 
          null
      }
    });
  } catch (error) {
    logger.error('Error processing audio:', error);
    res.status(500).json({ error: 'Error processing audio', details: error.message });
  }
});

// Error handler middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
app.listen(port, () => {
  logger.info(`Audio Redaction Server running on port ${port}`);
  logger.info(`MP3 support: Enabled with HTML player`);
});