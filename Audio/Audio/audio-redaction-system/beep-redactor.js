// beep-redactor.js
// A dedicated audio redaction module that accepts audio files and timestamps

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
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
    new transports.File({ filename: 'redaction.log' }),
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    })
  ]
});

class AudioRedactor {
  /**
   * Constructor for the AudioRedactor class
   */
  constructor() {
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  ensureDirectories() {
    const dirs = ['uploads', 'processed'];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    });
  }

  /**
   * Add beep sounds to an audio file at specified timestamps
   * @param {string} inputFile - Path to the input audio file
   * @param {Array<{start: number, end: number}>} timestamps - Array of objects with start and end times (in seconds)
   * @param {string} outputFile - Path for the output file (optional, will generate one if not provided)
   * @returns {Promise<string>} - Path to the processed audio file
   */
  async addBeeps(inputFile, timestamps, outputFile = null) {
    if (!fs.existsSync(inputFile)) {
      throw new Error(`Input file not found: ${inputFile}`);
    }

    if (!timestamps || !Array.isArray(timestamps) || timestamps.length === 0) {
      logger.warn('No timestamps provided, returning original file');
      
      // If no output file specified, create one
      if (!outputFile) {
        const ext = path.extname(inputFile);
        const baseName = path.basename(inputFile, ext);
        outputFile = path.join('processed', `${baseName}_redacted${ext}`);
      }
      
      // No redaction needed, just copy the file
      fs.copyFileSync(inputFile, outputFile);
      return outputFile;
    }

    // If no output file specified, create one
    if (!outputFile) {
      const ext = path.extname(inputFile);
      const baseName = path.basename(inputFile, ext);
      outputFile = path.join('processed', `${baseName}_redacted${ext}`);
    }

    logger.info(`Redacting audio file with ${timestamps.length} timestamp(s)`, { 
      inputFile,
      outputFile
    });

    // First try SoX for reliable audio processing
    try {
      return await this.processWithSox(inputFile, timestamps, outputFile);
    } catch (error) {
      logger.warn(`SoX processing failed: ${error.message}, trying fallback method`);
      
      // Fallback to FFmpeg if SoX fails
      try {
        return await this.processWithFFmpeg(inputFile, timestamps, outputFile);
      } catch (ffmpegError) {
        logger.error(`FFmpeg processing also failed: ${ffmpegError.message}`);
        throw new Error(`All audio processing methods failed: ${ffmpegError.message}`);
      }
    }
  }

  /**
   * Process audio using SoX
   * @param {string} inputFile - Path to input file
   * @param {Array<{start: number, end: number}>} timestamps - Timestamps for beeps
   * @param {string} outputFile - Path for output file
   * @returns {Promise<string>} - Path to processed file
   */
  async processWithSox(inputFile, timestamps, outputFile) {
    return new Promise((resolve, reject) => {
      // Create a temporary copy for processing
      const tempFile = `${outputFile}.temp`;
      
      // First, convert/normalize the input file
      const convertArgs = [
        inputFile,         // Input file
        tempFile,          // Output to temp file
        'gain', '-n'       // Normalize audio
      ];
      
      logger.debug('Running SoX conversion', { convertArgs });
      
      const convertProcess = spawn('sox', convertArgs);
      
      convertProcess.on('error', (err) => {
        logger.error('SoX spawn error', { error: err.message });
        reject(new Error(`SoX error: ${err.message}`));
      });
      
      let errorOutput = '';
      convertProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        logger.debug(`SoX stderr: ${data}`);
      });
      
      convertProcess.on('close', async (code) => {
        if (code !== 0) {
          return reject(new Error(`SoX conversion failed with code ${code}: ${errorOutput}`));
        }
        
        try {
          // Make a copy of the temp file to the output file
          fs.copyFileSync(tempFile, outputFile);
          
          // Process each timestamp sequentially
          for (let i = 0; i < timestamps.length; i++) {
            const timestamp = timestamps[i];
            const duration = timestamp.end - timestamp.start;
            
            if (duration <= 0) {
              logger.warn(`Invalid timestamp duration: ${duration}s, skipping`, timestamp);
              continue;
            }
            
            const tempOutput = `${outputFile}.beep${i}`;
            
            // Add beep at this timestamp
            const beepArgs = [
              outputFile,                                 // Input file
              tempOutput,                                 // Output to temp file
              'synth', `${duration}`, 'sine', '1000',     // Generate 1kHz sine wave
              'fade', 'q', '0.01', `${duration}`, '0.01', // Quick fade in/out
              'gain', '-10',                              // Lower volume a bit
              'pad', `${timestamp.start}`, '0',           // Pad before beep
              'trim', '0', `${timestamp.end + 0.1}`       // Trim to needed length
            ];
            
            logger.debug(`Adding beep for timestamp`, { 
              timestamp, 
              beepArgs
            });
            
            const beepProcess = spawn('sox', beepArgs);
            
            await new Promise((resolveBeep, rejectBeep) => {
              beepProcess.on('error', (err) => {
                logger.error('Beep process error', { error: err.message });
                rejectBeep(err);
              });
              
              let beepErrorOutput = '';
              beepProcess.stderr.on('data', (data) => {
                beepErrorOutput += data.toString();
                logger.debug(`Beep stderr: ${data}`);
              });
              
              beepProcess.on('close', (code) => {
                if (code !== 0) {
                  return rejectBeep(new Error(`Beep process failed with code ${code}: ${beepErrorOutput}`));
                }
                
                // Mix the beep with the original audio
                const mixArgs = [
                  '-m',       // Mix option
                  outputFile, // Original audio
                  tempOutput, // Beep audio
                  tempFile    // Output file
                ];
                
                logger.debug('Mixing beep with original', { mixArgs });
                
                const mixProcess = spawn('sox', mixArgs);
                
                let mixErrorOutput = '';
                mixProcess.stderr.on('data', (data) => {
                  mixErrorOutput += data.toString();
                  logger.debug(`Mix stderr: ${data}`);
                });
                
                mixProcess.on('error', (err) => {
                  logger.error('Mix process error', { error: err.message });
                  rejectBeep(err);
                });
                
                mixProcess.on('close', (code) => {
                  if (code !== 0) {
                    return rejectBeep(new Error(`Mix process failed with code ${code}: ${mixErrorOutput}`));
                  }
                  
                  // Copy the temp file back to the output
                  fs.copyFileSync(tempFile, outputFile);
                  
                  // Try to clean up temp files
                  try {
                    fs.unlinkSync(tempOutput);
                  } catch (e) {
                    logger.warn(`Couldn't remove temp file: ${tempOutput}`);
                  }
                  
                  resolveBeep();
                });
              });
            });
          }
          
          // Clean up the temp file
          try {
            fs.unlinkSync(tempFile);
          } catch (e) {
            logger.warn(`Couldn't remove temp file: ${tempFile}`);
          }
          
          logger.info('Audio redaction complete with SoX', { outputFile });
          resolve(outputFile);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Process audio using FFmpeg (fallback method)
   * @param {string} inputFile - Path to input file
   * @param {Array<{start: number, end: number}>} timestamps - Timestamps for beeps
   * @param {string} outputFile - Path for output file
   * @returns {Promise<string>} - Path to processed file
   */
  async processWithFFmpeg(inputFile, timestamps, outputFile) {
    return new Promise((resolve, reject) => {
      // Generate a filter complex string for FFmpeg
      let filterComplex = '';
      
      // Start with the input audio stream
      filterComplex += '[0:a]';
      
      // Add a volume filter for each timestamp to mute the original audio
      timestamps.forEach((timestamp, i) => {
        if (i === 0) {
          filterComplex += `volume=enable='between(t,${timestamp.start},${timestamp.end})':volume=0[muted${i}];`;
          if (timestamps.length === 1) {
            filterComplex += `[muted${i}]`;
          }
        } else {
          filterComplex += `[muted${i-1}]volume=enable='between(t,${timestamp.start},${timestamp.end})':volume=0[muted${i}];`;
          if (i === timestamps.length - 1) {
            filterComplex += `[muted${i}]`;
          }
        }
      });
      
      // Finalize the filter with beep sound generation
      filterComplex += 'asplit[out]';
      
      // Add beep tone generation for each timestamp
      timestamps.forEach((timestamp, i) => {
        const duration = timestamp.end - timestamp.start;
        if (duration <= 0) return;
        
        filterComplex += `;aevalsrc=0.5*sin(1000*2*PI*t):d=${duration}:s=44100[beep${i}];`;
        filterComplex += `[beep${i}]adelay=${Math.floor(timestamp.start * 1000)}|${Math.floor(timestamp.start * 1000)}[delayed${i}];`;
      });
      
      // Mix all streams together
      if (timestamps.length > 0) {
        filterComplex += '[out]';
        timestamps.forEach((_, i) => {
          filterComplex += `[delayed${i}]`;
        });
        filterComplex += `amix=inputs=${timestamps.length + 1}:normalize=0[final]`;
      } else {
        filterComplex += '[final]';
      }
      
      // Build FFmpeg command
      const ffmpegArgs = [
        '-i', inputFile,
        '-filter_complex', filterComplex,
        '-map', '[final]',
        '-c:a', 'libmp3lame',
        '-q:a', '2', // High quality
        outputFile
      ];
      
      logger.debug('Running FFmpeg', { ffmpegArgs });
      
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
      
      ffmpegProcess.on('error', (err) => {
        logger.error('FFmpeg spawn error', { error: err.message });
        reject(new Error(`FFmpeg error: ${err.message}`));
      });
      
      let errorOutput = '';
      ffmpegProcess.stderr.on('data', (data) => {
        // FFmpeg outputs to stderr by default
        errorOutput += data.toString();
        logger.debug(`FFmpeg output: ${data}`);
      });
      
      ffmpegProcess.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`FFmpeg failed with code ${code}: ${errorOutput}`));
        }
        
        logger.info('Audio redaction complete with FFmpeg', { outputFile });
        resolve(outputFile);
      });
    });
  }
  
  /**
   * Batch process multiple timestamps and generate a single output file
   * @param {string} inputFile - Path to the input audio file
   * @param {Array<{start: number, end: number, label: string}>} timestamps - Array of labeled timestamp objects
   * @param {string} outputFile - Optional output file path
   * @returns {Promise<Object>} - Object with paths and processing information
   */
  async batchProcess(inputFile, timestamps, outputFile = null) {
    logger.info(`Batch processing audio with ${timestamps.length} timestamps`, { 
      inputFile, 
      timestampCount: timestamps.length 
    });
    
    // Process the entire file at once
    const result = await this.addBeeps(inputFile, timestamps, outputFile);
    
    return {
      originalFile: inputFile,
      redactedFile: result,
      timestampCount: timestamps.length,
      processedAt: new Date()
    };
  }
}

module.exports = AudioRedactor;