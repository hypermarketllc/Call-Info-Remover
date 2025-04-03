// integrated-audio-processor.js
// A comprehensive audio processing module that handles MP3 to WAV conversion and redaction

const fs = require('fs');
const path = require('path');
const NodeWav = require('node-wav');
const ffmpegStatic = require('ffmpeg-static');
const { spawn } = require('child_process');
const winston = require('winston');
const { execSync } = require('child_process');
const os = require('os');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'audio-processing.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

/**
 * Convert MP3 file to WAV format with robust error handling and retries
 * @param {string} inputPath - Path to input MP3 file
 * @param {string} outputPath - Path for output WAV file (optional)
 * @param {number} retryCount - Number of retry attempts (default: 3)
 * @returns {Promise<string>} - Path to the converted WAV file
 */
async function convertMP3ToWAV(inputPath, outputPath = null, retryCount = 3) {
  return new Promise(async (resolve, reject) => {
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
      
      // Try primary conversion method
      try {
        await convertWithFFmpeg(inputPath, outputPath);
        
        // Verify the converted file
        if (await verifyWavFile(outputPath)) {
          logger.info(`MP3 to WAV conversion successful: ${outputPath}`);
          return resolve(outputPath);
        } else {
          throw new Error('Converted WAV file verification failed');
        }
      } catch (primaryError) {
        logger.warn(`Primary conversion method failed: ${primaryError.message}`);
        
        // If we have retries left, try alternative methods
        if (retryCount > 0) {
          logger.info(`Retrying conversion with alternative parameters (${retryCount} attempts left)`);
          
          try {
            // Try with alternative parameters
            await convertWithFFmpegAlternative(inputPath, outputPath);
            
            // Verify the converted file
            if (await verifyWavFile(outputPath)) {
              logger.info(`MP3 to WAV conversion successful with alternative method: ${outputPath}`);
              return resolve(outputPath);
            } else {
              throw new Error('Converted WAV file verification failed with alternative method');
            }
          } catch (alternativeError) {
            logger.warn(`Alternative conversion method failed: ${alternativeError.message}`);
            
            // Recursive retry with decremented counter and delay
            setTimeout(() => {
              convertMP3ToWAV(inputPath, outputPath, retryCount - 1)
                .then(resolve)
                .catch(reject);
            }, 1000); // 1 second delay between retries
          }
        } else {
          // No more retries, reject with error
          reject(new Error(`Failed to convert MP3 to WAV after multiple attempts: ${primaryError.message}`));
        }
      }
    } catch (error) {
      logger.error(`Error in convertMP3ToWAV: ${error.message}`);
      reject(error);
    }
  });
}

/**
 * Primary conversion method using FFmpeg
 * @param {string} inputPath - Path to input MP3 file
 * @param {string} outputPath - Path for output WAV file
 * @returns {Promise<void>} - Resolves when conversion is complete
 */
function convertWithFFmpeg(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
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
        resolve();
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
    
    // Set a timeout to prevent hanging
    const timeout = setTimeout(() => {
      ffmpegProcess.kill();
      reject(new Error('FFmpeg conversion timed out after 5 minutes'));
    }, 5 * 60 * 1000); // 5 minutes
    
    ffmpegProcess.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

/**
 * Alternative conversion method with different FFmpeg parameters
 * @param {string} inputPath - Path to input MP3 file
 * @param {string} outputPath - Path for output WAV file
 * @returns {Promise<void>} - Resolves when conversion is complete
 */
function convertWithFFmpegAlternative(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    // Use FFmpeg with alternative parameters
    const ffmpegProcess = spawn(ffmpegStatic, [
      '-i', inputPath,     // Input file
      '-acodec', 'pcm_s16le', // Output codec (16-bit PCM)
      '-ar', '48000',      // Alternative sample rate (48 kHz)
      '-ac', '2',          // Channels (stereo)
      '-af', 'aresample=resampler=soxr', // High quality resampling
      outputPath           // Output file
    ]);
    
    let errorOutput = '';
    
    ffmpegProcess.stderr.on('data', (data) => {
      const message = data.toString();
      errorOutput += message;
    });
    
    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        logger.error(`Alternative FFmpeg conversion exited with code ${code}`);
        logger.error(`Error output: ${errorOutput}`);
        reject(new Error(`Alternative FFmpeg conversion exited with code ${code}`));
      }
    });
    
    ffmpegProcess.on('error', (err) => {
      logger.error(`Failed to start alternative FFmpeg process: ${err.message}`);
      reject(err);
    });
    
    // Set a timeout to prevent hanging
    const timeout = setTimeout(() => {
      ffmpegProcess.kill();
      reject(new Error('Alternative FFmpeg conversion timed out after 5 minutes'));
    }, 5 * 60 * 1000); // 5 minutes
    
    ffmpegProcess.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

/**
 * Verify that a WAV file is valid and can be read
 * @param {string} filePath - Path to WAV file
 * @returns {Promise<boolean>} - True if file is valid
 */
async function verifyWavFile(filePath) {
  return new Promise((resolve) => {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        logger.error(`WAV file does not exist: ${filePath}`);
        return resolve(false);
      }
      
      // Check file size
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        logger.error(`WAV file is empty: ${filePath}`);
        return resolve(false);
      }
      
      // Try to read and decode the WAV file
      const wavBuffer = fs.readFileSync(filePath);
      try {
        const wavData = NodeWav.decode(wavBuffer);
        
        // Check if the decoded data has valid properties
        if (!wavData || !wavData.channelData || wavData.channelData.length === 0) {
          logger.error(`WAV file has invalid data structure: ${filePath}`);
          return resolve(false);
        }
        
        // Check if the audio data is not empty
        if (wavData.channelData[0].length === 0) {
          logger.error(`WAV file has empty audio data: ${filePath}`);
          return resolve(false);
        }
        
        logger.info(`WAV file verified successfully: ${filePath}`);
        return resolve(true);
      } catch (decodeError) {
        logger.error(`Failed to decode WAV file: ${decodeError.message}`);
        return resolve(false);
      }
    } catch (error) {
      logger.error(`Error verifying WAV file: ${error.message}`);
      return resolve(false);
    }
  });
}

/**
 * Process WAV file with configurable redaction method (beep or mute) at specified timestamps
 * @param {string} inputPath - Path to input WAV file
 * @param {Array} timestamps - Array of {start, end} objects
 * @param {string} outputPath - Path for output file
 * @param {Object} options - Configuration options
 * @returns {Promise<string>} - Path to processed file
 */
async function processWavFile(inputPath, timestamps, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      // Default options
      const config = {
        redactionMethod: 'beep', // 'beep' or 'mute'
        beepVolume: 0.2,         // Lower volume (0.0-1.0)
        ...options
      };
      
      // Read and decode the WAV file
      const wavBuffer = fs.readFileSync(inputPath);
      let wavData;
      
      try {
        wavData = NodeWav.decode(wavBuffer);
      } catch (error) {
        logger.error(`Error decoding WAV file: ${error.message}`);
        return reject(new Error(`Invalid or corrupted WAV file: ${error.message}`));
      }
      
      // Extract audio parameters
      const audioData = wavData.channelData;
      const sampleRate = wavData.sampleRate;
      const numChannels = audioData.length;
      
      logger.info(`Processing WAV: ${sampleRate}Hz, ${numChannels} channels`);
      logger.info(`Redaction method: ${config.redactionMethod}${config.redactionMethod === 'beep' ? `, volume: ${config.beepVolume}` : ''}`);
      
      // For each timestamp, apply the selected redaction method
      timestamps.forEach(timestamp => {
        const startSample = Math.floor(timestamp.start * sampleRate);
        const endSample = Math.floor(timestamp.end * sampleRate);
        
        if (config.redactionMethod === 'mute') {
          logger.info(`Muting audio from ${timestamp.start}s to ${timestamp.end}s (samples ${startSample}-${endSample})`);
          
          // Mute the sensitive section (set samples to zero)
          for (let i = startSample; i < endSample; i++) {
            if (i < audioData[0].length) {
              // Set sample to zero (silence) for all channels
              for (let channel = 0; channel < numChannels; channel++) {
                audioData[channel][i] = 0;
              }
            }
          }
        } else {
          logger.info(`Adding beep (volume: ${config.beepVolume}) from ${timestamp.start}s to ${timestamp.end}s (samples ${startSample}-${endSample})`);
          
          // Generate beep tone with configurable volume (1kHz sine wave)
          for (let i = startSample; i < endSample; i++) {
            if (i < audioData[0].length) {
              const t = (i - startSample) / sampleRate;
              // Apply volume adjustment to beep
              const sample = config.beepVolume * Math.sin(2 * Math.PI * 1000 * t);
              
              // Apply to all channels
              for (let channel = 0; channel < numChannels; channel++) {
                audioData[channel][i] = sample;
              }
            }
          }
        }
      });
      
      // Encode back to WAV with more efficient settings (16-bit instead of 32-bit float)
      const encoded = NodeWav.encode(audioData, {
        sampleRate: sampleRate,
        float: false,
        bitDepth: 16
      });
      
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Write to file
      fs.writeFileSync(outputPath, encoded);
      
      // Verify the output file
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        logger.info(`Processed WAV file saved to ${outputPath}`);
        resolve(outputPath);
      } else {
        reject(new Error('Failed to write processed WAV file'));
      }
    } catch (error) {
      logger.error(`Error processing WAV file: ${error.message}`);
      reject(error);
    }
  });
}

/**
 * Compress audio file to match target size using FFmpeg
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputPath - Path for output file
 * @param {number} targetSize - Target file size in bytes
 * @returns {Promise<string>} - Path to compressed file
 */
async function compressAudioFile(inputPath, outputPath, targetSize) {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info(`Compressing audio file to match target size: ${(targetSize / 1024 / 1024).toFixed(2)} MB`);
      
      // Start with medium quality
      let bitrate = 128;
      let attempt = 0;
      const maxAttempts = 3;
      
      // Try different bitrates until we get close to target size or reach max attempts
      while (attempt < maxAttempts) {
        attempt++;
        logger.info(`Compression attempt ${attempt}/${maxAttempts} with bitrate: ${bitrate}kbps`);
        
        try {
          await compressWithBitrate(inputPath, outputPath, bitrate);
          
          // Check if file exists and get its size
          if (fs.existsSync(outputPath)) {
            const compressedStats = fs.statSync(outputPath);
            const compressedSize = compressedStats.size;
            
            logger.info(`Compressed file size: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
            
            // If we're within 10% of target size, we're done
            if (Math.abs(compressedSize - targetSize) / targetSize < 0.1) {
              logger.info(`Compression successful, file size is within 10% of target`);
              return resolve(outputPath);
            }
            
            // Adjust bitrate based on result
            const ratio = targetSize / compressedSize;
            const newBitrate = Math.floor(bitrate * ratio);
            
            logger.info(`Adjusting bitrate: ${bitrate}kbps -> ${newBitrate}kbps (ratio: ${ratio.toFixed(2)})`);
            
            // Keep bitrate in reasonable range
            bitrate = Math.max(64, Math.min(320, newBitrate));
          } else {
            logger.error(`Compressed file not created: ${outputPath}`);
            throw new Error('Compressed file not created');
          }
        } catch (error) {
          logger.error(`Compression attempt ${attempt} failed: ${error.message}`);
          
          // If this is the last attempt, try a more conservative approach
          if (attempt === maxAttempts - 1) {
            logger.warn(`Trying final compression with conservative bitrate: 96kbps`);
            bitrate = 96;
          }
        }
      }
      
      // If we've reached max attempts, use the last result
      if (fs.existsSync(outputPath)) {
        logger.warn(`Could not achieve target size after ${maxAttempts} attempts, using best effort result`);
        resolve(outputPath);
      } else {
        reject(new Error(`Failed to compress audio file after ${maxAttempts} attempts`));
      }
    } catch (error) {
      logger.error(`Error in compressAudioFile: ${error.message}`);
      reject(error);
    }
  });
}

/**
 * Compress audio file with specific bitrate
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputPath - Path for output file
 * @param {number} bitrate - Target bitrate in kbps
 * @returns {Promise<string>} - Path to compressed file
 */
async function compressWithBitrate(inputPath, outputPath, bitrate) {
  return new Promise((resolve, reject) => {
    // Use FFmpeg to compress the audio
    const ffmpegProcess = spawn(ffmpegStatic, [
      '-i', inputPath,           // Input file
      '-c:a', 'libmp3lame',      // MP3 codec
      '-b:a', `${bitrate}k`,     // Bitrate
      '-y',                      // Overwrite output file
      outputPath                 // Output file
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
          logger.debug(`Compression progress: ${timeMatch[1]}`);
        }
      }
    });
    
    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        // Compression successful
        logger.info(`Compression with bitrate ${bitrate}kbps completed successfully`);
        resolve(outputPath);
      } else {
        // Compression failed
        logger.error(`FFmpeg compression exited with code ${code}`);
        logger.error(`Error output: ${errorOutput}`);
        reject(new Error(`FFmpeg compression exited with code ${code}`));
      }
    });
    
    ffmpegProcess.on('error', (err) => {
      logger.error(`Failed to start FFmpeg compression process: ${err.message}`);
      reject(err);
    });
    
    // Set a timeout to prevent hanging
    const timeout = setTimeout(() => {
      ffmpegProcess.kill();
      reject(new Error('FFmpeg compression timed out after 5 minutes'));
    }, 5 * 60 * 1000); // 5 minutes
    
    ffmpegProcess.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

/**
 * Main function to process audio file with automatic MP3 to WAV conversion and compression
 * @param {string} inputPath - Path to input audio file
 * @param {Array} timestamps - Array of {start, end} objects
 * @param {string} outputPath - Path for output file
 * @param {Object} options - Configuration options
 * @returns {Promise<{path: string, format: string, converted: boolean}>} - Processing result
 */
async function processAudio(inputPath, timestamps, outputPath, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      // Default options
      const config = {
        redactionMethod: 'beep', // 'beep' or 'mute'
        beepVolume: 0.2,         // Lower volume (0.0-1.0)
        ...options
      };
      
      // Ensure input file exists
      if (!fs.existsSync(inputPath)) {
        return reject(new Error(`Input file does not exist: ${inputPath}`));
      }
      
      // Get original file size for compression target
      const originalStats = fs.statSync(inputPath);
      const originalSize = originalStats.size;
      logger.info(`Original file size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
      
      // Check file extension
      const ext = path.extname(inputPath).toLowerCase();
      const outputExt = path.extname(outputPath).toLowerCase();
      
      // Check available disk space before proceeding
      try {
        const diskInfo = checkDiskSpace(path.dirname(outputPath));
        // Estimate required space (original size * 3 for temporary files)
        const requiredSpace = originalSize * 3;
        
        if (diskInfo.available < requiredSpace) {
          return reject(new Error(`Insufficient disk space. Required: ${formatSize(requiredSpace)}, Available: ${formatSize(diskInfo.available)}`));
        }
        
        logger.info(`Disk space check passed. Available: ${formatSize(diskInfo.available)}, Required: ${formatSize(requiredSpace)}`);
      } catch (diskError) {
        logger.warn(`Could not check disk space: ${diskError.message}. Proceeding anyway.`);
      }
      
      // Create temporary paths for intermediate files
      const tempDir = path.join(path.dirname(outputPath), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempWavPath = path.join(tempDir, `temp_${Date.now()}.wav`);
      const tempProcessedPath = path.join(tempDir, `temp_processed_${Date.now()}.wav`);
      
      // Respect the requested output format
      const finalOutputPath = outputPath;
      const finalOutputExt = path.extname(finalOutputPath).toLowerCase();
      
      // Process based on file type
      if (ext === '.wav') {
        // Process WAV file directly
        logger.info(`Processing WAV file directly: ${inputPath}`);
        
        try {
          // Process the WAV file
          await processWavFile(inputPath, timestamps, tempProcessedPath, config);
          
          // Compress to match original size
          logger.info(`Compressing processed WAV file to match original size`);
          const compressedPath = await compressAudioFile(tempProcessedPath, finalOutputPath, originalSize);
          
          // Clean up temporary files
          try {
            if (fs.existsSync(tempProcessedPath)) fs.unlinkSync(tempProcessedPath);
          } catch (cleanupError) {
            logger.warn(`Failed to remove temporary file: ${cleanupError.message}`);
          }
          
          resolve({
            path: compressedPath,
            format: 'mp3',
            converted: true,
            compressed: true
          });
        } catch (processingError) {
          logger.error(`WAV processing failed: ${processingError.message}`);
          throw processingError;
        }
      } else if (ext === '.mp3') {
        // Convert MP3 to WAV first, then process
        logger.info(`MP3 file detected, converting to WAV first: ${inputPath}`);
        
        try {
          // Convert MP3 to WAV
          await convertMP3ToWAV(inputPath, tempWavPath);
          
          // Verify the converted WAV file
          if (!await verifyWavFile(tempWavPath)) {
            throw new Error('Converted WAV file verification failed');
          }
          
          // Process the WAV file
          logger.info(`Processing converted WAV file: ${tempWavPath}`);
          await processWavFile(tempWavPath, timestamps, tempProcessedPath, config);
          
          // Compress to match original size
          logger.info(`Compressing processed WAV file to match original size`);
          const compressedPath = await compressAudioFile(tempProcessedPath, finalOutputPath, originalSize);
          
          // Clean up temporary files
          try {
            if (fs.existsSync(tempWavPath)) fs.unlinkSync(tempWavPath);
            if (fs.existsSync(tempProcessedPath)) fs.unlinkSync(tempProcessedPath);
          } catch (cleanupError) {
            logger.warn(`Failed to remove temporary files: ${cleanupError.message}`);
          }
          
          resolve({
            path: compressedPath,
            format: 'mp3',
            converted: true,
            compressed: true
          });
        } catch (conversionError) {
          logger.error(`MP3 processing failed: ${conversionError.message}`);
          
          // Fallback to HTML player approach
          logger.info('Falling back to HTML player approach for MP3 file');
          
          // Copy the original MP3 to the output path
          fs.copyFileSync(inputPath, outputPath);
          
          // Create a WAV beep track with lower volume
          const beepTrackPath = outputPath + '.beeps.wav';
          await createBeepTrack(timestamps, beepTrackPath, { volume: config.beepVolume });
          
          // Create an HTML player
          const htmlPlayerPath = outputPath + '.player.html';
          createHtmlPlayer(path.basename(outputPath), path.basename(beepTrackPath), timestamps, htmlPlayerPath);
          
          resolve({
            path: outputPath,
            format: 'mp3',
            converted: false,
            fallback: true,
            beepTrack: beepTrackPath,
            htmlPlayer: htmlPlayerPath
          });
        }
      } else {
        // Unsupported file type
        logger.warn(`Unsupported file type: ${ext}, copying file without processing`);
        fs.copyFileSync(inputPath, outputPath);
        resolve({
          path: outputPath,
          format: ext.substring(1),
          converted: false,
          unsupported: true
        });
      }
    } catch (error) {
      logger.error(`Error in processAudio: ${error.message}`);
      
      // Instead of copying the original file (which would contain sensitive info),
      // create a silent file of the same duration as a secure fallback
      try {
        logger.warn('Processing failed, creating silent audio file as secure fallback');
        
        // Get the duration of the original file using ffmpeg
        const getDuration = async () => {
          return new Promise((resolve, reject) => {
            const ffmpegProcess = spawn(ffmpegStatic, [
              '-i', inputPath,
              '-f', 'null',
              '-'
            ]);
            
            let output = '';
            ffmpegProcess.stderr.on('data', (data) => {
              output += data.toString();
            });
            
            ffmpegProcess.on('close', (code) => {
              if (code !== 0) {
                return resolve(60); // Default to 60 seconds if we can't determine
              }
              
              // Parse duration from ffmpeg output
              const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}.\d{2})/);
              if (durationMatch) {
                const hours = parseInt(durationMatch[1]);
                const minutes = parseInt(durationMatch[2]);
                const seconds = parseFloat(durationMatch[3]);
                const totalSeconds = hours * 3600 + minutes * 60 + seconds;
                resolve(totalSeconds);
              } else {
                resolve(60); // Default to 60 seconds if parsing fails
              }
            });
          });
        };
        
        const duration = await getDuration();
        logger.info(`Creating silent audio file with duration: ${duration} seconds`);
        
        // Create a silent audio file
        const silentProcess = spawn(ffmpegStatic, [
          '-f', 'lavfi',
          '-i', 'anullsrc=r=44100:cl=stereo',
          '-t', duration.toString(),
          '-c:a', 'libmp3lame',
          '-b:a', '128k',
          '-y',
          outputPath
        ]);
        
        await new Promise((resolve, reject) => {
          silentProcess.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Failed to create silent audio file, exit code: ${code}`));
            }
          });
        });
        
        resolve({
          path: outputPath,
          format: 'mp3',
          converted: false,
          silent: true,
          error: error.message
        });
      } catch (fallbackError) {
        logger.error(`Failed to create silent fallback file: ${fallbackError.message}`);
        reject(new Error(`Audio processing failed and secure fallback also failed: ${error.message}. Fallback error: ${fallbackError.message}`));
      }
    }
  });
}

/**
 * Create a WAV file containing only beeps at specified timestamps
 * @param {Array} timestamps - Array of {start, end} objects
 * @param {string} outputPath - Path for output WAV file
 * @returns {Promise<string>} - Path to the beep track
 */
async function createBeepTrack(timestamps, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      // Calculate the duration needed (end of last timestamp)
      const maxEnd = Math.max(...timestamps.map(t => t.end)) + 1; // Add 1 second buffer
      
      // Create silent audio buffer
      const sampleRate = 44100;
      const numChannels = 2; // Stereo for better quality
      const duration = maxEnd;
      const numSamples = Math.ceil(duration * sampleRate);
      
      // Create a buffer of zeros (silence)
      const audioData = [
        new Float32Array(numSamples),
        new Float32Array(numSamples)
      ];
      
      // Add beeps at specified timestamps
      timestamps.forEach(timestamp => {
        const startSample = Math.floor(timestamp.start * sampleRate);
        const endSample = Math.floor(timestamp.end * sampleRate);
        
        // Generate beep tone (1kHz sine
