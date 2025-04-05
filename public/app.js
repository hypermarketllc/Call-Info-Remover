document.addEventListener('DOMContentLoaded', function() {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const clearBtn = document.getElementById('clear-btn');
    const filePreview = document.getElementById('file-preview');
    const uploadProgress = document.getElementById('upload-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const recordingsCard = document.getElementById('recordings-card');
    const recordingsList = document.getElementById('recordings-list');
    
    // Settings widget elements
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsPanel = document.getElementById('settings-panel');
    
    // Toggle settings panel
    settingsToggle.addEventListener('click', () => {
        settingsPanel.classList.toggle('hidden');
    });
    
    // Close settings panel when clicking outside
    document.addEventListener('click', (event) => {
        if (!settingsPanel.classList.contains('hidden') && 
            !settingsPanel.contains(event.target) && 
            !settingsToggle.contains(event.target)) {
            settingsPanel.classList.add('hidden');
        }
    });
    
    let selectedFiles = [];
    
    // Prevent default behavior for drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // Highlight drop area when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        dropArea.classList.add('highlight');
    }
    
    function unhighlight() {
        dropArea.classList.remove('highlight');
    }
    
    // Handle dropped files
    dropArea.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            handleFiles(files);
        }
    }
    
    // Click to select file
    dropArea.addEventListener('click', () => {
        console.log('Drop area clicked, triggering file input click');
        fileInput.click();
    });
    
    fileInput.addEventListener('change', () => {
        console.log('File input change event triggered');
        if (fileInput.files.length > 0) {
            console.log('Files selected:', fileInput.files.length);
            handleFiles(fileInput.files);
        }
    });
    
    // Handle files selection
    function handleFiles(files) {
        // Filter out non-audio files
        selectedFiles = Array.from(files).filter(file => {
            if (!file.type.startsWith('audio/')) {
                return false;
            }
            return true;
        });
        
        if (selectedFiles.length === 0) {
            alert('Please select at least one audio file.');
            return;
        }
        
        if (files.length !== selectedFiles.length) {
            alert(`${files.length - selectedFiles.length} file(s) were skipped because they are not audio files.`);
        }
        
        updateFilePreview(selectedFiles);
        uploadBtn.disabled = selectedFiles.length === 0;
        dropArea.classList.add('has-file');
    }
    
    function updateFilePreview(files) {
        // Clear previous preview
        filePreview.innerHTML = '';
        
        // Add batch summary if multiple files
        if (files.length > 1) {
            const batchSummary = document.createElement('div');
            batchSummary.className = 'batch-summary';
            
            // Calculate total size
            const totalSizeBytes = files.reduce((total, file) => total + file.size, 0);
            const totalSizeFormatted = formatFileSize(totalSizeBytes);
            
            batchSummary.innerHTML = `
                <div class="batch-header">
                    <span class="batch-title">Batch Processing: ${files.length} Files</span>
                    <span class="batch-size">Total Size: ${totalSizeFormatted}</span>
                </div>
            `;
            filePreview.appendChild(batchSummary);
        }
        
        // Add each file to the preview
        files.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            
            // Format file size
            const fileSize = formatFileSize(file.size);
            
            fileItem.innerHTML = `
                <div class="file-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17.5 22h.5c.5 0 1-.2 1.4-.6.4-.4.6-.9.6-1.4V7.5L14.5 2H6c-.5 0-1 .2-1.4.6C4.2 3 4 3.5 4 4v3"></path>
                        <path d="M14 2v6h6"></path>
                        <circle cx="10" cy="16" r="6"></circle>
                        <path d="M8 16v-1.5a2 2 0 0 1 4 0V16"></path>
                        <path d="M10 19v-6"></path>
                    </svg>
                </div>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${fileSize}</div>
                </div>
                <div class="file-remove" data-index="${index}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </div>
            `;
            
            filePreview.appendChild(fileItem);
        });
        
        // Add event listeners for remove buttons
        document.querySelectorAll('.file-remove').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(button.dataset.index);
                selectedFiles.splice(index, 1);
                updateFilePreview(selectedFiles);
                uploadBtn.disabled = selectedFiles.length === 0;
                if (selectedFiles.length === 0) {
                    dropArea.classList.remove('has-file');
                }
            });
        });
    }
    
    // Helper function to format file size
    function formatFileSize(bytes) {
        if (bytes < 1024) {
            return `${bytes} B`;
        } else if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        } else {
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        }
    }
    
    // Clear selected files
    clearBtn.addEventListener('click', () => {
        selectedFiles = [];
        filePreview.innerHTML = '';
        fileInput.value = '';
        uploadBtn.disabled = true;
        dropArea.classList.remove('has-file');
    });
    
    // Settings handling
    const beepVolumeSlider = document.getElementById('beep-volume');
    const volumeValueDisplay = document.getElementById('volume-value');
    const audioVolumeSlider = document.getElementById('audio-volume');
    const audioVolumeValueDisplay = document.getElementById('audio-volume-value');
    const deepgramApiKeyInput = document.getElementById('deepgram-api-key');
    const saveApiKeyBtn = document.getElementById('save-api-key');
    
    // Update volume displays when sliders change
    beepVolumeSlider.addEventListener('input', () => {
        volumeValueDisplay.textContent = `${beepVolumeSlider.value}%`;
    });
    
    audioVolumeSlider.addEventListener('input', () => {
        audioVolumeValueDisplay.textContent = `${audioVolumeSlider.value}%`;
    });
    
    // Save Deepgram API key
    saveApiKeyBtn.addEventListener('click', async () => {
        const apiKey = deepgramApiKeyInput.value.trim();
        
        if (!apiKey) {
            alert('Please enter a valid API key');
            return;
        }
        
        try {
            const response = await fetch('/api/settings/deepgram-key', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ apiKey })
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert('API key saved successfully');
                deepgramApiKeyInput.value = '';
            } else {
                alert(`Failed to save API key: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error saving API key:', error);
            alert(`Error saving API key: ${error.message || 'Network error'}`);
        }
    });
    
    // Upload files
    uploadBtn.addEventListener('click', async () => {
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
        
        // Process files sequentially
        let currentFileIndex = 0;
        let successCount = 0;
        let errorCount = 0;
        
        const processNextFile = () => {
            if (currentFileIndex >= selectedFiles.length) {
                // All files processed
                const totalFiles = selectedFiles.length;
                progressText.textContent = `Completed: ${successCount} of ${totalFiles} files processed successfully`;
                
                setTimeout(() => {
                    // Reset form
                    clearBtn.click();
                    uploadProgress.classList.add('hidden');
                    
                    // Refresh recordings list
                    fetchRecordings();
                    
                    // Show summary
                    if (errorCount > 0) {
                        alert(`Batch processing completed with ${errorCount} errors.\n${successCount} of ${totalFiles} files were processed successfully.`);
                    } else {
                        alert(`Batch processing completed successfully. All ${totalFiles} files were processed.`);
                    }
                }, 1000);
                
                return;
            }
            
            const file = selectedFiles[currentFileIndex];
            const fileName = file.name;
            
            // Update progress
            const overallProgress = (currentFileIndex / selectedFiles.length) * 100;
            progressFill.style.width = `${overallProgress}%`;
            progressText.textContent = `Processing file ${currentFileIndex + 1} of ${selectedFiles.length}: ${fileName}`;
            
            // Create form data for this file
            const formData = new FormData();
            formData.append('audio', file);
            formData.append('beepVolume', beepVolume);
            formData.append('audioVolume', audioVolume);
            
            // Upload the file
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    // Calculate file progress
                    const fileProgress = (event.loaded / event.total) * 100;
                    // Calculate overall progress (previous files + current file progress)
                    const overallProgress = ((currentFileIndex + (event.loaded / event.total)) / selectedFiles.length) * 100;
                    progressFill.style.width = `${overallProgress}%`;
                    
                    if (fileProgress < 100) {
                        progressText.textContent = `Uploading file ${currentFileIndex + 1} of ${selectedFiles.length}: ${fileName} (${Math.round(fileProgress)}%)`;
                    } else {
                        progressText.textContent = `Processing file ${currentFileIndex + 1} of ${selectedFiles.length}: ${fileName}`;
                    }
                }
            });
            
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        successCount++;
                        console.log(`File ${currentFileIndex + 1} processed successfully:`, response);
                    } catch (parseError) {
                        console.error('Error parsing response:', parseError);
                        errorCount++;
                    }
                } else {
                    errorCount++;
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
                                errorDetails += '\n\n' + errorResponse.message;
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing error response:', e);
                    }
                    
                    console.error(`Error processing file ${fileName}:`, errorMessage, errorDetails);
                }
                
                // Process next file regardless of success/failure
                currentFileIndex++;
                processNextFile();
            });
            
            xhr.addEventListener('error', () => {
                console.error(`Network error processing file ${fileName}`);
                errorCount++;
                currentFileIndex++;
                processNextFile();
            });
            
            xhr.addEventListener('timeout', () => {
                console.error(`Timeout processing file ${fileName}`);
                errorCount++;
                currentFileIndex++;
                processNextFile();
            });
            
            // Set timeout to 5 minutes for large files that need processing
            xhr.timeout = 300000;
            xhr.open('POST', '/api/upload');
            xhr.send(formData);
        };
        
        // Start processing the first file
        processNextFile();
    });

    // Fetch and display recordings
    function fetchRecordings() {
        fetch('/api/calls')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(recordings => {
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
    }

    function displayRecordings(recordings) {
        recordingsList.innerHTML = '';
        
        recordings.forEach(recording => {
            const recordingItem = document.createElement('div');
            recordingItem.className = 'recording-item';
            
            const date = new Date(recording.uploadDate);
            const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            
            recordingItem.innerHTML = `
                <div class="recording-info">
                    <div class="recording-title">
                        ${recording.originalFileName}
                        <span class="sensitive-count">${recording.sensitiveInfoCount} sensitive items</span>
                    </div>
                    <div class="recording-meta">
                        <span>Uploaded: ${formattedDate}</span>
                    </div>
                </div>
                <div class="recording-actions">
                    <button class="action-btn download-original" data-id="${recording.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Original
                    </button>
                    <button class="action-btn download-redacted" data-id="${recording.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Redacted
                    </button>
                    <button class="action-btn download-transcript" data-id="${recording.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        Transcript
                    </button>
                </div>
            `;
            
            recordingsList.appendChild(recordingItem);
        });
        
        // Add event listeners for download buttons
        document.querySelectorAll('.download-original').forEach(button => {
            button.addEventListener('click', () => {
                window.location.href = `/api/download/original/${button.dataset.id}`;
            });
        });
        
        document.querySelectorAll('.download-redacted').forEach(button => {
            button.addEventListener('click', () => {
                window.location.href = `/api/download/redacted/${button.dataset.id}`;
            });
        });
        
        document.querySelectorAll('.download-transcript').forEach(button => {
            button.addEventListener('click', () => {
                window.location.href = `/api/download/transcript/${button.dataset.id}`;
            });
        });
    }

    // Initial fetch of recordings
    fetchRecordings();
});
