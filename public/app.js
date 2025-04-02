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
    
    let selectedFile = null;
    
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
        // Only accept the first file and only audio files
        const file = files[0];
        
        if (!file.type.startsWith('audio/')) {
            alert('Please select an audio file.');
            return;
        }
        
        selectedFile = file;
        updateFilePreview(file);
        uploadBtn.disabled = false;
        dropArea.classList.add('has-file');
    }
    
    function updateFilePreview(file) {
        // Clear previous preview
        filePreview.innerHTML = '';
        
        // Create preview element
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        // Format file size
        const fileSizeInKB = file.size / 1024;
        let fileSize;
        if (fileSizeInKB < 1024) {
            fileSize = fileSizeInKB.toFixed(1) + ' KB';
        } else {
            fileSize = (fileSizeInKB / 1024).toFixed(1) + ' MB';
        }
        
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
        `;
        
        filePreview.appendChild(fileItem);
    }
    
    // Clear selected file
    clearBtn.addEventListener('click', () => {
        selectedFile = null;
        filePreview.innerHTML = '';
        fileInput.value = '';
        uploadBtn.disabled = true;
        dropArea.classList.remove('has-file');
    });
    
    // Upload file
    uploadBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            return;
        }
        
        // Show progress
        uploadProgress.classList.remove('hidden');
        progressFill.style.width = '0%';
        progressText.textContent = 'Preparing upload...';
        
        // Create form data
        const formData = new FormData();
        formData.append('audio', selectedFile);
        
        try {
            // Start upload with progress monitoring
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    progressFill.style.width = percentComplete + '%';
                    
                    if (percentComplete < 100) {
                        progressText.textContent = `Uploading... ${Math.round(percentComplete)}%`;
                    } else {
                        progressText.textContent = 'Processing audio...';
                    }
                }
            });
            
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        
                        // Show success message
                        progressText.textContent = 'Upload complete!';
                        progressFill.style.width = '100%';
                        
                        setTimeout(() => {
                            // Reset form
                            clearBtn.click();
                            uploadProgress.classList.add('hidden');
                            
                            // Refresh recordings list
                            fetchRecordings();
                            
                            // Show logs after successful upload
                            fetchLogs();
                            logsCard.classList.remove('hidden');
                            logsCard.scrollIntoView({ behavior: 'smooth' });
                        }, 1000);
                    } catch (parseError) {
                        console.error('Error parsing response:', parseError);
                        progressText.textContent = 'Error processing server response';
                        setTimeout(() => {
                            uploadProgress.classList.add('hidden');
                        }, 3000);
                    }
                } else {
                    // Show error
                    let errorMessage = 'An error occurred during upload.';
                    let errorDetails = '';
                    
                    try {
                        const errorResponse = JSON.parse(xhr.responseText);
                        if (errorResponse && errorResponse.error) {
                            errorMessage = errorResponse.error;
                            
                            // Check for additional details
                            if (errorResponse.details) {
                                errorDetails = errorResponse.details;
                            }
                            
                            // Check for user-friendly message
                            if (errorResponse.message) {
                                errorDetails += '\n\n' + errorResponse.message;
                            }
                        }
                    } catch (e) {
                        // If we can't parse the error, use the default message
                        console.error('Error parsing error response:', e);
                    }
                    
                    progressText.textContent = 'Upload failed';
                    
                    // Show a more detailed error message
                    if (errorDetails) {
                        alert(`Error: ${errorMessage}\n\nDetails: ${errorDetails}`);
                    } else {
                        alert(`Error: ${errorMessage}`);
                    }
                    
                    // Show logs after error to help with debugging
                    fetchLogs();
                    logsCard.classList.remove('hidden');
                    logsCard.scrollIntoView({ behavior: 'smooth' });
                    
                    setTimeout(() => {
                        uploadProgress.classList.add('hidden');
                    }, 3000);
                }
            });
            
            xhr.addEventListener('error', () => {
                progressText.textContent = 'Network error';
                alert('A network error occurred. Please check your connection and try again.');
                setTimeout(() => {
                    uploadProgress.classList.add('hidden');
                }, 3000);
            });
            
            xhr.addEventListener('timeout', () => {
                progressText.textContent = 'Request timed out';
                alert('The request timed out. The server might be busy processing other files.');
                setTimeout(() => {
                    uploadProgress.classList.add('hidden');
                }, 3000);
            });
            
            // Set timeout to 5 minutes for large files that need processing
            xhr.timeout = 300000;
            xhr.open('POST', '/api/upload');
            xhr.send(formData);
            
        } catch (error) {
            console.error('Error uploading file:', error);
            progressText.textContent = 'Upload failed';
            alert(`An error occurred: ${error.message || 'Unknown error'}`);
            setTimeout(() => {
                uploadProgress.classList.add('hidden');
            }, 3000);
        }
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

    // Log viewer functionality
    const logsCard = document.getElementById('logs-card');
    const logsContainer = document.getElementById('logs-container');
    const logFilter = document.getElementById('log-filter');
    const refreshLogsBtn = document.getElementById('refresh-logs');
    const clearLogsBtn = document.getElementById('clear-logs');

    // Function to fetch logs
    function fetchLogs() {
        fetch('/api/logs')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(logs => {
                if (logs && logs.length > 0) {
                    logsCard.classList.remove('hidden');
                    displayLogs(logs);
                } else {
                    // Still show the logs card, but with a message
                    logsCard.classList.remove('hidden');
                    logsContainer.innerHTML = '<div class="empty-logs">No logs available</div>';
                }
            })
            .catch(error => {
                console.error('Error fetching logs:', error);
                logsContainer.innerHTML = `<div class="error-logs">Error loading logs: ${error.message}</div>`;
            });
    }

    // Function to display logs
    function displayLogs(logs) {
        // Clear existing logs
        logsContainer.innerHTML = '';
        
        // Filter logs if needed
        const filterValue = logFilter.value;
        const filteredLogs = filterValue === 'all' 
            ? logs 
            : logs.filter(log => log.category === filterValue);
        
        // Display logs in reverse chronological order (newest first)
        filteredLogs.reverse().forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            
            // Format timestamp for display
            const timestamp = new Date(log.timestamp);
            const formattedTime = timestamp.toLocaleTimeString();
            
            // Create log header with timestamp, level, and category
            const logHeader = document.createElement('div');
            logHeader.className = 'log-header';
            logHeader.innerHTML = `
                <span class="log-timestamp">${formattedTime}</span>
                <div>
                    <span class="log-level log-level-${log.level}">${log.level.toUpperCase()}</span>
                    <span class="log-category">${log.category}</span>
                </div>
            `;
            
            // Create log message
            const logMessage = document.createElement('div');
            logMessage.className = 'log-message';
            logMessage.textContent = log.message;
            
            // Add elements to log entry
            logEntry.appendChild(logHeader);
            logEntry.appendChild(logMessage);
            
            // Add details if available
            if (log.details) {
                // Create a toggle for details
                const detailsToggle = document.createElement('div');
                detailsToggle.className = 'log-details-toggle';
                detailsToggle.textContent = 'Show details';
                
                // Create details container (hidden by default)
                const detailsContainer = document.createElement('div');
                detailsContainer.className = 'log-details hidden';
                detailsContainer.textContent = JSON.stringify(log.details, null, 2);
                
                // Add toggle functionality
                detailsToggle.addEventListener('click', () => {
                    if (detailsContainer.classList.contains('hidden')) {
                        detailsContainer.classList.remove('hidden');
                        detailsToggle.textContent = 'Hide details';
                    } else {
                        detailsContainer.classList.add('hidden');
                        detailsToggle.textContent = 'Show details';
                    }
                });
                
                logEntry.appendChild(detailsToggle);
                logEntry.appendChild(detailsContainer);
            }
            
            logsContainer.appendChild(logEntry);
        });
        
        // Show message if no logs match the filter
        if (filteredLogs.length === 0) {
            logsContainer.innerHTML = `<div class="empty-logs">No logs matching filter: ${filterValue}</div>`;
        }
    }

    // Event listeners for log controls
    logFilter.addEventListener('change', () => {
        fetchLogs(); // Re-fetch and filter logs
    });

    refreshLogsBtn.addEventListener('click', fetchLogs);

    clearLogsBtn.addEventListener('click', () => {
        fetch('/api/logs/clear', { method: 'POST' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(() => {
                logsContainer.innerHTML = '<div class="empty-logs">Logs cleared</div>';
            })
            .catch(error => {
                console.error('Error clearing logs:', error);
                alert(`Error clearing logs: ${error.message}`);
            });
    });

    // Initial fetch of recordings and logs
    fetchRecordings();
    fetchLogs();
    
    // Refresh logs only when manually requested to avoid log clutter
    // No automatic polling - user must click the Refresh button to see new logs
});
