addLog(LOG_LEVELS.WARNING, 'api', `Recording not found with ID: ${req.params.id}`);
      res.status(404).json({ error: 'Call not found' });
    }
  } catch (error) {
    addLog(LOG_LEVELS.ERROR, 'api', 'Error retrieving recording details', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ error: 'Error retrieving recording details' });
  }
});

// Download redacted audio
app.get('/api/download/redacted/:id', async (req, res) => {
  addLog(LOG_LEVELS.INFO, 'api', `=== API REQUEST: DOWNLOAD REDACTED AUDIO (ID: ${req.params.id}) ===`);
  
  try {
    const recording = await db.getRecordingById(req.params.id);
    
    if (!recording) {
      addLog(LOG_LEVELS.WARNING, 'api', `Recording not found with ID: ${req.params.id}`);
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    addLog(LOG_LEVELS.INFO, 'api', `Found recording: ${recording.original_filename}`);
    
    // Get redacted audio from database
    const redactedAudio = await db.getRedactedAudio(recording.id);
    
    if (!redactedAudio) {
      addLog(LOG_LEVELS.ERROR, 'api', `Redacted audio not found for recording ID: ${recording.id}`);
      return res.status(404).json({ error: 'Redacted audio file not found' });
    }
    
    const downloadFilename = `redacted_${recording.original_filename}`;
    addLog(LOG_LEVELS.INFO, 'api', `Sending redacted file: ${downloadFilename}`);
    
    // Convert base64 to buffer
    const audioBuffer = Buffer.from(redactedAudio.data, 'base64');
    
    // Set content type and disposition headers
    res.setHeader('Content-Type', redactedAudio.content_type);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    res.setHeader('Content-Length', audioBuffer.length);
    
    // Send the file
    res.send(audioBuffer);
    
    addLog(LOG_LEVELS.SUCCESS, 'api', `Redacted file download completed: ${downloadFilename}`);
  } catch (error) {
    addLog(LOG_LEVELS.ERROR, 'api', 'Error in download redacted endpoint', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ error: 'Server error while downloading file' });
  }
});

// Download transcript
app.get('/api/download/transcript/:id', async (req, res) => {
  addLog(LOG_LEVELS.INFO, 'api', `=== API REQUEST: DOWNLOAD TRANSCRIPT (ID: ${req.params.id}) ===`);
  
  try {
    const recording = await db.getRecordingById(req.params.id);
    
    if (!recording) {
      addLog(LOG_LEVELS.WARNING, 'api', `Recording not found with ID: ${req.params.id}`);
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    addLog(LOG_LEVELS.INFO, 'api', `Found recording: ${recording.original_filename}`);
    
    // Get redacted transcript from database
    const transcript = await db.getRedactedTranscript(recording.id);
    
    if (!transcript) {
      addLog(LOG_LEVELS.ERROR, 'api', `Transcript not found for recording ID: ${recording.id}`);
      return res.status(404).json({ error: 'Transcript file not found' });
    }
    
    const downloadFilename = `transcript_${recording.original_filename}.txt`;
    addLog(LOG_LEVELS.INFO, 'api', `Sending transcript file: ${downloadFilename}`);
    
    // Set content type and disposition headers
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    
    // Send the transcript
    res.send(transcript);
    
    addLog(LOG_LEVELS.SUCCESS, 'api', `Transcript file download completed: ${downloadFilename}`);
  } catch (error) {
    addLog(LOG_LEVELS.ERROR, 'api', 'Error in download transcript endpoint', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ error: 'Server error while downloading file' });
  }
});

// Add API endpoints for logs
app.get('/api/logs', (req, res) => {
  // Don't log every request for logs to avoid cluttering the logs
  res.json(logs);
});

// Add endpoint to clear logs
app.post('/api/logs/clear', (req, res) => {
  addLog(LOG_LEVELS.INFO, 'system', 'Clearing logs at user request');
  logs.length = 0;
  addLog(LOG_LEVELS.INFO, 'system', 'Logs cleared');
  res.json({ success: true });
});

// Start server
app.listen(port, () => {
  addLog(LOG_LEVELS.INFO, 'system', '=== AUDIO REDACTION SERVER STARTED ===');
  addLog(LOG_LEVELS.INFO, 'system', `Server running on port ${port}`);
  addLog(LOG_LEVELS.INFO, 'system', `Server time: ${new Date().toISOString()}`);
  
  addLog(LOG_LEVELS.INFO, 'system', 'API endpoints available', {
    endpoints: [
      'POST /api/upload - Upload and process audio file',
      'GET /api/calls - List all processed recordings',
      'GET /api/calls/:id - Get details for a specific recording',
      'GET /api/download/redacted/:id - Download redacted audio',
      'GET /api/download/transcript/:id - Download transcript',
      'GET /api/logs - Get processing logs',
      'POST /api/logs/clear - Clear logs'
    ]
  });
  
  addLog(LOG_LEVELS.SUCCESS, 'system', '=== SERVER READY ===');
});
