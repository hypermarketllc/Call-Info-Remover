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
 * Check available disk space in a directory
 * @param {string} directory - Directory to check
 * @returns {Object} - Object with total and available space in bytes
 */
function checkDiskSpace(directory) {
  try {
    // For Windows, use PowerShell to get more accurate disk space information
    if (process.platform === 'win32') {
      const driveLetter = path.parse(directory).root;
      // Use PowerShell to get disk space info
      const command = `powershell -Command "(Get-PSDrive ${driveLetter.charAt(0)} | Select-Object Used,Free | ConvertTo-Json)"`;
      
      logger.info(`Running disk space check command: ${command}`);
      const output = execSync(command).toString();
      logger.info(`Disk space check output: ${output}`);
      
      try {
        const diskInfo = JSON.parse(output);
        // PowerShell returns values in bytes
        return {
          total: diskInfo.Used + diskInfo.Free,
          available: diskInfo.Free
        };
      } catch (parseError) {
        logger.error(`Failed to parse PowerShell output: ${parseError.message}`);
        logger.error(`Raw output: ${output}`);
      }
    } else if (process.platform === 'darwin') {
      // macOS
      const command = `df -k "${directory}"`;
      const output = execSync(command).toString();
      logger.info(`Disk space check output: ${output}`);
      
      const lines = output.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].trim().split(/\s+/);
        if (values.length >= 4) {
          // df outputs in 1K blocks, convert to bytes
          const totalSpace = parseInt(values[1], 10) * 1024;
          const availableSpace = parseInt(values[3], 10) * 1024;
          return {
            total: totalSpace,
            available: availableSpace
          };
        }
      }
    } else {
      // Linux and other Unix-like systems
      const command = `df -k "${directory}"`;
      const output = execSync(command).toString();
      logger.info(`Disk space check output: ${output}`);
      
      const lines = output.trim().split('\n');
      if (lines.length >= 2) {
        const values = lines[1].trim().split(/\s+/);
        if (values.length >= 4) {
          // df outputs in 1K blocks, convert to bytes
          const totalSpace = parseInt(values[1], 10) * 1024;
          const availableSpace = parseInt(values[3], 10) * 1024;
          return {
            total: totalSpace,
            available: availableSpace
          };
        }
      }
    }
    
    // If we reach here, we couldn't parse the output
    // Since user mentioned there's 20GB available, use that as a fallback
    logger.warn('Could not parse disk space output, using 20GB as available space');
    return {
      total: 100 * 1024 * 1024 * 1024, // 100 GB
      available: 20 * 1024 * 1024 * 1024 // 20 GB
    };
  } catch (error) {
    logger.error(`Error checking disk space: ${error.message}`);
    logger.error(`Stack trace: ${error.stack}`);
    
    // Since user mentioned there's 20GB available, use that as a fallback
    logger.warn('Error in disk space check, using 20GB as available space');
    return {
      total: 100 * 1024 * 1024 * 1024, // 100 GB
      available: 20 * 1024 * 1024 * 1024 // 20 GB
    };
  }
}

/**
 * Format file size in bytes to a human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size string
 */
function formatSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

// Export the module functions
module.exports = {
  // Include the disk space checking functions
  checkDiskSpace,
  formatSize,
  
  // When an error occurs during processing, create a silent file instead of copying the original
  processAudio: async function(inputPath, timestamps, outputPath, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        // Default options
        const config = {
          redactionMethod: 'beep', // 'beep' or 'mute'
          beepVolume: 0.2,         // Beep volume (0.0-1.0)
          audioVolume: 1.0,        // Original audio volume multiplier (1.0 = unchanged)
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
          
          // Standard mode: Estimate required space (original size * 2 for temporary files)
          const standardRequiredSpace = originalSize * 2;
          
          logger.info(`Disk space check: Available: ${formatSize(diskInfo.available)}, Required: ${formatSize(standardRequiredSpace)}`);
          
          // We should have plenty of space as per user's comment (20GB available)
          if (diskInfo.available < standardRequiredSpace) {
            logger.error(`Disk space check reports insufficient space, but this may be incorrect. Available: ${formatSize(diskInfo.available)}, Required: ${formatSize(standardRequiredSpace)}`);
            logger.error(`Proceeding with processing anyway as user indicated there is sufficient space (20GB)`);
          }
        } catch (diskError) {
          // Log the error but continue with processing
          logger.warn(`Could not check disk space: ${diskError.message}. Proceeding anyway.`);
        }
        
        // Process the file
        // First, check if we have any sensitive sections to redact
        if (!timestamps || timestamps.length === 0) {
          logger.info('No sensitive sections to redact, copying file directly');
          fs.copyFileSync(inputPath, outputPath);
          return resolve({
            path: outputPath,
            format: outputExt.replace('.', ''),
            converted: false,
            silent: false
          });
        }
        
        // Use FFmpeg to add beeps at the sensitive sections
        logger.info(`Processing audio with ${timestamps.length} sensitive sections, beep volume: ${config.beepVolume}`);
        
        // Build a complex filter for FFmpeg to add beeps at sensitive sections
        let filterComplex = '';
        
        // Start with the original audio stream and apply audio volume adjustment
        filterComplex += '[0:a]volume=' + config.audioVolume + ',';
        
        // Add volume filters for each sensitive section to mute the original audio
        timestamps.forEach((section, index) => {
          filterComplex += `volume=enable='between(t,${section.start},${section.end})':volume=0,`;
        });
        
        // End the chain with the output label
        filterComplex += `aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[main];`;
        
        // Generate beep tones for each sensitive section
        timestamps.forEach((section, index) => {
          const duration = section.end - section.start;
          // Create a beep tone with the user-specified volume
          filterComplex += `aevalsrc=${config.beepVolume}*sin(1000*2*PI*t):d=${duration}:s=44100:c=stereo[beep${index}];`;
          
          // Delay the beep to match the timestamp
          filterComplex += `[beep${index}]adelay=${Math.round(section.start * 1000)}|${Math.round(section.start * 1000)}[adelayed${index}];`;
        });
        
        // Mix the main audio with all beep tones
        filterComplex += `[main]`;
        timestamps.forEach((section, index) => {
          filterComplex += `[adelayed${index}]`;
        });
        
        // Final mix
        filterComplex += `amix=inputs=${timestamps.length + 1}:duration=longest`;
        
        logger.info(`FFmpeg filter complex: ${filterComplex}`);
        
        // Create FFmpeg command with the complex filter
        const ffmpegArgs = [
          '-i', inputPath,
          '-filter_complex', filterComplex,
          '-y', // Overwrite output file if it exists
          outputPath
        ];
        
        logger.info(`FFmpeg command: ${ffmpegStatic} ${ffmpegArgs.join(' ')}`);
        
        const ffmpegCommand = spawn(ffmpegStatic, ffmpegArgs);
        
        // Log FFmpeg output for debugging
        ffmpegCommand.stderr.on('data', (data) => {
          logger.info(`FFmpeg: ${data.toString()}`);
        });
        
        // Handle FFmpeg completion
        ffmpegCommand.on('close', (code) => {
          if (code === 0) {
            logger.info('Audio processing completed successfully');
            resolve({
              path: outputPath,
              format: outputExt.replace('.', ''),
              converted: false,
              silent: false
            });
          } else {
            logger.error(`FFmpeg process exited with code ${code}`);
            reject(new Error(`FFmpeg process exited with code ${code}`));
          }
        });
        
        // Handle FFmpeg errors
        ffmpegCommand.on('error', (err) => {
          logger.error(`FFmpeg process error: ${err.message}`);
          reject(err);
        });
        
        // If an error occurs, this catch block will handle it
      } catch (error) {
        // Log the error details
        logger.error(`Error in processAudio: ${error.message}`);
        logger.error(`Stack trace: ${error.stack}`);
        
        // As per user request, do not create a silent file
        // Just return the error to the caller
        return reject(new Error(`CRITICAL SECURITY ERROR: Audio redaction failed. Cannot provide unredacted audio. Technical details: ${error.message}`));
      }
    });
  }
};
