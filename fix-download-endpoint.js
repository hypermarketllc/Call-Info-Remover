/**
 * Script to fix the redacted audio download endpoint in server.js
 */

const fs = require('fs');
const path = require('path');

// Read the server.js file
console.log('Reading server.js file...');
const serverJsPath = path.join(__dirname, 'server.js');
const serverJs = fs.readFileSync(serverJsPath, 'utf8');

// Create a backup of the original file
const backupPath = path.join(__dirname, 'server.js.backup-' + Date.now());
console.log(`Creating backup at ${backupPath}`);
fs.writeFileSync(backupPath, serverJs);

// The original redacted audio endpoint
const originalRedactedAudioEndpoint = `// Download redacted audio
app.get('/api/download/redacted/:id', async (req, res) => {
  addLog(LOG_LEVELS.INFO, 'api', \`=== API REQUEST: DOWNLOAD REDACTED AUDIO (ID: \${req.params.id}) ===\`);
  
  try {
    const recording = await db.getRecordingById(req.params.id);
    
    if (recording && recording.redacted_audio_data) {
      addLog(LOG_LEVELS.INFO, 'api', \`Sending redacted audio file: \${recording.original_filename}\`);
      
      res.set('Content-Type', recording.redacted_content_type || 'audio/mpeg');
      res.set('Content-Disposition', \`attachment; filename="redacted_\${recording.original_filename}"\`);
      res.send(recording.redacted_audio_data);
    } else {
      addLog(LOG_LEVELS.WARNING, 'api', \`Redacted audio not found for ID: \${req.params.id}\`);
      res.status(404).json({ error: 'Redacted audio not found' });
    }
  } catch (error) {
    addLog(LOG_LEVELS.ERROR, 'api', 'Error retrieving redacted audio', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ error: 'Error retrieving redacted audio' });
  }
});`;

// The fixed redacted audio endpoint
const fixedRedactedAudioEndpoint = `// Download redacted audio
app.get('/api/download/redacted/:id', async (req, res) => {
  addLog(LOG_LEVELS.INFO, 'api', \`=== API REQUEST: DOWNLOAD REDACTED AUDIO (ID: \${req.params.id}) ===\`);
  
  try {
    // First get the recording metadata
    const recording = await db.getRecordingById(req.params.id);
    
    if (!recording) {
      addLog(LOG_LEVELS.WARNING, 'api', \`Recording not found for ID: \${req.params.id}\`);
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    // Then get the redacted audio data
    const redactedAudio = await db.getRedactedAudio(req.params.id);
    
    if (!redactedAudio) {
      addLog(LOG_LEVELS.WARNING, 'api', \`Redacted audio not found for ID: \${req.params.id}\`);
      return res.status(404).json({ error: 'Redacted audio not found' });
    }
    
    // Convert base64 to buffer if needed
    let audioBuffer;
    try {
      if (typeof redactedAudio.data === 'string') {
        audioBuffer = Buffer.from(redactedAudio.data, 'base64');
      } else {
        audioBuffer = redactedAudio.data;
      }
    } catch (conversionError) {
      addLog(LOG_LEVELS.ERROR, 'api', \`Error converting audio data to buffer\`, {
        error: conversionError.message,
        stack: conversionError.stack
      });
      return res.status(500).json({ error: 'Error processing audio data' });
    }
    
    addLog(LOG_LEVELS.INFO, 'api', \`Sending redacted audio file: \${recording.original_filename}\`, {
      contentType: redactedAudio.content_type,
      dataSize: audioBuffer.length
    });
    
    // Send the file
    res.set('Content-Type', redactedAudio.content_type || 'audio/mpeg');
    res.set('Content-Disposition', \`attachment; filename="redacted_\${recording.original_filename}"\`);
    res.set('Content-Length', audioBuffer.length);
    res.send(audioBuffer);
  } catch (error) {
    addLog(LOG_LEVELS.ERROR, 'api', 'Error retrieving redacted audio', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ error: 'Error retrieving redacted audio' });
  }
});`;

// Replace the redacted audio endpoint
const updatedServerJs = serverJs.replace(originalRedactedAudioEndpoint, fixedRedactedAudioEndpoint);

// Also fix the original audio endpoint
const originalOriginalAudioEndpoint = `// Download original audio
app.get('/api/download/original/:id', async (req, res) => {
  addLog(LOG_LEVELS.INFO, 'api', \`=== API REQUEST: DOWNLOAD ORIGINAL AUDIO (ID: \${req.params.id}) ===\`);
  
  try {
    const recording = await db.getRecordingById(req.params.id);
    
    if (recording && recording.original_audio_data) {
      addLog(LOG_LEVELS.INFO, 'api', \`Sending original audio file: \${recording.original_filename}\`);
      
      res.set('Content-Type', recording.original_content_type || 'audio/mpeg');
      res.set('Content-Disposition', \`attachment; filename="\${recording.original_filename}"\`);
      res.send(recording.original_audio_data);
    } else {
      addLog(LOG_LEVELS.WARNING, 'api', \`Original audio not found for ID: \${req.params.id}\`);
      res.status(404).json({ error: 'Original audio not found' });
    }
  } catch (error) {
    addLog(LOG_LEVELS.ERROR, 'api', 'Error retrieving original audio', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ error: 'Error retrieving original audio' });
  }
});`;

// The fixed original audio endpoint
const fixedOriginalAudioEndpoint = `// Download original audio
app.get('/api/download/original/:id', async (req, res) => {
  addLog(LOG_LEVELS.INFO, 'api', \`=== API REQUEST: DOWNLOAD ORIGINAL AUDIO (ID: \${req.params.id}) ===\`);
  
  try {
    // First get the recording metadata
    const recording = await db.getRecordingById(req.params.id);
    
    if (!recording) {
      addLog(LOG_LEVELS.WARNING, 'api', \`Recording not found for ID: \${req.params.id}\`);
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    // Then get the original audio data (if implemented)
    // Note: This assumes you have a getOriginalAudio function in your db module
    // If not, you'll need to implement it similar to getRedactedAudio
    const originalAudio = await db.getOriginalAudio(req.params.id);
    
    if (!originalAudio) {
      addLog(LOG_LEVELS.WARNING, 'api', \`Original audio not found for ID: \${req.params.id}\`);
      return res.status(404).json({ error: 'Original audio not found' });
    }
    
    // Convert base64 to buffer if needed
    let audioBuffer;
    try {
      if (typeof originalAudio.data === 'string') {
        audioBuffer = Buffer.from(originalAudio.data, 'base64');
      } else {
        audioBuffer = originalAudio.data;
      }
    } catch (conversionError) {
      addLog(LOG_LEVELS.ERROR, 'api', \`Error converting audio data to buffer\`, {
        error: conversionError.message,
        stack: conversionError.stack
      });
      return res.status(500).json({ error: 'Error processing audio data' });
    }
    
    addLog(LOG_LEVELS.INFO, 'api', \`Sending original audio file: \${recording.original_filename}\`, {
      contentType: originalAudio.content_type,
      dataSize: audioBuffer.length
    });
    
    // Send the file
    res.set('Content-Type', originalAudio.content_type || 'audio/mpeg');
    res.set('Content-Disposition', \`attachment; filename="\${recording.original_filename}"\`);
    res.set('Content-Length', audioBuffer.length);
    res.send(audioBuffer);
  } catch (error) {
    addLog(LOG_LEVELS.ERROR, 'api', 'Error retrieving original audio', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ error: 'Error retrieving original audio' });
  }
});`;

// Replace the original audio endpoint if getOriginalAudio exists
// Otherwise, we'll need to implement it
const finalServerJs = updatedServerJs.replace(originalOriginalAudioEndpoint, fixedOriginalAudioEndpoint);

// Write the fixed server.js file
console.log('Writing fixed server.js file...');
fs.writeFileSync(serverJsPath, finalServerJs);

console.log('Server.js has been fixed to properly retrieve redacted audio data.');
console.log(`Original file backed up at ${backupPath}`);
console.log('\nTo apply this fix:');
console.log('1. Restart your server: pm2 restart call-info-remover');
console.log('2. Try downloading a redacted audio file again');