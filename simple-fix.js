/**
 * Simple Fix Script for Call Info Remover Download Issue
 * 
 * This script fixes the download endpoint issue by modifying the server.js file
 * to properly retrieve redacted audio data from the database.
 */

const fs = require('fs');
const path = require('path');

console.log('=== CALL INFO REMOVER SIMPLE FIX ===');

// Fix the download endpoints in server.js
console.log('\nFixing download endpoints in server.js...');
try {
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
    
    addLog(LOG_LEVELS.INFO, 'api', \`Sending redacted audio file: \${recording.original_filename}\`);
    
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
  let updatedServerJs = serverJs;
  if (serverJs.includes(originalRedactedAudioEndpoint)) {
    updatedServerJs = serverJs.replace(originalRedactedAudioEndpoint, fixedRedactedAudioEndpoint);
    console.log('Fixed redacted audio download endpoint');
  } else {
    console.log('Original redacted audio endpoint not found. The server.js file might have a different format.');
    console.log('Please check the server.js file manually and update the download endpoint.');
  }

  // Write the updated server.js file
  fs.writeFileSync(serverJsPath, updatedServerJs);
  console.log('Download endpoint fixed successfully');
  
  console.log('\n=== FIX COMPLETE ===');
  console.log('Please restart your server with: pm2 restart call-info-remover');
  console.log('Then verify that the fix worked by uploading and downloading a new audio file.');
} catch (error) {
  console.error('Error fixing download endpoint:', error);
}