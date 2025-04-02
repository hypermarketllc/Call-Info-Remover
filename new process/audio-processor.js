// audioProcessor.js
// Standalone audio processing script to be run as a child process
// This helps prevent memory leaks and allows processing larger audio files

const fs = require('fs');
const path = require('path');
const lame = require('lame');
const wav = require('wav');
const Speaker = require('speaker');
const stream = require('stream');
const { Readable, Writable } = stream;

// Command line arguments
const inputFile = process.argv[2];
const outputFile = process.argv[3];
const sensitiveSections = JSON.parse(process.argv[4] || '[]');

// Detect audio format
const audioExt = path.extname(inputFile).toLowerCase();

/**
 * Process audio using native Node.js streams
 * This approach is more reliable and memory-efficient
 */
async function processAudio() {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(inputFile)) {
        return reject(new Error(`Input file does not exist: ${inputFile}`));
      }

      // Create output directories if needed
      const outputDir = path.dirname(outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Initialize processing pipeline based on file format
      let decoder;
      const inputStream = fs.createReadStream(inputFile);
      
      // Set up decoder based on file type
      if (audioExt === '.mp3') {
        decoder = new lame.Decoder();
        inputStream.pipe(decoder);
      } else if (audioExt === '.wav') {
        decoder = new wav.Reader();
        inputStream.pipe(decoder);
      } else {
        // For other formats, attempt to read as raw PCM
        decoder = new Readable();
        decoder._read = () => {};
        inputStream.on('data', chunk => decoder.push(chunk));
        inputStream.on('end', () => decoder.push(null));
      }

      // Create a transform stream to apply beep tones
      const beepProcessor = new stream.Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
          if (!chunk) {
            return callback();
          }

          try {
            // Create a copy of the chunk to modify
            const modifiedChunk = Buffer.from(chunk);
            
            // Process each sensitive section
            sensitiveSections.forEach(section => {
              // We need to calculate the position in the buffer based on audio format
              // This is a simplified approach assuming 44.1kHz, 16-bit, stereo
              // In a real implementation, you'd use the audio format info from the decoder
              const sampleRate = decoder.sampleRate || 44100;
              const bytesPerSample = 2; // 16-bit
              const channels = decoder.channels || 2;
              
              const startByte = Math.floor(section.start * sampleRate * bytesPerSample * channels);
              const endByte = Math.floor(section.end * sampleRate * bytesPerSample * channels);
              
              // Only process this chunk if the section overlaps with it
              const chunkStartTime = currentByte / (sampleRate * bytesPerSample * channels);
              const chunkEndTime = (currentByte + chunk.length) / (sampleRate * bytesPerSample * channels);
              
              if (section.end >= chunkStartTime && section.start <= chunkEndTime) {
                // Calculate relative position within this chunk
                const relativeStart = Math.max(0, Math.floor((section.start - chunkStartTime) * sampleRate * bytesPerSample * channels));
                const relativeEnd = Math.min(chunk.length, Math.floor((section.end - chunkStartTime) * sampleRate * bytesPerSample * channels));
                
                // Apply beep tone (1kHz sine wave)
                for (let i = relativeStart; i < relativeEnd; i += 2) {
                  if (i + 1 < chunk.length) {
                    // Generate sine wave sample (1kHz)
                    const t = (currentByte + i) / (sampleRate * bytesPerSample * channels);
                    const sample = Math.floor(0.5 * 32767 * Math.sin(2 * Math.PI * 1000 * t));
                    
                    // Write sample to buffer (little-endian 16-bit)
                    modifiedChunk[i] = sample & 0xff;
                    modifiedChunk[i + 1] = (sample >> 8) & 0xff;
                    
                    // If stereo, copy to second channel
                    if (channels === 2 && i + 3 < chunk.length) {
                      modifiedChunk[i + 2] = sample & 0xff;
                      modifiedChunk[i + 3] = (sample >> 8) & 0xff;
                    }
                  }
                }
              }
            });
            
            // Update current byte position
            currentByte += chunk.length;
            
            // Push the modified chunk
            callback(null, modifiedChunk);
          } catch (err) {
            callback(err);
          }
        }
      });

      // Set up encoder for output
      const encoder = new wav.Writer({
        channels: decoder.channels || 2,
        sampleRate: decoder.sampleRate || 44100,
        bitDepth: 16
      });
      
      // Track current position in the audio stream
      let currentByte = 0;

      // Connect the streams
      const outputStream = fs.createWriteStream(outputFile);
      
      // Handle errors
      inputStream.on('error', reject);
      decoder.on('error', reject);
      beepProcessor.on('error', reject);
      encoder.on('error', reject);
      outputStream.on('error', reject);
      
      // Set up the pipeline
      decoder
        .pipe(beepProcessor)
        .pipe(encoder)
        .pipe(outputStream);
      
      outputStream.on('finish', () => {
        resolve(outputFile);
      });
      
    } catch (error) {
      reject(error);
    }
  });
}

// Fallback method using a simpler approach
// This is used if the streaming approach fails
async function processAudioSimple() {
  return new Promise((resolve, reject) => {
    try {
      // Read the entire file into memory (only suitable for smaller files)
      const inputBuffer = fs.readFileSync(inputFile);
      
      // A very basic beep insertion logic
      // Note: This is not format-aware and will likely only work correctly with PCM/WAV files
      
      // Create a copy of the buffer
      const outputBuffer = Buffer.from(inputBuffer);
      
      // Basic assumptions (these would be detected in a real implementation)
      const sampleRate = 44100;
      const bytesPerSample = 2; // 16-bit
      const channels = 2; // Stereo
      
      // Apply beep tones to sensitive sections
      sensitiveSections.forEach(section => {
        const startByte = Math.floor(section.start * sampleRate * bytesPerSample * channels) + 44; // Add 44 for WAV header
        const endByte = Math.floor(section.end * sampleRate * bytesPerSample * channels) + 44;
        
        // Apply simple beep tone
        for (let i = startByte; i < endByte; i += 2) {
          if (i + 1 < outputBuffer.length) {
            // Generate sine wave sample (1kHz)
            const t = (i - startByte) / (sampleRate * bytesPerSample);
            const sample = Math.floor(0.5 * 32767 * Math.sin(2 * Math.PI * 1000 * t));
            
            // Write sample to buffer (little-endian 16-bit)
            outputBuffer[i] = sample & 0xff;
            outputBuffer[i + 1] = (sample >> 8) & 0xff;
            
            // If stereo, copy to second channel
            if (channels === 2 && i + 3 < outputBuffer.length) {
              outputBuffer[i + 2] = sample & 0xff;
              outputBuffer[i + 3] = (sample >> 8) & 0xff;
            }
          }
        }
      });
      
      // Write the modified buffer to the output file
      fs.writeFileSync(outputFile, outputBuffer);
      resolve(outputFile);
      
    } catch (error) {
      reject(error);
    }
  });
}

// Execute the processing
async function run() {
  try {
    // Try the streaming approach first
    await processAudio();
    console.log('Audio processing complete');
    process.exit(0);
  } catch (error) {
    console.error('Error in streaming audio processing, trying simple approach:', error.message);
    
    try {
      // Fallback to simple approach
      await processAudioSimple();
      console.log('Audio processing complete (simple method)');
      process.exit(0);
    } catch (fallbackError) {
      console.error('All processing methods failed:', fallbackError.message);
      process.exit(1);
    }
  }
}

run();
