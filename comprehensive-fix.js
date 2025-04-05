/**
 * Comprehensive Fix for Call Info Remover
 * 
 * This script modifies the frontend to show processed recordings as soon as they're ready,
 * without waiting for all files in a batch to be processed.
 */

const fs = require('fs');
const path = require('path');

// Read the app.js file
console.log('Reading app.js file...');
const appJsPath = path.join(__dirname, 'public', 'app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');

// Create a backup of the original file
const backupPath = path.join(__dirname, 'public', 'app.js.backup-' + Date.now());
console.log(`Creating backup at ${backupPath}`);
fs.writeFileSync(backupPath, appJs);

console.log('Applying fixes...');

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

// Fix 2: Modify the fetchRecordings function to return a promise
const originalFetchRecordingsFunction = `function fetchRecordings() {
        console.log('Fetching recordings list...');
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
            });
    }`;

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
modifiedAppJs = modifiedAppJs.replace(originalFetchRecordingsFunction, enhancedFetchRecordingsFunction);

// Fix 3: Update the failed job handling to also update recordings
const originalFailedJobCode = `else if (data.status === 'failed') {
                                // Processing failed
                                clearInterval(pollInterval);
                                errorCount++;
                                console.error(\`Error processing file \${fileName}:\`, data.error || 'Unknown error');
                                
                                // Process next file
                                currentFileIndex++;
                                processNextFile();
                            }`;

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
modifiedAppJs = modifiedAppJs.replace(originalFailedJobCode, enhancedFailedJobCode);

// Fix 4: Update the initial fetchRecordings call to use the promise
const originalInitialFetchCall = `// Initial fetch of recordings
    fetchRecordings();`;

const enhancedInitialFetchCall = `// Initial fetch of recordings
    fetchRecordings().catch(err => console.error('Error during initial recordings fetch:', err));`;

// Replace the initial fetchRecordings call
modifiedAppJs = modifiedAppJs.replace(originalInitialFetchCall, enhancedInitialFetchCall);

// Write the modified file
console.log('Writing modified app.js file...');
fs.writeFileSync(appJsPath, modifiedAppJs);

console.log('\n✅ Fix applied successfully!');
console.log(`Original file backed up at: ${backupPath}`);
console.log('\nChanges made:');
console.log('1. Enhanced pollJobStatus function to ensure recordings are updated before processing the next file');
console.log('2. Modified fetchRecordings function to return a promise for better control flow');
console.log('3. Updated failed job handling to also update recordings');
console.log('4. Added more detailed logging to help diagnose issues');
console.log('\nNow each processed file will appear in the recordings list immediately after processing,');
console.log('without waiting for all files in the batch to be processed.');
console.log('\nPlease restart your server to apply the changes.');