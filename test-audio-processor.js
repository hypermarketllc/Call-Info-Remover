// test-audio-processor.js
// A simple test script to verify the integrated audio processor functionality

const fs = require('fs');
const path = require('path');
const audioProcessor = require('./integrated-audio-processor');

// Configure test parameters
const testFile = process.argv[2] || 'sample.mp3'; // Use the provided file or default to sample.mp3
const outputFile = path.join('processed', `test_redacted_${path.basename(testFile)}`);

// Define some test timestamps for redaction
const testTimestamps = [
  { start: 1.5, end: 3.0 },
  { start: 5.0, end: 7.5 },
  { start: 10.0, end: 12.0 }
];

console.log('=== AUDIO PROCESSOR TEST ===');
console.log(`Testing with file: ${testFile}`);
console.log(`Output will be saved to: ${outputFile}`);
console.log(`Using ${testTimestamps.length} test timestamps for redaction`);

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
    
    console.log(`File exists: ${testFile} (${(fs.statSync(testFile).size / 1024).toFixed(2)} KB)`);
    
    // Process the audio file
    console.log('Processing audio file...');
    const startTime = Date.now();
    
    const result = await audioProcessor.processAudio(testFile, testTimestamps, outputFile);
    
    const endTime = Date.now();
    const processingTime = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('\n=== PROCESSING COMPLETE ===');
    console.log(`Processing time: ${processingTime} seconds`);
    console.log('Result:', result);
    
    // Verify the output file exists
    if (fs.existsSync(result.path)) {
      console.log(`\nOutput file created successfully: ${result.path}`);
      console.log(`File size: ${(fs.statSync(result.path).size / 1024).toFixed(2)} KB`);
      
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
