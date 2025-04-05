/**
 * Server Deployment Script for Parallel Processing Fix
 * 
 * This script is designed to be run directly on the server to implement
 * parallel processing of multiple files in the Call Info Remover application.
 * 
 * This script includes:
 * 1. The original fixes from comprehensive-fix.js for real-time updates
 * 2. New parallel processing implementation for simultaneous file uploads
 * 
 * Usage: 
 * 1. Upload this file to your server
 * 2. Run: node server-parallel-fix.js
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
  log('Starting parallel processing fix deployment...');
  
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
  
  // First apply the original fixes from comprehensive-fix.js
  
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

  // Try to apply Fix 1, but don't fail if it doesn't match (we'll replace it with parallel processing later)
  let modifiedAppJs = appJs.replace(originalPollJobStatusCode, enhancedPollJobStatusCode);
  if (modifiedAppJs === appJs) {
    log('⚠️ Warning: Could not apply Fix 1 (enhance pollJobStatus). This is expected if the file has been modified.');
  } else {
    log('✅ Applied Fix 1: Enhanced pollJobStatus function');
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
    log('⚠️ Warning: Could not apply Fix 2 (modify fetchRecordings). This is expected if the file has been modified.');
  } else {
    log('✅ Applied Fix 2: Modified fetchRecordings function to return a promise');
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
    log('⚠️ Warning: Could not apply Fix 3 (update failed job handling). This is expected if the file has been modified.');
  } else {
    log('✅ Applied Fix 3: Updated failed job handling');
  }

  // Fix 4: Update the initial fetchRecordings call to use the promise
  const originalInitialFetchPattern = /\/\/\s*Initial\s+fetch\s+of\s+recordings\s*\n\s*fetchRecordings\(\);/;
  
  const enhancedInitialFetchCall = `// Initial fetch of recordings
    fetchRecordings().catch(err => console.error('Error during initial recordings fetch:', err));`;

  // Replace the initial fetchRecordings call
  const tempAppJs3 = modifiedAppJs;
  modifiedAppJs = modifiedAppJs.replace(originalInitialFetchPattern, enhancedInitialFetchCall);
  
  if (modifiedAppJs === tempAppJs3) {
    log('⚠️ Warning: Could not apply Fix 4 (update initial fetchRecordings call). This is expected if the file has been modified.');
  } else {
    log('✅ Applied Fix 4: Updated initial fetchRecordings call');
  }

  // Now apply the parallel processing fix
  
  // Find the upload button event listener
  const uploadBtnEventListenerPattern = /uploadBtn\.addEventListener\('click',\s*async\s*\(\)\s*=>\s*\{[\s\S]*?processNextFile\(\);[\s\S]*?\}\);/;
  
  // New implementation with parallel processing
  const parallelProcessingCode = `uploadBtn.addEventListener('click', async () => {
        if (selectedFiles.length === 0) {
            return;
        }
        
        // Show progress
        uploadProgress.classList.remove('hidden');
        progressFill.style.width = '0%';
        progressText.textContent = 'Preparing upload...';
        
        // Get redaction options
        const beepVolume = parseFloat(beepVolumeSlider.value) / 100; // Convert percentage to decimal (0.0-1.0)
        const audioVolume = parseFloat(audioVolumeSlider.value) / 100; // Convert percentage to decimal
        
        // Track progress for all files
        let successCount = 0;
        let errorCount = 0;
        let completedCount = 0;
        const totalFiles = selectedFiles.length;
        
        // Create an array to track the status of each file
        const fileStatuses = selectedFiles.map((file, index) => ({
            file,
            index,
            status: 'pending', // pending, uploading, processing, completed, failed
            progress: 0,
            jobId: null
        }));
        
        // Function to update overall progress
        function updateOverallProgress() {
            const totalProgress = fileStatuses.reduce((sum, file) => sum + file.progress, 0) / totalFiles;
            progressFill.style.width = \`\${totalProgress}%\`;
            
            // Update progress text
            const pendingCount = fileStatuses.filter(f => f.status === 'pending').length;
            const uploadingCount = fileStatuses.filter(f => f.status === 'uploading').length;
            const processingCount = fileStatuses.filter(f => f.status === 'processing').length;
            
            progressText.textContent = \`Progress: \${completedCount} of \${totalFiles} completed, \${uploadingCount} uploading, \${processingCount} processing\`;
        }
        
        // Function to check if all files are processed
        function checkAllCompleted() {
            if (completedCount === totalFiles) {
                setTimeout(() => {
                    // Reset form
                    clearBtn.click();
                    uploadProgress.classList.add('hidden');
                    
                    // Show summary
                    if (errorCount > 0) {
                        alert(\`Batch processing completed with \${errorCount} errors.\\n\${successCount} of \${totalFiles} files were processed successfully.\`);
                    } else {
                        alert(\`Batch processing completed successfully. All \${totalFiles} files were processed.\`);
                    }
                }, 1000);
            }
        }
        
        // Function to process a single file
        function processFile(fileStatus) {
            return new Promise((resolve) => {
                const file = fileStatus.file;
                const fileName = file.name;
                const index = fileStatus.index;
                
                // Update status
                fileStatus.status = 'uploading';
                updateOverallProgress();
                
                // Create form data for this file
                const formData = new FormData();
                formData.append('audio', file);
                formData.append('beepVolume', beepVolume);
                formData.append('audioVolume', audioVolume);
                
                // Upload the file
                const xhr = new XMLHttpRequest();
                
                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        // Calculate file progress (upload is 50% of total progress)
                        const uploadProgress = (event.loaded / event.total) * 50;
                        fileStatus.progress = uploadProgress;
                        updateOverallProgress();
                    }
                });
                
                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const response = JSON.parse(xhr.responseText);
                            
                            if (response.jobId) {
                                // Two-step process: file uploaded, now poll for status
                                console.log(\`File \${index + 1} uploaded, processing started. Job ID: \${response.jobId}\`);
                                fileStatus.status = 'processing';
                                fileStatus.jobId = response.jobId;
                                fileStatus.progress = 50; // Upload complete (50% of total progress)
                                updateOverallProgress();
                                
                                // Poll for job status
                                pollJobStatus(fileStatus);
                            } else {
                                // Old API response format (direct completion)
                                successCount++;
                                completedCount++;
                                fileStatus.status = 'completed';
                                fileStatus.progress = 100;
                                updateOverallProgress();
                                console.log(\`File \${index + 1} processed successfully:\`, response);
                                
                                // Update recordings list with delay to ensure server has time to update
                                setTimeout(() => {
                                    fetchRecordings()
                                        .then(() => {
                                            console.log(\`Recordings list updated successfully after file \${index + 1}\`);
                                        })
                                        .catch(err => {
                                            console.error(\`Error updating recordings after file \${index + 1}:\`, err);
                                        });
                                }, 500);
                                
                                // Check if all files are completed
                                checkAllCompleted();
                                resolve();
                            }
                        } catch (parseError) {
                            console.error('Error parsing response:', parseError);
                            errorCount++;
                            completedCount++;
                            fileStatus.status = 'failed';
                            fileStatus.progress = 100;
                            updateOverallProgress();
                            
                            // Check if all files are completed
                            checkAllCompleted();
                            resolve();
                        }
                    } else {
                        errorCount++;
                        completedCount++;
                        fileStatus.status = 'failed';
                        fileStatus.progress = 100;
                        updateOverallProgress();
                        
                        let errorMessage = 'An error occurred during upload.';
                        let errorDetails = '';
                        
                        try {
                            const errorResponse = JSON.parse(xhr.responseText);
                            if (errorResponse && errorResponse.error) {
                                errorMessage = errorResponse.error;
                                
                                if (errorResponse.details) {
                                    errorDetails = errorResponse.details;
                                }
                                
                                if (errorResponse.message) {
                                    errorDetails += '\\n\\n' + errorResponse.message;
                                }
                            }
                        } catch (e) {
                            console.error('Error parsing error response:', e);
                        }
                        
                        console.error(\`Error processing file \${fileName}:\`, errorMessage, errorDetails);
                        
                        // Check if all files are completed
                        checkAllCompleted();
                        resolve();
                    }
                });
                
                xhr.addEventListener('error', () => {
                    console.error(\`Network error processing file \${fileName}\`);
                    errorCount++;
                    completedCount++;
                    fileStatus.status = 'failed';
                    fileStatus.progress = 100;
                    updateOverallProgress();
                    
                    // Check if all files are completed
                    checkAllCompleted();
                    resolve();
                });
                
                xhr.addEventListener('timeout', () => {
                    console.error(\`Timeout processing file \${fileName}\`);
                    errorCount++;
                    completedCount++;
                    fileStatus.status = 'failed';
                    fileStatus.progress = 100;
                    updateOverallProgress();
                    
                    // Check if all files are completed
                    checkAllCompleted();
                    resolve();
                });
                
                // Set timeout to 5 minutes for large files that need processing
                xhr.timeout = 300000;
                xhr.open('POST', '/api/upload');
                xhr.send(formData);
            });
        }
        
        // Function to poll job status
        function pollJobStatus(fileStatus) {
            const jobId = fileStatus.jobId;
            const fileName = fileStatus.file.name;
            const index = fileStatus.index;
            const statusUrl = \`/api/status/\${jobId}\`;
            let pollCount = 0;
            const maxPolls = 300; // Maximum number of polling attempts (15 minutes at 3-second intervals)
            
            const pollInterval = setInterval(() => {
                pollCount++;
                
                if (pollCount > maxPolls) {
                    clearInterval(pollInterval);
                    console.error(\`Polling timeout for job \${jobId}\`);
                    errorCount++;
                    completedCount++;
                    fileStatus.status = 'failed';
                    fileStatus.progress = 100;
                    updateOverallProgress();
                    
                    // Check if all files are completed
                    checkAllCompleted();
                    return;
                }
                
                fetch(statusUrl)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(\`Status check failed: \${response.status}\`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        // Update progress based on stage (processing is the remaining 50% of total progress)
                        let processingProgress = 0;
                        if (data.stage === 'transcribing') processingProgress = 10;
                        else if (data.stage === 'analyzing') processingProgress = 20;
                        else if (data.stage === 'redacting') processingProgress = 30;
                        else if (data.stage === 'storing') processingProgress = 40;
                        
                        fileStatus.progress = 50 + processingProgress; // 50% for upload + processing progress
                        updateOverallProgress();
                        
                        if (data.status === 'completed') {
                            // Processing complete
                            clearInterval(pollInterval);
                            successCount++;
                            completedCount++;
                            fileStatus.status = 'completed';
                            fileStatus.progress = 100;
                            updateOverallProgress();
                            console.log(\`File \${index + 1} processed successfully:\`, data.result);
                            
                            // Update the recordings list immediately when a file is processed
                            console.log(\`Updating recordings list after file \${index + 1} (\${fileName}) was processed\`);
                            
                            // Add a small delay before fetching recordings to ensure the server has time to update
                            setTimeout(() => {
                                fetchRecordings()
                                    .then(() => {
                                        console.log(\`Recordings list updated successfully after file \${index + 1}\`);
                                    })
                                    .catch(err => {
                                        console.error(\`Error updating recordings after file \${index + 1}:\`, err);
                                    });
                            }, 500);
                            
                            // Check if all files are completed
                            checkAllCompleted();
                        } else if (data.status === 'failed') {
                            // Processing failed
                            clearInterval(pollInterval);
                            errorCount++;
                            completedCount++;
                            fileStatus.status = 'failed';
                            fileStatus.progress = 100;
                            updateOverallProgress();
                            console.error(\`Error processing file \${fileName}:\`, data.error || 'Unknown error');
                            
                            // Still update the recordings list in case other files were processed
                            console.log('Updating recordings list after file processing failed');
                            setTimeout(() => {
                                fetchRecordings()
                                    .catch(() => {
                                        console.error('Error updating recordings after file processing failed');
                                    });
                            }, 500);
                            
                            // Check if all files are completed
                            checkAllCompleted();
                        }
                        // If still processing, continue polling
                    })
                    .catch(error => {
                        console.error(\`Error checking job status for \${fileName}:\`, error);
                        // Don't increment error count or mark as completed on polling errors,
                        // just continue polling until timeout
                    });
            }, 3000); // Poll every 3 seconds
        }
        
        // Start processing all files in parallel
        console.log(\`Starting parallel processing of \${totalFiles} files\`);
        
        // Determine how many files to process in parallel (max 3)
        const MAX_PARALLEL = 3;
        const batchSize = Math.min(MAX_PARALLEL, totalFiles);
        
        // Process files in batches to avoid overwhelming the server
        async function processFilesInBatches() {
            // Process files in batches of MAX_PARALLEL
            for (let i = 0; i < totalFiles; i += batchSize) {
                const batch = fileStatuses.slice(i, i + batchSize);
                await Promise.all(batch.map(fileStatus => processFile(fileStatus)));
            }
        }
        
        // Start processing
        processFilesInBatches();
    });`;
  
  // Replace the upload button event listener with our parallel processing implementation
  const tempAppJs4 = modifiedAppJs;
  modifiedAppJs = modifiedAppJs.replace(uploadBtnEventListenerPattern, parallelProcessingCode);
  
  if (modifiedAppJs === tempAppJs4) {
    log('❌ Error: Could not apply parallel processing fix. The file might have been modified or the pattern might not match.');
    process.exit(1);
  } else {
    log('✅ Successfully applied parallel processing fix');
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
  log('1. Applied original fixes from comprehensive-fix.js:');
  log('   - Enhanced fetchRecordings function to return a promise');
  log('   - Added delay before fetching recordings to ensure server has time to update');
  log('   - Updated failed job handling to also update recordings');
  log('   - Enhanced error handling and logging');
  log('2. Implemented parallel processing:');
  log('   - Completely rewrote the file upload and processing logic to handle multiple files in parallel');
  log('   - Added a system to track the status and progress of each file individually');
  log('   - Limited parallel processing to a maximum of 3 files at once to avoid overwhelming the server');
  log('   - Enhanced the progress display to show overall status of all files');
  
  log('\nNext steps:');
  log('1. Restart your server: pm2 restart call-info-remover');
  log('2. Test by uploading multiple files');
  log('3. Verify that files are processed in parallel and appear in the recordings list as they are completed');
  
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