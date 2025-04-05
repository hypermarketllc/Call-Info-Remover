# Parallel Processing Implementation for Call Info Remover

## Original Sequential Processing vs. New Parallel Processing

### Original Sequential Approach

In the original implementation, files were processed one at a time in sequence:

1. User selects multiple files
2. First file is uploaded
3. System waits for first file to be fully processed
4. Second file starts uploading only after first file is completely done
5. This continues until all files are processed
6. UI is updated only after all files are processed

This approach is simple but inefficient, especially for multiple large files, as each file must wait for the previous one to complete before processing begins.

### New Parallel Processing Approach

The new implementation processes multiple files simultaneously:

1. User selects multiple files
2. All files begin uploading and processing in parallel (up to a maximum of 3 at once)
3. Each file's progress is tracked independently
4. As each file completes processing, it immediately appears in the recordings list
5. Overall progress shows the combined status of all files

This approach is much more efficient and provides a better user experience, especially for multiple files.

## Technical Implementation Details

### 1. File Status Tracking

Each file has its own status object that tracks:
- Current state (pending, uploading, processing, completed, failed)
- Progress percentage (0-100%)
- Job ID for server communication
- File metadata

```javascript
const fileStatuses = selectedFiles.map((file, index) => ({
    file,
    index,
    status: 'pending', // pending, uploading, processing, completed, failed
    progress: 0,
    jobId: null
}));
```

### 2. Progress Calculation

Overall progress is calculated as the average of all individual file progress:

```javascript
function updateOverallProgress() {
    const totalProgress = fileStatuses.reduce((sum, file) => sum + file.progress, 0) / totalFiles;
    progressFill.style.width = `${totalProgress}%`;
    
    // Update progress text
    const pendingCount = fileStatuses.filter(f => f.status === 'pending').length;
    const uploadingCount = fileStatuses.filter(f => f.status === 'uploading').length;
    const processingCount = fileStatuses.filter(f => f.status === 'processing').length;
    
    progressText.textContent = `Progress: ${completedCount} of ${totalFiles} completed, ${uploadingCount} uploading, ${processingCount} processing`;
}
```

### 3. Parallel Processing with Controlled Concurrency

To avoid overwhelming the server, files are processed in batches with a maximum of 3 concurrent uploads:

```javascript
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
```

### 4. Promise-Based Processing

Each file's processing is wrapped in a Promise to allow for proper async/await handling:

```javascript
function processFile(fileStatus) {
    return new Promise((resolve) => {
        // File processing logic here
        // ...
        // Resolve the promise when done
        resolve();
    });
}
```

### 5. Real-Time UI Updates

As each file completes processing, the recordings list is immediately updated:

```javascript
if (data.status === 'completed') {
    // Processing complete
    clearInterval(pollInterval);
    successCount++;
    completedCount++;
    fileStatus.status = 'completed';
    fileStatus.progress = 100;
    updateOverallProgress();
    console.log(`File ${index + 1} processed successfully:`, data.result);
    
    // Update the recordings list immediately when a file is processed
    fetchRecordings();
    
    // Check if all files are completed
    checkAllCompleted();
}
```

## Benefits of Parallel Processing

1. **Efficiency**: Multiple files are processed simultaneously, reducing total processing time
2. **Better User Experience**: Users see progress for all files and get access to processed files immediately
3. **Resource Utilization**: Server resources are used more efficiently
4. **Resilience**: If one file fails, others continue processing independently
5. **Scalability**: The system can handle larger batches of files more effectively

## Technical Considerations

1. **Server Load**: The implementation limits concurrent uploads to 3 files to avoid overwhelming the server
2. **Progress Tracking**: Each file's progress is tracked separately and combined for overall progress
3. **Error Handling**: Errors for individual files don't affect the processing of other files
4. **UI Responsiveness**: The UI remains responsive and informative throughout the process
5. **Backward Compatibility**: The implementation maintains compatibility with the server's existing API

This parallel processing approach significantly improves the efficiency and user experience of the Call Info Remover application when processing multiple files.