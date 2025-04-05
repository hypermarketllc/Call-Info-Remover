/**
 * Script to enhance download endpoints in server.js with detailed logging
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

// Replace the database import
let enhancedServerJs = serverJs.replace(
  "const db = require('./db');",
  "// Use enhanced database module with detailed logging\nconst db = require('./db/enhanced-index');\n\n// Import enhanced logging\nconst logger = require('./enhanced-logging');"
);

// Enhance the download redacted audio endpoint
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

const enhancedRedactedAudioEndpoint = `// Download redacted audio
app.get('/api/download/redacted/:id', async (req, res) => {
  addLog(LOG_LEVELS.INFO, 'api', \`=== API REQUEST: DOWNLOAD REDACTED AUDIO (ID: \${req.params.id}) ===\`);
  logger.download.info(\`Download request for redacted audio ID: \${req.params.id}\`, {
    requestUrl: req.originalUrl,
    requestHeaders: req.headers,
    requestIp: req.ip
  });
  
  try {
    // Get recording metadata
    logger.download.debug(\`Getting recording metadata for ID: \${req.params.id}\`);
    const recording = await db.getRecordingById(req.params.id);
    
    if (!recording) {
      logger.download.warning(\`Recording not found for ID: \${req.params.id}\`);
      addLog(LOG_LEVELS.WARNING, 'api', \`Recording not found for ID: \${req.params.id}\`);
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    logger.download.info(\`Found recording: \${recording.original_filename}\`, recording);
    
    // Get redacted audio data
    logger.download.debug(\`Getting redacted audio data for recording ID: \${recording.id}\`);
    const redactedAudio = await db.getRedactedAudio(recording.id);
    
    if (!redactedAudio) {
      logger.download.warning(\`Redacted audio not found for recording ID: \${recording.id}\`);
      addLog(LOG_LEVELS.WARNING, 'api', \`Redacted audio not found for ID: \${req.params.id}\`);
      return res.status(404).json({ error: 'Redacted audio not found' });
    }
    
    logger.download.info(\`Found redacted audio for recording ID: \${recording.id}\`, {
      contentType: redactedAudio.content_type,
      dataSize: redactedAudio.data ? redactedAudio.data.length : 0
    });
    
    // Verify data integrity
    if (!redactedAudio.data || redactedAudio.data.length === 0) {
      logger.download.error(\`Empty audio data for recording ID: \${recording.id}\`);
      addLog(LOG_LEVELS.ERROR, 'api', \`Empty audio data for recording ID: \${recording.id}\`);
      return res.status(500).json({ error: 'Audio data is empty or corrupted' });
    }
    
    // Convert base64 to buffer if needed
    let audioBuffer;
    try {
      if (typeof redactedAudio.data === 'string') {
        logger.download.debug(\`Converting base64 string to buffer, length: \${redactedAudio.data.length}\`);
        audioBuffer = Buffer.from(redactedAudio.data, 'base64');
      } else {
        audioBuffer = redactedAudio.data;
      }
      
      logger.download.debug(\`Audio buffer created, size: \${audioBuffer.length} bytes\`);
    } catch (conversionError) {
      logger.download.error(\`Error converting audio data to buffer\`, conversionError);
      addLog(LOG_LEVELS.ERROR, 'api', \`Error converting audio data to buffer\`, {
        error: conversionError.message,
        stack: conversionError.stack
      });
      return res.status(500).json({ error: 'Error processing audio data' });
    }
    
    // Set response headers
    const contentType = redactedAudio.content_type || 'audio/mpeg';
    const filename = \`redacted_\${recording.original_filename}\`;
    
    logger.download.info(\`Sending redacted audio file\`, {
      filename,
      contentType,
      bufferSize: audioBuffer.length
    });
    
    res.set('Content-Type', contentType);
    res.set('Content-Disposition', \`attachment; filename="\${filename}"\`);
    res.set('Content-Length', audioBuffer.length);
    
    // Send the file
    addLog(LOG_LEVELS.INFO, 'api', \`Sending redacted audio file: \${recording.original_filename}\`);
    res.send(audioBuffer);
    
    logger.download.success(\`Successfully sent redacted audio file\`, {
      recordingId: recording.id,
      filename,
      contentType,
      size: audioBuffer.length
    });
  } catch (error) {
    logger.download.error(\`Error retrieving or sending redacted audio\`, error);
    addLog(LOG_LEVELS.ERROR, 'api', 'Error retrieving redacted audio', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({ error: 'Error retrieving redacted audio' });
  }
});`;

// Replace the redacted audio endpoint
enhancedServerJs = enhancedServerJs.replace(originalRedactedAudioEndpoint, enhancedRedactedAudioEndpoint);

// Add database structure verification at server startup
const serverStartupCode = `// Start server
app.listen(port, () => {
  addLog(LOG_LEVELS.INFO, 'system', '=== AUDIO REDACTION SERVER STARTED ===');
  addLog(LOG_LEVELS.INFO, 'system', \`Server running on port \${port}\`);
  addLog(LOG_LEVELS.INFO, 'system', \`Server time: \${new Date().toISOString()}\`);
  addLog(LOG_LEVELS.INFO, 'system', 'API endpoints available');
  addLog(LOG_LEVELS.SUCCESS, 'system', '=== SERVER READY ===');
});`;

const enhancedServerStartupCode = `// Start server
app.listen(port, async () => {
  addLog(LOG_LEVELS.INFO, 'system', '=== AUDIO REDACTION SERVER STARTED ===');
  addLog(LOG_LEVELS.INFO, 'system', \`Server running on port \${port}\`);
  addLog(LOG_LEVELS.INFO, 'system', \`Server time: \${new Date().toISOString()}\`);
  addLog(LOG_LEVELS.INFO, 'system', 'API endpoints available');
  
  // Verify database structure
  try {
    logger.system.info('Verifying database structure...');
    const dbStructure = await db.verifyDatabaseStructure();
    logger.system.info('Database structure verification complete', dbStructure);
  } catch (error) {
    logger.system.error('Error verifying database structure', error);
  }
  
  addLog(LOG_LEVELS.SUCCESS, 'system', '=== SERVER READY ===');
});`;

// Replace the server startup code
enhancedServerJs = enhancedServerJs.replace(serverStartupCode, enhancedServerStartupCode);

// Write the enhanced server.js file
console.log('Writing enhanced server.js file...');
fs.writeFileSync(serverJsPath, enhancedServerJs);

console.log('Server.js has been enhanced with detailed logging for download endpoints.');
console.log(`Original file backed up at ${backupPath}`);
console.log('\nTo use the enhanced logging:');
console.log('1. Restart your server');
console.log('2. Check the detailed_logs directory for log files');
console.log('3. The download.log file will contain detailed information about download requests');