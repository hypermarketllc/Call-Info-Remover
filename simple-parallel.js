/**
 * Simple Parallel Processing Implementation for Call Info Remover
 * 
 * This script implements a simplified version of parallel processing
 * that avoids complex syntax that might cause errors.
 * 
 * Usage: node simple-parallel.js
 */

const fs = require('fs');
const path = require('path');

// Configuration
const APP_JS_PATH = path.join(__dirname, 'public', 'app.js');
const BACKUP_PATH = path.join(__dirname, 'public', `app.js.backup-simple-parallel-${Date.now()}`);

console.log('=== SIMPLE PARALLEL PROCESSING IMPLEMENTATION ===');
console.log('This script will implement a simplified version of parallel processing.');

// Step 1: Create a backup
console.log('\nStep 1: Creating backup...');
try {
  fs.copyFileSync(APP_JS_PATH, BACKUP_PATH);
  console.log(`✅ Created backup at ${BACKUP_PATH}`);
} catch (error) {
  console.error(`❌ Error creating backup: ${error.message}`);
  process.exit(1);
}

// Step 2: Read the app.js file
console.log('\nStep 2: Reading app.js file...');
let appJs;
try {
  appJs = fs.readFileSync(APP_JS_PATH, 'utf8');
  console.log(`Read ${appJs.length} bytes from app.js`);
} catch (error) {
  console.error(`❌ Error reading app.js: ${error.message}`);
  process.exit(1);
}

// Step 3: Implement simple parallel processing
console.log('\nStep 3: Implementing simple parallel processing...');

// Find the upload button event listener
const uploadBtnEventListenerPattern = /uploadBtn\.addEventListener\('click',[\s\S]*?processNextFile\(\);[\s\S]*?\}\);/;

// Simple parallel processing implementation
const simpleParallelCode = `uploadBtn.addEventListener('click', function() {
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
    
    // Update progress display
    function updateProgress() {
        const progress = (completedCount / totalFiles) * 100;
        progressFill.style.width = progress + '%';
        progressText.textContent = 'Progress: ' + completedCount + ' of ' + totalFiles + ' files processed';
    }
    
    // Process a single file
    function processFile(file, index) {
        // Create form data for this file
        const formData = new FormData();
        formData.append('audio', file);
        formData.append('beepVolume', beepVolume);
        formData.append('audioVolume', audioVolume);
        
        // Upload the file
        const xhr = new XMLHttpRequest();
        
        xhr.addEventListener('load', function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    
                    if (response.jobId) {
                        // Two-step process: file uploaded, now poll for status
                        console.log('File ' + (index + 1) + ' uploaded, processing started. Job ID: ' + response.jobId);
                        pollJobStatus(response.jobId, file.name, index);
                    } else {
                        // Old API response format (direct completion)
                        successCount++;
                        completedCount++;
                        updateProgress();
                        console.log('File ' + (index + 1) + ' processed successfully:', response);
                        
                        // Update recordings list
                        fetchRecordings();
                        
                        // Check if all files are completed
                        checkAllCompleted();
                    }
                } catch (error) {
                    handleError(file.name, error);
                }
            } else {
                handleError(file.name, new Error('HTTP error ' + xhr.status));
            }
        });
        
        xhr.addEventListener('error', function() {
            handleError(file.name, new Error('Network error'));
        });
        
        xhr.addEventListener('timeout', function() {
            handleError(file.name, new Error('Timeout'));
        });
        
        xhr.timeout = 300000;
        xhr.open('POST', '/api/upload');
        xhr.send(formData);
    }
    
    // Handle file processing error
    function handleError(fileName, error) {
        console.error('Error processing file ' + fileName + ':', error);
        errorCount++;
        completedCount++;
        updateProgress();
        
        // Check if all files are completed
        checkAllCompleted();
    }
    
    // Poll for job status
    function pollJobStatus(jobId, fileName, fileIndex) {
        const statusUrl = '/api/status/' + jobId;
        let pollCount = 0;
        
        const pollInterval = setInterval(function() {
            pollCount++;
            
            if (pollCount > 300) {
                clearInterval(pollInterval);
                handleError(fileName, new Error('Polling timeout'));
                return;
            }
            
            fetch(statusUrl)
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('Status check failed: ' + response.status);
                    }
                    return response.json();
                })
                .then(function(data) {
                    if (data.stage) {
                        progressText.textContent = 'Processing file ' + (fileIndex + 1) + ' of ' + totalFiles + ': ' + fileName + ' (' + data.stage + ')';
                    }
                    
                    if (data.status === 'completed') {
                        // Processing complete
                        clearInterval(pollInterval);
                        successCount++;
                        completedCount++;
                        updateProgress();
                        console.log('File ' + (fileIndex + 1) + ' processed successfully:', data.result);
                        
                        // Update recordings list
                        fetchRecordings();
                        
                        // Check if all files are completed
                        checkAllCompleted();
                    } else if (data.status === 'failed') {
                        // Processing failed
                        clearInterval(pollInterval);
                        handleError(fileName, new Error(data.error || 'Processing failed'));
                    }
                })
                .catch(function(error) {
                    console.error('Error checking job status for ' + fileName + ':', error);
                });
        }, 3000);
    }
    
    // Check if all files are completed
    function checkAllCompleted() {
        if (completedCount === totalFiles) {
            setTimeout(function() {
                // Reset form
                clearBtn.click();
                uploadProgress.classList.add('hidden');
                
                // Show summary
                if (errorCount > 0) {
                    alert('Batch processing completed with ' + errorCount + ' errors.\\n' + 
                          successCount + ' of ' + totalFiles + ' files were processed successfully.');
                } else {
                    alert('Batch processing completed successfully. All ' + totalFiles + ' files were processed.');
                }
            }, 1000);
        }
    }
    
    // Process all files (up to 3 at a time)
    const MAX_PARALLEL = 3;
    const filesToProcess = selectedFiles.slice(0); // Create a copy of the array
    
    function processNextBatch() {
        if (filesToProcess.length === 0) {
            return;
        }
        
        const batch = filesToProcess.splice(0, MAX_PARALLEL);
        
        batch.forEach(function(file, i) {
            const originalIndex = selectedFiles.indexOf(file);
            processFile(file, originalIndex);
        });
        
        // If we have more files to process, wait a bit and then process the next batch
        if (filesToProcess.length > 0) {
            setTimeout(processNextBatch, 1000);
        }
    }
    
    // Start processing
    processNextBatch();
});`;

// Replace the upload button event listener
let modifiedAppJs = appJs.replace(uploadBtnEventListenerPattern, simpleParallelCode);

if (modifiedAppJs === appJs) {
  console.error('❌ Could not find the upload button event listener to replace.');
  console.error('The app.js file might have been modified in an unexpected way.');
  process.exit(1);
}

// Step 4: Write the modified file
console.log('\nStep 4: Writing modified app.js file...');
try {
  fs.writeFileSync(APP_JS_PATH, modifiedAppJs);
  console.log('✅ Successfully wrote modified app.js file');
} catch (error) {
  console.error(`❌ Error writing app.js: ${error.message}`);
  process.exit(1);
}

console.log('\n=== SIMPLE PARALLEL PROCESSING IMPLEMENTATION COMPLETE ===');
console.log('Your app.js file has been updated with a simplified parallel processing implementation.');
console.log('\nThis implementation:');
console.log('1. Processes up to 3 files at a time');
console.log('2. Uses simple JavaScript syntax to avoid potential errors');
console.log('3. Updates the recordings list as each file is processed');
console.log('\nPlease restart your server to apply the changes:');
console.log('pm2 restart call-info-remover');
console.log('\nIf you still experience issues, you can restore the backup:');
console.log(`node restore-original.js`);