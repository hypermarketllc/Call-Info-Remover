/**
 * Fix for Syntax Error in server-parallel-fix.js
 * 
 * This script creates a simpler version of the parallel processing fix
 * to address the "SyntaxError: missing ) after argument list" issue.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const APP_JS_PATH = path.join(__dirname, 'public', 'app.js');
const BACKUP_PATH = path.join(__dirname, 'public', `app.js.backup-${Date.now()}`);

console.log('Starting syntax error fix...');

// Check if app.js exists
if (!fs.existsSync(APP_JS_PATH)) {
  console.error(`Error: Could not find app.js at ${APP_JS_PATH}`);
  console.error('Make sure you are running this script from the root directory of your application.');
  process.exit(1);
}

// Create backup
console.log(`Creating backup at ${BACKUP_PATH}`);
try {
  fs.copyFileSync(APP_JS_PATH, BACKUP_PATH);
  console.log('Backup created successfully');
} catch (error) {
  console.error(`Error creating backup: ${error.message}`);
  process.exit(1);
}

// Read app.js
console.log('Reading app.js file...');
let appJs;
try {
  appJs = fs.readFileSync(APP_JS_PATH, 'utf8');
  console.log(`Read ${appJs.length} bytes from app.js`);
} catch (error) {
  console.error(`Error reading app.js: ${error.message}`);
  process.exit(1);
}

console.log('Applying simplified parallel processing fix...');

// First, let's fix the fetchRecordings function to return a promise
const fetchRecordingsPattern = /function\s+fetchRecordings\s*\(\s*\)\s*\{[\s\S]*?\}/;
const newFetchRecordings = `function fetchRecordings() {
    console.log('Fetching recordings list...');
    return new Promise((resolve, reject) => {
        fetch('/api/calls')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Server returned error status');
                }
                return response.json();
            })
            .then(recordings => {
                console.log('Received recordings:', recordings ? recordings.length : 0);
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
                reject(error);
            });
    });
}`;

// Replace the fetchRecordings function
let modifiedAppJs = appJs.replace(fetchRecordingsPattern, newFetchRecordings);

// Now, let's replace the upload button event listener with a simpler parallel processing implementation
const uploadBtnEventListenerPattern = /uploadBtn\.addEventListener\('click',[\s\S]*?processNextFile\(\);[\s\S]*?\}\);/;

const simpleParallelProcessingCode = `uploadBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) {
        return;
    }
    
    // Show progress
    uploadProgress.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = 'Preparing upload...';
    
    // Get redaction options
    const beepVolume = parseFloat(beepVolumeSlider.value) / 100;
    const audioVolume = parseFloat(audioVolumeSlider.value) / 100;
    
    // Track progress
    let successCount = 0;
    let errorCount = 0;
    let completedCount = 0;
    const totalFiles = selectedFiles.length;
    
    // Create file status array
    const fileStatuses = selectedFiles.map((file, index) => ({
        file,
        index,
        status: 'pending',
        progress: 0
    }));
    
    // Update progress display
    function updateProgress() {
        const totalProgress = fileStatuses.reduce((sum, file) => sum + file.progress, 0) / totalFiles;
        progressFill.style.width = totalProgress + '%';
        
        const processingCount = fileStatuses.filter(f => f.status === 'processing').length;
        const uploadingCount = fileStatuses.filter(f => f.status === 'uploading').length;
        
        progressText.textContent = 'Progress: ' + completedCount + ' of ' + totalFiles + 
            ' completed, ' + uploadingCount + ' uploading, ' + processingCount + ' processing';
    }
    
    // Process a single file
    function processFile(fileStatus) {
        return new Promise(resolve => {
            const file = fileStatus.file;
            const index = fileStatus.index;
            
            // Update status
            fileStatus.status = 'uploading';
            updateProgress();
            
            // Create form data
            const formData = new FormData();
            formData.append('audio', file);
            formData.append('beepVolume', beepVolume);
            formData.append('audioVolume', audioVolume);
            
            // Upload file
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', event => {
                if (event.lengthComputable) {
                    fileStatus.progress = (event.loaded / event.total) * 50;
                    updateProgress();
                }
            });
            
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        
                        if (response.jobId) {
                            // Start polling for status
                            fileStatus.status = 'processing';
                            fileStatus.progress = 50;
                            fileStatus.jobId = response.jobId;
                            updateProgress();
                            
                            pollJobStatus(fileStatus);
                        } else {
                            // Direct completion
                            successCount++;
                            completedCount++;
                            fileStatus.status = 'completed';
                            fileStatus.progress = 100;
                            updateProgress();
                            
                            // Update recordings list
                            fetchRecordings().catch(err => console.error('Error fetching recordings:', err));
                            
                            // Check if all completed
                            if (completedCount === totalFiles) {
                                finishProcessing();
                            }
                            
                            resolve();
                        }
                    } catch (error) {
                        handleError(fileStatus, error);
                        resolve();
                    }
                } else {
                    handleError(fileStatus, new Error('HTTP error ' + xhr.status));
                    resolve();
                }
            });
            
            xhr.addEventListener('error', () => {
                handleError(fileStatus, new Error('Network error'));
                resolve();
            });
            
            xhr.addEventListener('timeout', () => {
                handleError(fileStatus, new Error('Timeout'));
                resolve();
            });
            
            xhr.timeout = 300000;
            xhr.open('POST', '/api/upload');
            xhr.send(formData);
        });
    }
    
    // Handle file processing error
    function handleError(fileStatus, error) {
        console.error('Error processing file:', error);
        errorCount++;
        completedCount++;
        fileStatus.status = 'failed';
        fileStatus.progress = 100;
        updateProgress();
        
        // Check if all completed
        if (completedCount === totalFiles) {
            finishProcessing();
        }
    }
    
    // Poll for job status
    function pollJobStatus(fileStatus) {
        const statusUrl = '/api/status/' + fileStatus.jobId;
        let pollCount = 0;
        
        const pollInterval = setInterval(() => {
            pollCount++;
            
            if (pollCount > 300) {
                clearInterval(pollInterval);
                handleError(fileStatus, new Error('Polling timeout'));
                return;
            }
            
            fetch(statusUrl)
                .then(response => response.json())
                .then(data => {
                    // Update progress based on stage
                    if (data.stage === 'transcribing') fileStatus.progress = 60;
                    else if (data.stage === 'analyzing') fileStatus.progress = 70;
                    else if (data.stage === 'redacting') fileStatus.progress = 80;
                    else if (data.stage === 'storing') fileStatus.progress = 90;
                    
                    updateProgress();
                    
                    if (data.status === 'completed') {
                        // Processing complete
                        clearInterval(pollInterval);
                        successCount++;
                        completedCount++;
                        fileStatus.status = 'completed';
                        fileStatus.progress = 100;
                        updateProgress();
                        
                        // Update recordings list
                        fetchRecordings().catch(err => console.error('Error fetching recordings:', err));
                        
                        // Check if all completed
                        if (completedCount === totalFiles) {
                            finishProcessing();
                        }
                    } else if (data.status === 'failed') {
                        // Processing failed
                        clearInterval(pollInterval);
                        handleError(fileStatus, new Error(data.error || 'Processing failed'));
                    }
                })
                .catch(error => {
                    console.error('Error checking job status:', error);
                });
        }, 3000);
    }
    
    // Finish processing all files
    function finishProcessing() {
        setTimeout(() => {
            clearBtn.click();
            uploadProgress.classList.add('hidden');
            
            if (errorCount > 0) {
                alert('Batch processing completed with ' + errorCount + ' errors.\\n' + 
                      successCount + ' of ' + totalFiles + ' files were processed successfully.');
            } else {
                alert('Batch processing completed successfully. All ' + totalFiles + ' files were processed.');
            }
        }, 1000);
    }
    
    // Start processing files in parallel (max 3)
    const MAX_PARALLEL = 3;
    const batchSize = Math.min(MAX_PARALLEL, totalFiles);
    
    console.log('Starting parallel processing of ' + totalFiles + ' files');
    
    // Process in batches
    async function processAllFiles() {
        for (let i = 0; i < totalFiles; i += batchSize) {
            const batch = fileStatuses.slice(i, i + batchSize);
            await Promise.all(batch.map(fileStatus => processFile(fileStatus)));
        }
    }
    
    // Start processing
    processAllFiles();
});`;

// Replace the upload button event listener
modifiedAppJs = modifiedAppJs.replace(uploadBtnEventListenerPattern, simpleParallelProcessingCode);

// Write the modified file
console.log('Writing modified app.js file...');
try {
  fs.writeFileSync(APP_JS_PATH, modifiedAppJs);
  console.log('Successfully wrote modified app.js file');
} catch (error) {
  console.error(`Error writing app.js: ${error.message}`);
  process.exit(1);
}

console.log('\n✅ Syntax error fix applied successfully!');
console.log(`Original file backed up at: ${BACKUP_PATH}`);
console.log('\nThis fix:');
console.log('1. Replaces the fetchRecordings function with a simpler promise-based version');
console.log('2. Implements a simplified parallel processing solution with cleaner syntax');
console.log('3. Avoids complex string escaping and template literals that might cause syntax errors');
console.log('\nPlease restart your server to apply the changes:');
console.log('pm2 restart call-info-remover');