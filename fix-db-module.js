/**
 * Script to add the getOriginalAudio function to the db/index.js file
 */

const fs = require('fs');
const path = require('path');

// Read the db/index.js file
console.log('Reading db/index.js file...');
const dbIndexPath = path.join(__dirname, 'db', 'index.js');
const dbIndex = fs.readFileSync(dbIndexPath, 'utf8');

// Create a backup of the original file
const backupPath = path.join(__dirname, 'db', 'index.js.backup-' + Date.now());
console.log(`Creating backup at ${backupPath}`);
fs.writeFileSync(backupPath, dbIndex);

// Find the position to insert the new function
// We'll insert it after the getRedactedAudio function
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

// Write the updated db/index.js file
console.log('Writing updated db/index.js file...');
fs.writeFileSync(dbIndexPath, updatedDbIndex);

console.log('db/index.js has been updated with the getOriginalAudio function.');
console.log(`Original file backed up at ${backupPath}`);
console.log('\nTo apply this fix:');
console.log('1. Make sure the original_audio table exists in your database');
console.log('2. If the table doesn\'t exist, you can create it with:');
console.log(`
CREATE TABLE original_audio (
  id SERIAL PRIMARY KEY,
  recording_id INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
  content_type VARCHAR(255) NOT NULL,
  data TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`);
console.log('3. Restart your server: pm2 restart call-info-remover');