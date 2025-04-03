// test-audio-processor.js
// A test script to verify the integrated audio processor functionality with configurable options

const fs = require('fs');
const path = require('path');
const audioProcessor = require('./integrated-audio-processor');

// Parse command line arguments
const args = process.argv.slice(2);
let testFile = 'sample.mp3';
let redactionMethod = 'beep';
let beepVolume = 0.2;

// Process command line arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' && i + 1 < args.length) {
    testFile = args[i + 1];
    i++;
  } else if (args[i] === '--method' && i + 1 < args.length) {
    redactionMethod = args[i + 1];
    i++;
  } else if (args[i] === '--volume' && i + 1 < args.length) {
    beepVolume = parseFloat(args[i + 1]);
    i++;
  } else if (!args[i].startsWith('--') && i === 0) {
    // For backward compatibility, treat the first non-flag argument as the file
    testFile = args[i];
  }
}

// Configure test parameters
const outputFile = path.join('processed', `test_redacted_${path.basename(testFile)}`);

// Define some test timestamps for redaction
const testTimestamps = [
  { start: 1.5, end: 3.0 },
  { start: 5.0, end: 7.5 },
  { start: 10.0, end: 12.0 }
];

// Configure processing options
const options = {
  redactionMethod,
  beepVolume
};

console.log('=== AUDIO PROCESSOR TEST ===');
console.log(`Testing with file: ${testFile}`);
console.log(`Output will be saved to: ${outputFile}`);
console.log(`Using ${testTimestamps.length} test timestamps for redaction`);
console.log(`Redaction method: ${options.redactionMethod}${options.redactionMethod === 'beep' ? `, volume: ${options.beepVolume}` : ''}`);

// Ensure the processed directory exists
if (!fs.existsSync('processed')) {
  fs.mkdirSync('processed');
  console.log('Created processed directory');
}

// Function to run the test
async function runTest() {
  console.log('\nStarting audio processing test...');
  
  try {
    // Check if the test file exists
    if (!fs.existsSync(testFile)) {
      console.error(`Error: Test file ${testFile} not found`);
      return;
    }
    
    const originalSize = fs.statSync(testFile).size;
    console.log(`File exists: ${testFile} (${(originalSize / 1024 / 1024).toFixed(2)} MB)`);
    
    // Process the audio file
    console.log('Processing audio file...');
    const startTime = Date.now();
    
    const result = await audioProcessor.processAudio(testFile, testTimestamps, outputFile, options);
    
    const endTime = Date.now();
    const processingTime = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('\n=== PROCESSING COMPLETE ===');
    console.log(`Processing time: ${processingTime} seconds`);
    console.log('Result:', result);
    
    // Verify the output file exists
    if (fs.existsSync(result.path)) {
      const resultSize = fs.statSync(result.path).size;
      console.log(`\nOutput file created successfully: ${result.path}`);
      console.log(`File size: ${(resultSize / 1024 / 1024).toFixed(2)} MB (Original: ${(originalSize / 1024 / 1024).toFixed(2)} MB)`);
      console.log(`Size ratio: ${(resultSize / originalSize).toFixed(2)}x`);
      
      if (result.compressed) {
        console.log(`File was compressed to match original size`);
      }
      
      if (result.converted) {
        console.log(`File was converted from ${path.extname(testFile)} to ${result.format}`);
      }
      
      if (result.fallback) {
        console.log('Direct processing failed, fallback method was used');
        console.log(`Beep track: ${result.beepTrack}`);
        console.log(`HTML player: ${result.htmlPlayer}`);
      }
      
      console.log('\nTest completed successfully!');
    } else {
      console.error(`\nError: Output file ${result.path} was not created`);
    }
  } catch (error) {
    console.error('\n=== TEST FAILED ===');
    console.error(`Error: ${error.message}`);
    console.error(error.stack);
  }
}

// Run the test
runTest();

// Print usage information
function printUsage() {
  console.log(`
Usage: node test-audio-processor.js [options] [file]

Options:
  --file FILE       Audio file to process (default: sample.mp3)
  --method METHOD   Redaction method: 'beep' or 'mute' (default: beep)
  --volume VOLUME   Beep volume (0.0-1.0) (default: 0.2)

Examples:
  node test-audio-processor.js sample.mp3
  node test-audio-processor.js --method mute sample.mp3
  node test-audio-processor.js --method beep --volume 0.1 sample.mp3
`);
}

// If --help is provided, print usage information
if (args.includes('--help') || args.includes('-h')) {
  printUsage();
}
