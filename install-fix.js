/**
 * Installation Script for Call Info Remover Fix
 * 
 * This script applies the fix to update the recordings list as soon as each file is processed,
 * without waiting for all files in a batch to be processed.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

console.log('=== Call Info Remover - Real-time Updates Fix ===');
console.log('This script will modify your application to show processed recordings');
console.log('as soon as they are ready, without waiting for all files to be processed.');
console.log('\nChecking environment...');

// Check if the comprehensive-fix.js file exists
const fixScriptPath = path.join(__dirname, 'comprehensive-fix.js');
if (!fs.existsSync(fixScriptPath)) {
  console.error('Error: comprehensive-fix.js not found!');
  console.error('Please make sure the file is in the same directory as this script.');
  process.exit(1);
}

// Check if the app.js file exists
const appJsPath = path.join(__dirname, 'public', 'app.js');
if (!fs.existsSync(appJsPath)) {
  console.error('Error: public/app.js not found!');
  console.error('Please make sure you are running this script from the root directory of your application.');
  process.exit(1);
}

console.log('Environment check passed.');
console.log('\nApplying fix...');

// Run the comprehensive fix script
exec('node comprehensive-fix.js', (error, stdout, stderr) => {
  if (error) {
    console.error('Error applying fix:', error);
    console.error(stderr);
    process.exit(1);
  }
  
  console.log(stdout);
  
  console.log('\n=== Fix Applied Successfully ===');
  console.log('Your application has been modified to show processed recordings in real-time.');
  console.log('\nNext steps:');
  console.log('1. Restart your server to apply the changes');
  console.log('2. Test the application by uploading multiple files');
  console.log('3. Verify that each file appears in the recordings list as soon as it is processed');
  
  console.log('\nIf you encounter any issues, you can restore the original file from the backup:');
  console.log('- A backup of your original app.js file was created in the public directory');
  console.log('- Look for a file named app.js.backup-[timestamp]');
  
  console.log('\nThank you for using this fix!');
});