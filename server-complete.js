// Load environment variables from .env file
require('dotenv').config();

// Set production mode
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const express = require('express');
const multer = require('multer');
const { Deepgram } = require('@deepgram/sdk');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const winston = require('winston');

// Import the fixed audio processor
const audioProcessor = require('./audio-processor-fix');

// Import database module
const db = require('./db');

// Create a structured logging system
const logs = [];
const LOG_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  SUCCESS: 'success'
};

function addLog(level, category, message, details = null) {
  // Simplify details to reduce verbosity
  let simplifiedDetails = null;
  if (details) {
    // Only include essential information in details
    if (typeof details === 'object') {
      const essentialKeys = ['error', 'count', 'status', 'type'];
      simplifiedDetails = {};
      
      for (const key of Object.keys(details)) {
        if (essentialKeys.includes(key) || key.includes('Count') || key.includes('Path')) {
          simplifiedDetails[key] = details[key];
        }
      }
      
      // If no essential keys were found, provide a simple summary
      if (Object.keys(simplifiedDetails).length === 0) {
        simplifiedDetails = 'Details available but simplified';
      }
    } else {
      simplifiedDetails = details;
    }
  }
  
  const log = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    details: simplifiedDetails
  };
  
  logs.push(log);
  console.log(`[${log.level.toUpperCase()}][${log.category}] ${log.message}`);
  
  // Keep only the last 500 logs to prevent memory issues (reduced from 1000)
  if (logs.length > 500) {
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

// Configure multer for file uploads (using memory storage instead of disk)
const storage = multer.memoryStorage();

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

// Initialize Deepgram API key from environment variables or stored key
let apiKey = process.env.DEEPGRAM_API_KEY || 'YOUR_DEEPGRAM_API_KEY';

// Try to read the API key from a file if it exists
try {
  if (fs.existsSync('deepgram-api-key.txt')) {
    const storedKey = fs.readFileSync('deepgram-api-key.txt', 'utf8').trim();
    if (storedKey) {
      apiKey = storedKey;
    }
  }
} catch (error) {
  console.error('Error reading stored API key:', error);
}

addLog(LOG_LEVELS.INFO, 'system', 'Initializing Deepgram API client', { 
  apiKeyProvided: apiKey !== 'YOUR_DEEPGRAM_API_KEY' 
});

// Function to transcribe audio using Deepgram API directly with axios
async function transcribeAudio(audioBuffer, mimetype) {
  addLog(LOG_LEVELS.INFO, 'transcription', `Transcribing audio file`, { mimetype });
  
  try {
    // Maximum number of API connection attempts
    const maxRetries = 2;
    let attempt = 1;
    
    // Deepgram API endpoint with query parameters - exactly as it worked in Postman
    const apiUrl = 'https://api.deepgram.com/v1/listen?punctuate=true&diarize=true&utterances=true&model=nova-3&smart_format=true&words=true';
    
    while (attempt <= maxRetries) {
      addLog(LOG_LEVELS.INFO, 'api', `Connecting to Deepgram API for transcription (Attempt ${attempt}/${maxRetries})...`, {
        url: apiUrl,
        fileSize: audioBuffer.length,
        mimetype: mimetype
      });
      
      try {
        const startTime = Date.now();
        
        // Make the API request using axios with the file data
        // This matches exactly the format that worked in Postman
        const response = await axios({
          method: 'post',
          url: apiUrl,
          data: audioBuffer,
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
            dataType: typeof audioBuffer,
            dataSize: audioBuffer.length
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
    addLog(LOG_LEVELS.ERROR, 'transcription', 'Error processing audio buffer', {
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
 * Main function to create a redacted audio file with configurable redaction method
 * Uses the integrated audio processor with automatic MP3 to WAV conversion and compression
 */
async function createRedactedAudio(audioBuffer, mimetype, sensitiveSections, options = {}) {
  return new Promise(async (resolve, reject) => {
    // Create a temporary file for processing
    const tempFilePath = path.join('temp', `temp_${Date.now()}${getExtensionFromMimetype(mimetype)}`);
    const tempOutputPath = path.join('temp', `output_${Date.now()}${getExtensionFromMimetype(mimetype)}`);
    
    try {
      // Write the buffer to a temporary file
      fs.writeFileSync(tempFilePath, audioBuffer);
      
      // Default options
      const config = {
        redactionMethod: 'beep', // 'beep' or 'mute'
        beepVolume: 0.2,         // Lower volume (0.0-1.0)
        ...options
      };
      
      addLog(LOG_LEVELS.INFO, 'audio', 'Starting audio redaction process...', {
        tempFilePath,
        tempOutputPath,
        sectionsToRedact: sensitiveSections.length,
        redactionMethod: config.redactionMethod,
        beepVolume: config.redactionMethod === 'beep' ? config.beepVolume : 'N/A',
        audioVolume: config.audioVolume
      });
      
      // Use the integrated audio processor with options
      const result = await audioProcessor.processAudio(tempFilePath, sensitiveSections, tempOutputPath, config);
      
      // Read the processed file back into a buffer
      const processedBuffer = fs.readFileSync(result.path);
      
      // Clean up temporary files
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
      } catch (cleanupError) {
        addLog(LOG_LEVELS.WARNING, 'audio', 'Error cleaning up temporary files', {
          error: cleanupError.message
        });
      }
      
      if (result.compressed) {
        addLog(LOG_LEVELS.SUCCESS, 'audio', `Audio file processed and compressed to match original size`);
      } else if (result.converted) {
        addLog(LOG_LEVELS.SUCCESS, 'audio', `Audio file converted from ${mimetype} to ${result.format} and processed successfully`);
      } else if (result.fallback) {
        addLog(LOG_LEVELS.WARNING, 'audio', `Direct audio processing failed, using fallback HTML player approach`, {
          beepTrack: result.beepTrack,
          htmlPlayer: result.htmlPlayer
        });
      } else {
        addLog(LOG_LEVELS.SUCCESS, 'audio', `Audio processed successfully in ${result.format} format`);
      }
      
      // Return the processed buffer and content type
      resolve({
        buffer: processedBuffer,
        contentType: getContentTypeFromFormat(result.format) || mimetype
      });
    } catch (error) {
      // Clean up temporary files
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
      } catch (cleanupError) {
        addLog(LOG_LEVELS.WARNING, 'audio', 'Error cleaning up temporary files', {
          error: cleanupError.message
        });
      }
      
      addLog(LOG_LEVELS.ERROR, 'audio', 'Audio redaction failed', {
        error: error.message,
        stack: error.stack
      });
      reject(new Error(`CRITICAL SECURITY ERROR: Audio redaction failed. Cannot provide unredacted audio. Technical details: ${error.message}`));
    }
  });
}

// Helper function to get file extension from MIME type
function getExtensionFromMimetype(mimetype) {
  switch (mimetype) {
    case 'audio/mpeg':
    case 'audio/mp3':
      return '.mp3';
    case 'audio/wav':
    case 'audio/x-wav':
      return '.wav';
    case 'audio/ogg':
      return '.ogg';
    default:
      return '.mp3'; // Default to mp3
  }
}

// Helper function to get content type from format
function getContentTypeFromFormat(format) {
  switch (format) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'ogg':
      return 'audio/ogg';
    default:
      return null;
  }
}

// API endpoint to update Deepgram API key
app.post('/api/settings/deepgram-key', express.json(), (req, res) => {
  try {
    const { apiKey: newApiKey } = req.body;
    
    if (!newApiKey || typeof newApiKey !== 'string' || newApiKey.trim() === '') {
      return res.status(400).json({ error: 'Invalid API key provided' });
    }
    
    // Store the API key in a file
    fs.writeFileSync('deepgram-api-key.txt', newApiKey.trim());
    
    // Update the current API key
    apiKey = newApiKey.trim();
    
    addLog(LOG_LEVELS.SUCCESS, 'system', 'Deepgram API key updated successfully');
    
    return res.json({ success: true });
  } catch (error) {
    addLog(LOG_LEVELS.ERROR, 'system', 'Error updating Deepgram API key', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({ error: 'Failed to update API key' });
  }
});

// Upload endpoint
app.post('/api/upload', upload.single('audio'), async (req, res) => {
  try {
    addLog(LOG_LEVELS.INFO, 'system', '=== UPLOAD PROCESS STARTED ===');
    addLog(LOG_LEVELS.INFO, 'system', 'Request received for file upload');
    
    if (!req.file) {
      addLog(LOG_LEVELS.ERROR, 'system', 'Error: No file uploaded');
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    // Get redaction options
    // Always use 'beep' as the redaction method
    const redactionMethod = 'beep';
    const beepVolume = parseFloat(req.body.beepVolume) || 0.0001; // Default to 0.01%
    const audioVolume = parseFloat(req.body.audioVolume) || 1.25; // Default to 125%
    
    addLog(LOG_LEVELS.INFO, 'system', 'Redaction options received', {
      redactionMethod,
      beepVolume: beepVolume,
      audioVolume: audioVolume
    });

    const originalFileName = req.file.originalname;
    const mimetype = req.file.mimetype;
    const audioBuffer = req.file.buffer;
    
    addLog(LOG_LEVELS.INFO, 'system', `File uploaded successfully: ${originalFileName}`, {
      mimetype,
      size: `${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`
    });
    
    // Transcribe audio
    addLog(LOG_LEVELS.INFO, 'system', '=== TRANSCRIPTION PROCESS STARTED ===');

    let transcriptionResult;
    try {
      // Use Deepgram API for transcription (with fallback mechanism)
      transcriptionResult = await transcribeAudio(audioBuffer, mimetype);
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
    
    // Create audio with beeps
    addLog(LOG_LEVELS.INFO, 'system', '=== AUDIO REDACTION PROCESS STARTED ===');
    addLog(LOG_LEVELS.INFO, 'audio', `Processing audio with ${sensitiveSections.length} sensitive sections`);
    
    try {
      addLog(LOG_LEVELS.INFO, 'audio', `Applying ${redactionMethod === 'beep' ? 'beep sounds' : 'muting'} to sensitive sections...`);
      const redactedAudio = await createRedactedAudio(audioBuffer, mimetype, sensitiveSections, {
        redactionMethod,
        beepVolume,
        audioVolume
      });
      
      // Store in database
      addLog(LOG_LEVELS.INFO, 'system', '=== STORING IN DATABASE ===');
      
      const recording = {
        originalFileName,
        sensitiveInfoCount: sensitiveSections.length
      };
      
      const storedRecording = await db.storeRecording(
        recording,
        redactedAudio.buffer,
        redactedAudio.contentType,
        redactedTranscript
      );
      
      addLog(LOG_LEVELS.SUCCESS, 'system', `Recording stored in database with ID: ${storedRecording.id}`);
      
      const processingTime = ((Date.now() - new Date(req.file.originalname.split('.')[0])) / 1000).toFixed(2);
      addLog(LOG_LEVELS.SUCCESS, 'system', '=== PROCESS COMPLETED SUCCESSFULLY ===', {
        fileName: originalFileName,
        sensitiveItems: sensitiveSections.length,
        processingTime: `${processingTime} seconds`
      });
      
      res.json({
        success: true,
        id: storedRecording.id,
        originalFileName: originalFileName,
        uploadDate: storedRecording.upload_date,
        sensitiveInfoCount: sensitiveSections.length
      });
      
    } catch (audioError) {
      addLog(LOG_LEVELS.ERROR, 'audio', 'Error creating redacted audio', {
        error: audioError.message,
        stack: audioError.stack
      });
      
      return res.status(500).json({ 
        error: 'Critical Error: Audio redaction failed', 
        details: audioError.message,
        message: 'The system cannot proceed because audio redaction failed. This is a critical security feature.'
      });
    }
  } catch (error) {
    console.error('Error processing audio:', error);
    res.status(500).json({ 
      error: 'Error processing audio file',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all call recordings
app.get('/api/calls', async (req, res) => {
  addLog(LOG_LEVELS.INFO, 'api', '=== API REQUEST: GET ALL RECORDINGS ===');
  
  try {
    const recordings = await db.getAllRecordings();
    addLog(LOG_LEVELS.INFO, 'api', `Found ${recordings.length} recordings in database`);
    
    res.json(recordings.map(recording => ({
      id: recording.id,
      originalFileName: recording.original_filename,
      uploadDate: recording.upload_date,
      sensitiveInfoCount: recording.sensitive_info_count
    })));
    
    addLog(LOG_LEVELS.INFO, 'api', 'Returned recording list to client');
  } catch (error) {
    addLog(LOG_LEVELS.ERROR, 'api', 'Error retrieving recordings from database', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ error: 'Error retrieving recordings' });
  }
});

// Get specific call details
app.get('/api/calls/:id', async (req, res) => {
  addLog(LOG_LEVELS.INFO, 'api', `=== API REQUEST: GET RECORDING DETAILS (ID: ${req.params.id}) ===`);
  
  try {
    const recording = await db.getRecordingById(req.params.id);
    
    if (recording) {
      addLog(LOG_LEVELS.INFO, 'api', `Found recording: ${recording.original_filename}`);
      res.json({
        id: recording.id,
        originalFileName: recording.original_filename,
        uploadDate: recording.upload_date,
        sensitiveInfoCount: recording.sensitive_info_count
      });
    } else {
