/**
 * Simple Fix Script for Call Info Remover
 * 
 * This script modifies the app.js file to show processed recordings as soon as they're ready,
 * without waiting for all files in a batch to be processed.
 * 
 * Usage: node simple-fix.js
 */

const fs = require('fs');
const path = require('path');

// Path to the app.js file
const appJsPath = path.join(__dirname, 'public', 'app.js');

// Create a backup of the original file
const backupPath = path.join(__dirname, 'public', `app.js.backup-${Date.now()}`);

try {
  console.log('Reading app.js file...');
  const appJs = fs.readFileSync(appJsPath, 'utf8');
  
  console.log('Creating backup of original file...');
  fs.writeFileSync(backupPath, appJs);
  
  console.log('Applying fixes...');
  
  // Fix 1: Update pollJobStatus function to refresh recordings list after each file is processed
  let modifiedAppJs = appJs.replace(
    /if\s*\(data\.status\s*===\s*'completed'\)\s*\{\s*\/\/\s*Processing\s*complete\s*clearInterval\s*\(\s*pollInterval\s*\)\s*;\s*successCount\+\+\s*;\s*console\.log\s*\(\s*`File\s*\$\{\s*fileIndex\s*\+\s*1\s*\}\s*processed\s*successfully:\s*`,\s*data\.result\s*\)\s*;\s*\/\/\s*Process\s*next\s*file\s*currentFileIndex\+\+\s*;\s*processNextFile\s*\(\s*\)\s*;\s*\}/g,
    `if (data.status === 'completed') {
                                // Processing complete
                                clearInterval(pollInterval);
                                successCount++;
                                console.log(\`File \${fileIndex + 1} processed successfully:\`, data.result);
                                
                                // Update the recordings list immediately when a file is processed
                                fetchRecordings();
                                
                                // Process next file
                                currentFileIndex++;
                                processNextFile();
                            }`
  );
  
  // Fix 2: Remove redundant fetchRecordings call at the end of batch processing
  modifiedAppJs = modifiedAppJs.replace(
    /setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{\s*\/\/\s*Reset\s*form\s*clearBtn\.click\s*\(\s*\)\s*;\s*uploadProgress\.classList\.add\s*\(\s*'hidden'\s*\)\s*;\s*\/\/\s*Refresh\s*recordings\s*list\s*fetchRecordings\s*\(\s*\)\s*;/g,
    `setTimeout(() => {
                    // Reset form
                    clearBtn.click();
                    uploadProgress.classList.add('hidden');
                    
                    // No need to refresh recordings list here as it's already updated for each file
                    // that was successfully processed`
  );
  
  // Fix 3: Enhance fetchRecordings function with better logging
  modifiedAppJs = modifiedAppJs.replace(
    /function\s*fetchRecordings\s*\(\s*\)\s*\{\s*fetch\s*\(\s*'\/api\/calls'\s*\)/g,
    `function fetchRecordings() {
        console.log('Fetching recordings list...');
        fetch('/api/calls')`
  );
  
  modifiedAppJs = modifiedAppJs.replace(
    /\.then\s*\(\s*recordings\s*=>\s*\{\s*if\s*\(\s*recordings\s*&&\s*recordings\.length\s*>\s*0\s*\)\s*\{/g,
    `.then(recordings => {
                console.log(\`Received \${recordings ? recordings.length : 0} recordings\`);
                if (recordings && recordings.length > 0) {`
  );
  
  // Write the modified file
  console.log('Writing modified app.js file...');
  fs.writeFileSync(appJsPath, modifiedAppJs);
  
  console.log('\n✅ Fix applied successfully!');
  console.log(`Original file backed up at: ${backupPath}`);
  console.log('\nChanges made:');
  console.log('1. Modified pollJobStatus function to update recordings list as soon as each file is processed');
  console.log('2. Removed redundant fetchRecordings call at the end of batch processing');
  console.log('3. Enhanced fetchRecordings function with better logging');
  console.log('\nNow each processed file will appear in the recordings list immediately after processing,');
  console.log('without waiting for all files in the batch to be processed.');
  console.log('\nPlease restart your server to apply the changes.');
  
} catch (error) {
  console.error('❌ Error applying fix:', error.message);
  console.error('Please check that the app.js file exists in the public directory and is accessible.');
}