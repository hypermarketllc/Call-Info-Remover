// integrated-audio-processor.js
// A comprehensive audio processing module that handles MP3 to WAV conversion and redaction

const fs = require('fs');
const path = require('path');
const NodeWav = require('node-wav');
const ffmpegStatic = require('ffmpeg-static');
const { spawn } = require('child_process');
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
 * Process WAV file with beep sounds at specified timestamps
 * @param {string} inputPath - Path to input WAV file
 * @param {Array} timestamps - Array of {start, end} objects
 * @param {string} outputPath - Path for output file
 * @returns {Promise<string>} - Path to processed file
 */
async function processWavFile(inputPath, timestamps, outputPath) {
  return new Promise((resolve, reject) => {
    try {
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
      
      // For each timestamp, replace with beep
      timestamps.forEach(timestamp => {
        const startSample = Math.floor(timestamp.start * sampleRate);
        const endSample = Math.floor(timestamp.end * sampleRate);
        
        logger.info(`Adding beep from ${timestamp.start}s to ${timestamp.end}s (samples ${startSample}-${endSample})`);
        
        // Generate beep tone (1kHz sine wave)
        for (let i = startSample; i < endSample; i++) {
          if (i < audioData[0].length) {
            const t = (i - startSample) / sampleRate;
            const sample = 0.5 * Math.sin(2 * Math.PI * 1000 * t);
            
            // Apply to all channels
            for (let channel = 0; channel < numChannels; channel++) {
              audioData[channel][i] = sample;
            }
          }
        }
      });
      
      // Encode back to WAV
      const encoded = NodeWav.encode(audioData, {
        sampleRate: sampleRate,
        float: true,
        bitDepth: 32
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
 * Main function to process audio file with automatic MP3 to WAV conversion
 * @param {string} inputPath - Path to input audio file
 * @param {Array} timestamps - Array of {start, end} objects
 * @param {string} outputPath - Path for output file
 * @returns {Promise<{path: string, format: string, converted: boolean}>} - Processing result
 */
async function processAudio(inputPath, timestamps, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      // Ensure input file exists
      if (!fs.existsSync(inputPath)) {
        return reject(new Error(`Input file does not exist: ${inputPath}`));
      }
      
      // Check file extension
      const ext = path.extname(inputPath).toLowerCase();
      
      // Process based on file type
      if (ext === '.wav') {
        // Process WAV file directly
        logger.info(`Processing WAV file directly: ${inputPath}`);
        const result = await processWavFile(inputPath, timestamps, outputPath);
        resolve({
          path: result,
          format: 'wav',
          converted: false
        });
      } else if (ext === '.mp3') {
        // Convert MP3 to WAV first, then process
        logger.info(`MP3 file detected, converting to WAV first: ${inputPath}`);
        
        // Create temporary WAV file path
        const tempWavPath = path.join(
          path.dirname(inputPath),
          `temp_${path.basename(inputPath, '.mp3')}.wav`
        );
        
        try {
          // Convert MP3 to WAV
          await convertMP3ToWAV(inputPath, tempWavPath);
          
          // Verify the converted WAV file
          if (!await verifyWavFile(tempWavPath)) {
            throw new Error('Converted WAV file verification failed');
          }
          
          // Process the WAV file
          logger.info(`Processing converted WAV file: ${tempWavPath}`);
          const processedPath = await processWavFile(tempWavPath, timestamps, outputPath);
          
          // Clean up temporary file
          try {
            fs.unlinkSync(tempWavPath);
            logger.debug(`Temporary WAV file removed: ${tempWavPath}`);
          } catch (cleanupError) {
            logger.warn(`Failed to remove temporary WAV file: ${cleanupError.message}`);
          }
          
          resolve({
            path: processedPath,
            format: 'wav',
            converted: true
          });
        } catch (conversionError) {
          logger.error(`MP3 to WAV conversion failed: ${conversionError.message}`);
          
          // Fallback to HTML player approach
          logger.info('Falling back to HTML player approach for MP3 file');
          
          // Copy the original MP3 to the output path
          fs.copyFileSync(inputPath, outputPath);
          
          // Create a WAV beep track
          const beepTrackPath = outputPath + '.beeps.wav';
          await createBeepTrack(timestamps, beepTrackPath);
          
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
      
      // Fallback to copying the original file
      try {
        logger.warn('Processing failed, copying original file as fallback');
        fs.copyFileSync(inputPath, outputPath);
        resolve({
          path: outputPath,
          format: path.extname(inputPath).substring(1),
          converted: false,
          error: error.message
        });
      } catch (copyError) {
        reject(new Error(`Failed to process audio and fallback copy also failed: ${copyError.message}`));
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
        
        // Generate beep tone (1kHz sine wave)
        for (let i = startSample; i < endSample && i < numSamples; i++) {
          const t = (i - startSample) / sampleRate;
          const sample = 0.7 * Math.sin(2 * Math.PI * 1000 * t); // Slightly louder beep (0.7)
          
          // Apply to both channels
          audioData[0][i] = sample;
          audioData[1][i] = sample;
        }
      });
      
      // Encode to WAV
      const encoded = NodeWav.encode(audioData, {
        sampleRate: sampleRate,
        float: true,
        bitDepth: 32
      });
      
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Write to file
      fs.writeFileSync(outputPath, encoded);
      
      logger.info(`Beep track created at ${outputPath}`);
      resolve(outputPath);
    } catch (error) {
      logger.error(`Error creating beep track: ${error.message}`);
      reject(error);
    }
  });
}

/**
 * Create an HTML player that can play the original MP3 and beep track simultaneously
 * @param {string} mp3Filename - The MP3 filename
 * @param {string} beepFilename - The beep track filename
 * @param {Array} timestamps - The timestamps for visualization
 * @param {string} outputPath - Path to save the HTML file
 * @returns {string} - Path to the HTML player
 */
function createHtmlPlayer(mp3Filename, beepFilename, timestamps, outputPath) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Audio Redaction Player</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        h1 {
            color: #2196F3;
            text-align: center;
        }
        .player-container {
            background-color: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .audio-players {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 20px;
        }
        .controls {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin-bottom: 20px;
        }
        button {
            background-color: #2196F3;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 10px 15px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            background-color: #1976D2;
        }
        button:disabled {
            background-color: #ccc;
            cursor: not-allowed;
        }
        .timeline {
            height: 40px;
            background-color: #f0f0f0;
            position: relative;
            border-radius: 4px;
            margin-bottom: 20px;
            overflow: hidden;
        }
        .progress {
            height: 100%;
            background-color: #bbdefb;
            width: 0%;
            transition: width 0.1s;
        }
        .timestamp {
            position: absolute;
            height: 100%;
            background-color: rgba(244, 67, 54, 0.3);
            border-left: 1px solid #e53935;
            border-right: 1px solid #e53935;
        }
        .instruction {
            background-color: #e1f5fe;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
            border-left: 4px solid #03a9f4;
        }
        .timestamps-list {
            background-color: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            max-height: 200px;
            overflow-y: auto;
        }
        .timestamp-item {
            padding: 5px 0;
            border-bottom: 1px solid #ddd;
        }
    </style>
</head>
<body>
    <h1>Audio Redaction Player</h1>
    
    <div class="instruction">
        <h3>How to Use</h3>
        <p>This player lets you hear the original audio with beep sounds overlaid at sensitive information timestamps.</p>
        <ol>
            <li>Click "Play Both" to hear the original audio with beeps</li>
            <li>The red sections in the timeline show where sensitive information has been redacted</li>
            <li>You can also play just the original or just the beep track separately</li>
        </ol>
    </div>
    
    <div class="player-container">
        <div class="audio-players">
            <div>
                <h3>Original Audio</h3>
                <audio id="original-audio" src="${mp3Filename}" preload="auto"></audio>
            </div>
            <div>
                <h3>Beep Track</h3>
                <audio id="beep-audio" src="${beepFilename}" preload="auto"></audio>
            </div>
        </div>
        
        <div class="timeline" id="timeline">
            <div class="progress" id="progress"></div>
            ${timestamps.map((t, i) => `
                <div class="timestamp" style="left: 0%; width: 0%;" 
                    data-start="${t.start}" data-end="${t.end}" id="timestamp-${i}"></div>
            `).join('')}
        </div>
        
        <div class="controls">
            <button id="play-both">Play Both</button>
            <button id="play-original">Play Original</button>
            <button id="play-beeps">Play Beeps</button>
            <button id="stop">Stop</button>
        </div>
        
        <h3>Redacted Timestamps</h3>
        <div class="timestamps-list">
            ${timestamps.map((t, i) => `
                <div class="timestamp-item">
                    Timestamp ${i+1}: ${t.start.toFixed(2)}s - ${t.end.toFixed(2)}s 
                    (Duration: ${(t.end - t.start).toFixed(2)}s)
                </div>
            `).join('')}
        </div>
    </div>
    
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const originalAudio = document.getElementById('original-audio');
            const beepAudio = document.getElementById('beep-audio');
            const playBothBtn = document.getElementById('play-both');
            const playOriginalBtn = document.getElementById('play-original');
            const playBeepsBtn = document.getElementById('play-beeps');
            const stopBtn = document.getElementById('stop');
            const progress = document.getElementById('progress');
            const timeline = document.getElementById('timeline');
            
            // Set up timeline markers
            const duration = ${Math.max(...timestamps.map(t => t.end)) + 5}; // Add 5 seconds buffer
            originalAudio.onloadedmetadata = function() {
                const audioDuration = originalAudio.duration;
                
                // Position the timestamp markers
                const timestamps = document.querySelectorAll('.timestamp');
                timestamps.forEach(ts => {
                    const start = parseFloat(ts.dataset.start);
                    const end = parseFloat(ts.dataset.end);
                    ts.style.left = (start / audioDuration * 100) + '%';
                    ts.style.width = ((end - start) / audioDuration * 100) + '%';
                });
            };
            
            // Update progress bar
            originalAudio.ontimeupdate = function() {
                const percentage = (originalAudio.currentTime / originalAudio.duration) * 100;
                progress.style.width = percentage + '%';
            };
            
            // Play both audio elements in sync
            playBothBtn.addEventListener('click', function() {
                beepAudio.currentTime = originalAudio.currentTime;
                originalAudio.play();
                beepAudio.play();
                
                playBothBtn.disabled = true;
                playOriginalBtn.disabled = true;
                playBeepsBtn.disabled = true;
                stopBtn.disabled = false;
            });
            
            // Play just the original
            playOriginalBtn.addEventListener('click', function() {
                originalAudio.play();
                
                playBothBtn.disabled = true;
                playOriginalBtn.disabled = true;
                playBeepsBtn.disabled = true;
                stopBtn.disabled = false;
            });
            
            // Play just the beeps
            playBeepsBtn.addEventListener('click', function() {
                beepAudio.play();
                
                playBothBtn.disabled = true;
                playOriginalBtn.disabled = true;
                playBeepsBtn.disabled = true;
                stopBtn.disabled = false;
            });
            
            // Stop all audio
            stopBtn.addEventListener('click', function() {
                originalAudio.pause();
                beepAudio.pause();
                originalAudio.currentTime = 0;
                beepAudio.currentTime = 0;
                
                playBothBtn.disabled = false;
                playOriginalBtn.disabled = false;
                playBeepsBtn.disabled = false;
                stopBtn.disabled = true;
            });
            
            // When one audio ends, stop the other
            originalAudio.onended = beepAudio.onended = function() {
                originalAudio.pause();
                beepAudio.pause();
                originalAudio.currentTime = 0;
                beepAudio.currentTime = 0;
                
                playBothBtn.disabled = false;
                playOriginalBtn.disabled = false;
                playBeepsBtn.disabled = false;
                stopBtn.disabled = true;
            };
            
            // Click on timeline to seek
            timeline.addEventListener('click', function(e) {
                const percent = e.offsetX / timeline.offsetWidth;
                const time = percent * originalAudio.duration;
                originalAudio.currentTime = time;
                beepAudio.currentTime = time;
            });
            
            // Initially disable stop button
            stopBtn.disabled = true;
        });
    </script>
</body>
</html>`;

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, html);
  logger.info(`HTML player created at ${outputPath}`);
  return outputPath;
}

// Export the module functions
module.exports = {
  processAudio,
  convertMP3ToWAV,
  verifyWavFile,
  processWavFile,
  createBeepTrack,
  createHtmlPlayer
};
