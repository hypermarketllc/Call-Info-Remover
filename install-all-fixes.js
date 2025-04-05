/**
 * Combined Installation Script for Call Info Remover Fixes
 * 
 * This script applies all the fixes for the Call Info Remover application:
 * 1. Fixes the syntax error in server.js
 * 2. Adds the getOriginalAudio function to db/index.js
 * 3. Fixes the download endpoints in server.js
 * 4. Sets up the enhanced logging system
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== CALL INFO REMOVER FIXES INSTALLATION ===');

// Create necessary directories
console.log('\n1. Creating necessary directories...');
if (!fs.existsSync('detailed_logs')) {
  fs.mkdirSync('detailed_logs');
  console.log('Created detailed_logs directory');
} else {
  console.log('detailed_logs directory already exists');
}

// Fix 1: Fix the syntax error in server.js
console.log('\n2. Fixing syntax error in server.js...');
try {
  const serverJsPath = path.join(__dirname, 'server.js');
  const serverJs = fs.readFileSync(serverJsPath, 'utf8');
  
  // Create a backup of the original file
  const backupPath = path.join(__dirname, 'server.js.backup-' + Date.now());
  console.log(`Creating backup at ${backupPath}`);
  fs.writeFileSync(backupPath, serverJs);
  
  // Check for the syntax error at line 748
  const lines = serverJs.split('\n');
  if (lines.length >= 748 && lines[747].trim() === '});') {
    console.log('Found syntax error at line 748. Fixing...');
    lines.splice(747, 1); // Remove line 748
    const fixedServerJs = lines.join('\n');
    fs.writeFileSync(serverJsPath, fixedServerJs);
    console.log('Syntax error fixed successfully');
  } else {
    console.log('No syntax error found at line 748. Skipping this fix.');
  }
} catch (error) {
  console.error('Error fixing syntax error:', error);
}

// Fix 2: Add getOriginalAudio function to db/index.js
console.log('\n3. Adding getOriginalAudio function to db/index.js...');
try {
  const dbIndexPath = path.join(__dirname, 'db', 'index.js');
  const dbIndex = fs.readFileSync(dbIndexPath, 'utf8');
  
  // Create a backup of the original file
  const backupPath = path.join(__dirname, 'db', 'index.js.backup-' + Date.now());
  console.log(`Creating backup at ${backupPath}`);
  fs.writeFileSync(backupPath, dbIndex);
  
  // Check if getOriginalAudio function already exists
  if (dbIndex.includes('getOriginalAudio')) {
    console.log('getOriginalAudio function already exists. Skipping this fix.');
  } else {
    // Find the position to insert the new function
    const insertPosition = dbIndex.indexOf('async getRedactedTranscript');
    
    // The new getOriginalAudio function
    const getOriginalAudioFunction = `  /**
   * Get original audio for a recording
   * @param {number|string} recordingId - Recording ID
   * @returns {Promise<Object>} - Object with content_type and data (base64)
   */
  async getOriginalAudio(recordingId) {
    const result = await pool.query(
      'SELECT content_type, data FROM original_audio WHERE recording_id = $1',
      [recordingId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  },
  
`;
    
    // Insert the new function
    const updatedDbIndex = dbIndex.slice(0, insertPosition) + getOriginalAudioFunction + dbIndex.slice(insertPosition);
    fs.writeFileSync(dbIndexPath, updatedDbIndex);
    console.log('getOriginalAudio function added successfully');
  }
} catch (error) {
  console.error('Error adding getOriginalAudio function:', error);
}

// Fix 3: Fix the download endpoints in server.js
console.log('\n4. Fixing download endpoints in server.js...');
try {
  const serverJsPath = path.join(__dirname, 'server.js');
  let serverJs = fs.readFileSync(serverJsPath, 'utf8');
  
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
  if (serverJs.includes(originalRedactedAudioEndpoint)) {
    serverJs = serverJs.replace(originalRedactedAudioEndpoint, fixedRedactedAudioEndpoint);
    console.log('Fixed redacted audio download endpoint');
  } else {
    console.log('Original redacted audio endpoint not found. Skipping this fix.');
  }

  // The original original audio endpoint
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
    
    // Then get the original audio data
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

  // Replace the original audio endpoint
  if (serverJs.includes(originalOriginalAudioEndpoint)) {
    serverJs = serverJs.replace(originalOriginalAudioEndpoint, fixedOriginalAudioEndpoint);
    console.log('Fixed original audio download endpoint');
  } else {
    console.log('Original audio endpoint not found. Skipping this fix.');
  }

  // Write the updated server.js file
  fs.writeFileSync(serverJsPath, serverJs);
  console.log('Download endpoints fixed successfully');
} catch (error) {
  console.error('Error fixing download endpoints:', error);
}

// Fix 4: Set up enhanced logging
console.log('\n5. Setting up enhanced logging...');
try {
  // Check if enhanced-logging.js exists
  const enhancedLoggingPath = path.join(__dirname, 'enhanced-logging.js');
  if (!fs.existsSync(enhancedLoggingPath)) {
    console.log('enhanced-logging.js not found. Please copy it to the server first.');
  } else {
    console.log('enhanced-logging.js found');
    
    // Check if server.js already includes enhanced logging
    const serverJsPath = path.join(__dirname, 'server.js');
    const serverJs = fs.readFileSync(serverJsPath, 'utf8');
    
    if (serverJs.includes('require(\'./enhanced-logging\')')) {
      console.log('Enhanced logging already set up in server.js');
    } else {
      // Add enhanced logging to server.js
      const dbImport = 'const db = require(\'./db\');';
      const enhancedDbImport = 'const db = require(\'./db\');\n\n// Import enhanced logging\nconst logger = require(\'./enhanced-logging\');';
      
      const updatedServerJs = serverJs.replace(dbImport, enhancedDbImport);
      fs.writeFileSync(serverJsPath, updatedServerJs);
      console.log('Enhanced logging set up successfully');
    }
  }
} catch (error) {
  console.error('Error setting up enhanced logging:', error);
}

// Create original_audio table if it doesn't exist
console.log('\n6. Creating original_audio table if it doesn\'t exist...');
console.log('Please run the following SQL command manually:');
console.log(`
CREATE TABLE IF NOT EXISTS original_audio (
  id SERIAL PRIMARY KEY,
  recording_id INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
  content_type VARCHAR(255) NOT NULL,
  data TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`);

console.log('\n=== INSTALLATION COMPLETE ===');
console.log('Please restart your server with: pm2 restart call-info-remover');
console.log('Then verify that the fixes worked by uploading and downloading a new audio file.');