// mp3-to-wav-converter.js
// A pure JavaScript implementation for converting MP3 to WAV using ffmpeg-static
// This avoids requiring system-level installations

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'conversion.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

/**
 * Convert MP3 file to WAV format
 * @param {string} inputPath - Path to input MP3 file
 * @param {string} outputPath - Path for output WAV file (optional)
 * @returns {Promise<string>} - Path to the converted WAV file
 */
async function convertMP3ToWAV(inputPath, outputPath = null) {
  return new Promise((resolve, reject) => {
    try {
      // Ensure input file exists
      if (!fs.existsSync(inputPath)) {
        return reject(new Error(`Input file does not exist: ${inputPath}`));
      }
      
      // If no output path provided, create one
      if (!outputPath) {
        const inputBaseName = path.basename(inputPath, path.extname(inputPath));
        outputPath = path.join(path.dirname(inputPath), `${inputBaseName}.wav`);
      }
      
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      logger.info(`Converting MP3 to WAV: ${inputPath} -> ${outputPath}`);
      
      // Use FFmpeg for conversion
      const ffmpegProcess = spawn(ffmpegStatic, [
        '-i', inputPath,     // Input file
        '-acodec', 'pcm_s16le', // Output codec (16-bit PCM)
        '-ar', '44100',      // Sample rate (44.1 kHz)
        '-ac', '2',          // Channels (stereo)
        outputPath           // Output file
      ]);
      
      let errorOutput = '';
      
      ffmpegProcess.stderr.on('data', (data) => {
        // FFmpeg outputs progress information to stderr
        const message = data.toString();
        errorOutput += message;
        
        // Log progress but avoid excessive logging
        if (message.includes('time=')) {
          const timeMatch = message.match(/time=([0-9:.]+)/);
          if (timeMatch) {
            logger.debug(`Conversion progress: ${timeMatch[1]}`);
          }
        }
      });
      
      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          // Conversion successful
          logger.info(`Conversion complete: ${outputPath}`);
          resolve(outputPath);
        } else {
          // Conversion failed
          logger.error(`FFmpeg exited with code ${code}`);
          logger.error(`Error output: ${errorOutput}`);
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
      
      ffmpegProcess.on('error', (err) => {
        logger.error(`Failed to start FFmpeg process: ${err.message}`);
        reject(err);
      });
      
    } catch (error) {
      logger.error(`Error in convertMP3ToWAV: ${error.message}`);
      reject(error);
    }
  });
}

/**
 * Check if a file is an MP3
 * @param {string} filePath - Path to the file
 * @returns {boolean} - True if the file is an MP3
 */
function isMP3(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.mp3';
}

/**
 * Check if the converter is available
 * @returns {boolean} - True if FFmpeg is available
 */
function isConverterAvailable() {
  return !!ffmpegStatic;
}

/**
 * Auto-convert an audio file to WAV if it's an MP3
 * @param {string} inputPath - Path to input audio file
 * @returns {Promise<{path: string, converted: boolean}>} - Path to WAV file and whether conversion occurred
 */
async function autoConvertToWAV(inputPath) {
  // Check if it's already a WAV file
  if (path.extname(inputPath).toLowerCase() === '.wav') {
    return { path: inputPath, converted: false };
  }
  
  // Check if it's an MP3 file
  if (isMP3(inputPath)) {
    // Convert to WAV
    const wavPath = inputPath + '.wav';
    try {
      const convertedPath = await convertMP3ToWAV(inputPath, wavPath);
      return { path: convertedPath, converted: true };
    } catch (error) {
      logger.error(`Failed to convert MP3 to WAV: ${error.message}`);
      return { path: inputPath, converted: false, error: error.message };
    }
  }
  
  // Not an MP3 or WAV, return original
  return { path: inputPath, converted: false };
}

module.exports = {
  convertMP3ToWAV,
  isMP3,
  isConverterAvailable,
  autoConvertToWAV
};