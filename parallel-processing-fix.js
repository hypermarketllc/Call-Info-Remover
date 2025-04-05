/**
 * Parallel Processing Fix for Call Info Remover
 * 
 * This script modifies the frontend to upload and process multiple files simultaneously,
 * rather than one at a time in sequence.
 * 
 * Usage: node parallel-processing-fix.js
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
  
  console.log('Applying parallel processing fix...');
  
  // Find the processNextFile function and the entire upload button event listener
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
                                
                                // Update recordings list
                                fetchRecordings();
                                
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
                            fetchRecordings();
                            
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
                            fetchRecordings();
                            
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
        
        // Convert fetchRecordings to return a promise
        const originalFetchRecordings = fetchRecordings;
        window.fetchRecordings = function() {
            console.log('Fetching recordings list...');
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
                        resolve();
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
                        
                        reject(error);
                    });
            });
        };
        
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
  let modifiedAppJs = appJs.replace(uploadBtnEventListenerPattern, parallelProcessingCode);
  
  // Write the modified file
  console.log('Writing modified app.js file...');
  fs.writeFileSync(appJsPath, modifiedAppJs);
  
  console.log('\n✅ Parallel processing fix applied successfully!');
  console.log(`Original file backed up at: ${backupPath}`);
  console.log('\nChanges made:');
  console.log('1. Completely rewrote the file upload and processing logic to handle multiple files in parallel');
  console.log('2. Added a system to track the status and progress of each file individually');
  console.log('3. Limited parallel processing to a maximum of 3 files at once to avoid overwhelming the server');
  console.log('4. Enhanced the progress display to show overall status of all files');
  console.log('5. Modified fetchRecordings to return a promise for better control flow');
  console.log('\nNow multiple files will be uploaded and processed simultaneously,');
  console.log('and each file will appear in the recordings list as soon as it is processed.');
  console.log('\nPlease restart your server to apply the changes.');
  
} catch (error) {
  console.error('❌ Error applying parallel processing fix:', error.message);
  console.error('Please check that the app.js file exists and is accessible.');
}