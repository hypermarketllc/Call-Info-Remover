// Test script to verify disk space checking functionality
const audioProcessor = require('./audio-processor-fix');
const path = require('path');
const fs = require('fs');

// Test the disk space checking function
async function testDiskSpaceCheck() {
  console.log('=== DISK SPACE CHECK TEST ===');
  
  try {
    // Get the current directory
    const currentDir = process.cwd();
    console.log(`Checking disk space in: ${currentDir}`);
    
    // Check disk space
    const diskInfo = audioProcessor.checkDiskSpace(currentDir);
    
    // Display results
    console.log('Disk space information:');
    console.log(`- Total space: ${audioProcessor.formatSize(diskInfo.total)}`);
    console.log(`- Available space: ${audioProcessor.formatSize(diskInfo.available)}`);
    console.log(`- Used space: ${audioProcessor.formatSize(diskInfo.total - diskInfo.available)}`);
    console.log(`- Usage percentage: ${((diskInfo.total - diskInfo.available) / diskInfo.total * 100).toFixed(2)}%`);
    
    console.log('\nDisk space check completed successfully.');
  } catch (error) {
    console.error('Error checking disk space:', error);
  }
}

// Test the audio processing with error handling
async function testAudioProcessing() {
  console.log('\n=== AUDIO PROCESSING TEST ===');
  
  // Check if sample audio file exists
  const sampleFile = 'sample2.mp3';
  if (!fs.existsSync(sampleFile)) {
    console.error(`Error: Sample file '${sampleFile}' not found.`);
    return;
  }
  
  console.log(`Using sample file: ${sampleFile}`);
  
  // Create output directory if it doesn't exist
  const outputDir = 'test-output';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }
  
  const outputFile = path.join(outputDir, 'test-output.mp3');
  console.log(`Output will be saved to: ${outputFile}`);
  
  // Define some mock sensitive sections
  const sensitiveSections = [
    { start: 1.5, end: 3.0, type: 'ssn' },
    { start: 5.0, end: 7.0, type: 'creditCard' }
  ];
  
  console.log(`Testing with ${sensitiveSections.length} mock sensitive sections`);
  
  try {
    // Process the audio
    console.log('Starting audio processing...');
    await audioProcessor.processAudio(sampleFile, sensitiveSections, outputFile);
    
    // Check if output file was created
    if (fs.existsSync(outputFile)) {
      const stats = fs.statSync(outputFile);
      console.log(`Output file created successfully: ${audioProcessor.formatSize(stats.size)}`);
    } else {
      console.error('Error: Output file was not created.');
    }
  } catch (error) {
    console.error('Audio processing error:', error.message);
  }
}

// Run the tests
async function runTests() {
  await testDiskSpaceCheck();
  await testAudioProcessing();
}

runTests().catch(console.error);
