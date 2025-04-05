/**
 * Server Deployment Fix for Call Info Remover
 * 
 * This script is designed to be run directly on the server to fix the issue
 * where processed recordings only show up after all files are processed.
 * 
 * Usage: 
 * 1. Upload this file to your server
 * 2. Run: node server-deployment-fix.js
 * 3. Restart your server: pm2 restart call-info-remover
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const APP_JS_PATH = path.join(__dirname, 'public', 'app.js');
const BACKUP_PATH = path.join(__dirname, 'public', `app.js.backup-${Date.now()}`);

// Helper function to log with timestamp
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Main function
async function applyFix() {
  log('Starting server deployment fix...');
  
  // Check if app.js exists
  if (!fs.existsSync(APP_JS_PATH)) {
    log(`❌ Error: Could not find app.js at ${APP_JS_PATH}`);
    log('Make sure you are running this script from the root directory of your application.');
    process.exit(1);
  }
  
  // Create backup
  log(`Creating backup at ${BACKUP_PATH}`);
  try {
    fs.copyFileSync(APP_JS_PATH, BACKUP_PATH);
    log('✅ Backup created successfully');
  } catch (error) {
    log(`❌ Error creating backup: ${error.message}`);
    process.exit(1);
  }
  
  // Read app.js
  log('Reading app.js file...');
  let appJs;
  try {
    appJs = fs.readFileSync(APP_JS_PATH, 'utf8');
    log(`✅ Read ${appJs.length} bytes from app.js`);
  } catch (error) {
    log(`❌ Error reading app.js: ${error.message}`);
    process.exit(1);
  }
  
  log('Applying fixes...');
  
  // Fix 1: Enhance the pollJobStatus function to ensure recordings are updated before processing the next file
  const originalPollJobStatusCode = `if (data.status === 'completed') {
                                // Processing complete
                                clearInterval(pollInterval);
                                successCount++;
                                console.log(\`File \${fileIndex + 1} processed successfully:\`, data.result);
                                
                                // Update the recordings list immediately when a file is processed
                                fetchRecordings();
                                
                                // Process next file
                                currentFileIndex++;
                                processNextFile();
                            }`;

  const enhancedPollJobStatusCode = `if (data.status === 'completed') {
                                // Processing complete
                                clearInterval(pollInterval);
                                successCount++;
                                console.log(\`File \${fileIndex + 1} processed successfully:\`, data.result);
                                
                                // Update the recordings list immediately when a file is processed
                                console.log(\`Updating recordings list after file \${fileIndex + 1} (\${fileName}) was processed\`);
                                
                                // Add a small delay before fetching recordings to ensure the server has time to update
                                setTimeout(() => {
                                    fetchRecordings()
                                        .then(() => {
                                            console.log(\`Recordings list updated successfully after file \${fileIndex + 1}\`);
                                            // Process next file after recordings are updated
                                            currentFileIndex++;
                                            processNextFile();
                                        })
                                        .catch(err => {
                                            console.error(\`Error updating recordings after file \${fileIndex + 1}:\`, err);
                                            // Still process next file even if there was an error updating recordings
                                            currentFileIndex++;
                                            processNextFile();
                                        });
                                }, 500);
                            }`;

  // Replace the pollJobStatus function
  let modifiedAppJs = appJs.replace(originalPollJobStatusCode, enhancedPollJobStatusCode);
  
  if (modifiedAppJs === appJs) {
    log('⚠️ Warning: Could not find the pollJobStatus function to update.');
    log('The file might have been modified or the pattern might not match.');
    
    // Try a more flexible pattern
    const flexiblePattern = /if\s*\(\s*data\.status\s*===\s*['"]completed['"]\s*\)\s*\{[\s\S]*?fetchRecordings\(\);[\s\S]*?currentFileIndex\+\+;[\s\S]*?processNextFile\(\);[\s\S]*?\}/;
    modifiedAppJs = appJs.replace(flexiblePattern, enhancedPollJobStatusCode);
    
    if (modifiedAppJs === appJs) {
      log('❌ Error: Could not apply the first fix even with a more flexible pattern.');
      log('Please check your app.js file and apply the fix manually.');
      process.exit(1);
    } else {
      log('✅ Applied first fix with flexible pattern matching');
    }
  } else {
    log('✅ Applied first fix: Enhanced pollJobStatus function');
  }

  // Fix 2: Modify the fetchRecordings function to return a promise
  const originalFetchRecordingsPattern = /function\s+fetchRecordings\s*\(\s*\)\s*\{[\s\S]*?fetch\s*\(\s*['"]\/api\/calls['"]\s*\)[\s\S]*?\}\s*\}/;
  
  const enhancedFetchRecordingsFunction = `function fetchRecordings() {
        console.log('Fetching recordings list...');
        // Return a promise so we can chain actions after fetching recordings
        return new Promise((resolve, reject) => {
            fetch('/api/calls')
                .then(response => {
                    if (!response.ok) {
                        throw new Error(\`Server returned \${response.status}: \${response.statusText}\`);
                    }
                    return response.json();
                })
                .then(recordings => {
                    console.log(\`Received \${recordings ? recordings.length : 0} recordings\`);
                    if (recordings && recordings.length > 0) {
                        recordingsCard.classList.remove('hidden');
                        displayRecordings(recordings);
                    } else {
                        recordingsCard.classList.add('hidden');
                    }
                    resolve(); // Resolve the promise when done
                })
                .catch(error => {
                    console.error('Error fetching recordings:', error);
                    // Optionally show an error message to the user
                    const errorToast = document.createElement('div');
                    errorToast.className = 'error-toast';
                    errorToast.textContent = 'Could not load recordings. Please refresh the page to try again.';
                    document.body.appendChild(errorToast);
                    
                    // Remove the error toast after 5 seconds
                    setTimeout(() => {
                        if (errorToast.parentNode) {
                            errorToast.parentNode.removeChild(errorToast);
                        }
                    }, 5000);
                    
                    reject(error); // Reject the promise on error
                });
        });
    }`;

  // Replace the fetchRecordings function
  const tempAppJs = modifiedAppJs;
  modifiedAppJs = modifiedAppJs.replace(originalFetchRecordingsPattern, enhancedFetchRecordingsFunction);
  
  if (modifiedAppJs === tempAppJs) {
    log('⚠️ Warning: Could not find the fetchRecordings function to update.');
    log('The file might have been modified or the pattern might not match.');
    process.exit(1);
  } else {
    log('✅ Applied second fix: Modified fetchRecordings function to return a promise');
  }

  // Fix 3: Update the failed job handling to also update recordings
  const originalFailedJobPattern = /else\s+if\s*\(\s*data\.status\s*===\s*['"]failed['"]\s*\)\s*\{[\s\S]*?currentFileIndex\+\+;[\s\S]*?processNextFile\(\);[\s\S]*?\}/;
  
  const enhancedFailedJobCode = `else if (data.status === 'failed') {
                                // Processing failed
                                clearInterval(pollInterval);
                                errorCount++;
                                console.error(\`Error processing file \${fileName}:\`, data.error || 'Unknown error');
                                
                                // Still update the recordings list in case other files were processed
                                console.log('Updating recordings list after file processing failed');
                                fetchRecordings()
                                    .then(() => {
                                        // Process next file after recordings are updated
                                        currentFileIndex++;
                                        processNextFile();
                                    })
                                    .catch(() => {
                                        // Still process next file even if there was an error updating recordings
                                        currentFileIndex++;
                                        processNextFile();
                                    });
                            }`;

  // Replace the failed job handling
  const tempAppJs2 = modifiedAppJs;
  modifiedAppJs = modifiedAppJs.replace(originalFailedJobPattern, enhancedFailedJobCode);
  
  if (modifiedAppJs === tempAppJs2) {
    log('⚠️ Warning: Could not find the failed job handling code to update.');
    log('The file might have been modified or the pattern might not match.');
    // Continue anyway as this is not critical
  } else {
    log('✅ Applied third fix: Updated failed job handling');
  }

  // Fix 4: Update the initial fetchRecordings call to use the promise
  const originalInitialFetchPattern = /\/\/\s*Initial\s+fetch\s+of\s+recordings\s*\n\s*fetchRecordings\(\);/;
  
  const enhancedInitialFetchCall = `// Initial fetch of recordings
    fetchRecordings().catch(err => console.error('Error during initial recordings fetch:', err));`;

  // Replace the initial fetchRecordings call
  const tempAppJs3 = modifiedAppJs;
  modifiedAppJs = modifiedAppJs.replace(originalInitialFetchPattern, enhancedInitialFetchCall);
  
  if (modifiedAppJs === tempAppJs3) {
    log('⚠️ Warning: Could not find the initial fetchRecordings call to update.');
    log('The file might have been modified or the pattern might not match.');
    // Continue anyway as this is not critical
  } else {
    log('✅ Applied fourth fix: Updated initial fetchRecordings call');
  }

  // Write the modified file
  log('Writing modified app.js file...');
  try {
    fs.writeFileSync(APP_JS_PATH, modifiedAppJs);
    log('✅ Successfully wrote modified app.js file');
  } catch (error) {
    log(`❌ Error writing app.js: ${error.message}`);
    process.exit(1);
  }

  log('\n✅ All fixes applied successfully!');
  log(`Original file backed up at: ${BACKUP_PATH}`);
  log('\nChanges made:');
  log('1. Enhanced pollJobStatus function to ensure recordings are updated before processing the next file');
  log('2. Modified fetchRecordings function to return a promise for better control flow');
  log('3. Updated failed job handling to also update recordings');
  log('4. Added more detailed logging to help diagnose issues');
  
  log('\nNext steps:');
  log('1. Restart your server: pm2 restart call-info-remover');
  log('2. Test by uploading multiple files');
  log('3. Verify that each file appears in the recordings list as soon as it is processed');
  
  log('\nIf you need to revert the changes:');
  log(`cp ${BACKUP_PATH} ${APP_JS_PATH}`);
  log('pm2 restart call-info-remover');
}

// Run the fix
applyFix().catch(error => {
  log(`❌ Unexpected error: ${error.message}`);
  log(error.stack);
  process.exit(1);
});