/**
 * Database Diagnostic Script for Call Info Remover
 * 
 * This script directly queries the database to check if redacted audio data exists
 * and is properly stored. It helps diagnose issues with the download endpoint.
 * 
 * Usage: node diagnose-database.js [recordingId]
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Create a connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'call_info_remover',
  user: process.env.DB_USER || 'call_info_user',
  password: process.env.DB_PASSWORD || 'your_secure_password'
});

// Get recording ID from command line arguments
const recordingId = process.argv[2] || 1;

console.log(`=== DATABASE DIAGNOSTIC FOR RECORDING ID: ${recordingId} ===`);

async function diagnoseDatabase() {
  try {
    // Check database connection
    console.log('Checking database connection...');
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');
    
    // Check database tables
    console.log('\nChecking database tables...');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    const tables = tablesResult.rows.map(row => row.table_name);
    console.log(`Found ${tables.length} tables: ${tables.join(', ')}`);
    
    const requiredTables = ['recordings', 'redacted_audio', 'redacted_transcripts'];
    const missingTables = requiredTables.filter(table => !tables.includes(table));
    
    if (missingTables.length > 0) {
      console.error(`❌ Missing required tables: ${missingTables.join(', ')}`);
      return;
    }
    
    console.log('✅ All required tables exist');
    
    // Check recording exists
    console.log(`\nChecking if recording with ID ${recordingId} exists...`);
    const recordingResult = await pool.query(
      'SELECT id, original_filename, upload_date, sensitive_info_count FROM recordings WHERE id = $1',
      [recordingId]
    );
    
    if (recordingResult.rows.length === 0) {
      console.error(`❌ Recording with ID ${recordingId} not found`);
      return;
    }
    
    const recording = recordingResult.rows[0];
    console.log(`✅ Found recording: ${recording.original_filename} (uploaded: ${recording.upload_date})`);
    
    // Check redacted audio exists
    console.log(`\nChecking if redacted audio exists for recording ID ${recordingId}...`);
    const audioResult = await pool.query(
      'SELECT id, recording_id, content_type, octet_length(data) as data_size FROM redacted_audio WHERE recording_id = $1',
      [recordingId]
    );
    
    if (audioResult.rows.length === 0) {
      console.error(`❌ Redacted audio not found for recording ID ${recordingId}`);
      
      // Check if any redacted audio exists
      const anyAudioResult = await pool.query(
        'SELECT COUNT(*) as count FROM redacted_audio'
      );
      
      console.log(`Total redacted audio records in database: ${anyAudioResult.rows[0].count}`);
      
      // Check if there was an error during storage
      console.log('\nChecking for errors during storage...');
      const errorLogsPath = path.join('logs', 'err.log');
      
      if (fs.existsSync(errorLogsPath)) {
        const errorLogs = fs.readFileSync(errorLogsPath, 'utf8');
        const storageErrors = errorLogs.match(/Error storing recording|Error creating redacted audio|database|transaction|ROLLBACK/g);
        
        if (storageErrors && storageErrors.length > 0) {
          console.log('Found potential storage errors in logs:');
          console.log(storageErrors.join('\n'));
        } else {
          console.log('No obvious storage errors found in logs');
        }
      }
      
      return;
    }
    
    const audioData = audioResult.rows[0];
    console.log(`✅ Found redacted audio: ID ${audioData.id}, Content-Type: ${audioData.content_type}`);
    console.log(`   Data size: ${formatBytes(audioData.data_size)}`);
    
    if (audioData.data_size === 0) {
      console.error(`❌ Redacted audio data is empty (0 bytes)`);
      return;
    }
    
    // Check redacted transcript exists
    console.log(`\nChecking if redacted transcript exists for recording ID ${recordingId}...`);
    const transcriptResult = await pool.query(
      'SELECT id, recording_id, length(content) as content_length FROM redacted_transcripts WHERE recording_id = $1',
      [recordingId]
    );
    
    if (transcriptResult.rows.length === 0) {
      console.error(`❌ Redacted transcript not found for recording ID ${recordingId}`);
      return;
    }
    
    const transcriptData = transcriptResult.rows[0];
    console.log(`✅ Found redacted transcript: ID ${transcriptData.id}`);
    console.log(`   Transcript length: ${transcriptData.content_length} characters`);
    
    // Check data integrity
    console.log('\nChecking data integrity...');
    const dataIntegrityResult = await pool.query(
      'SELECT encode(digest(data, \'md5\'), \'hex\') as data_hash FROM redacted_audio WHERE recording_id = $1',
      [recordingId]
    );
    
    if (dataIntegrityResult.rows.length > 0) {
      console.log(`✅ Data hash: ${dataIntegrityResult.rows[0].data_hash}`);
    }
    
    // Check if data is properly encoded
    console.log('\nChecking if data is properly encoded...');
    try {
      const sampleResult = await pool.query(
        'SELECT substring(encode(data, \'base64\') from 1 for 100) as sample FROM redacted_audio WHERE recording_id = $1',
        [recordingId]
      );
      
      if (sampleResult.rows.length > 0) {
        const sample = sampleResult.rows[0].sample;
        console.log(`Data sample (first 100 chars): ${sample}`);
        
        // Check if it looks like valid base64
        const validBase64Pattern = /^[A-Za-z0-9+/=]+$/;
        if (validBase64Pattern.test(sample)) {
          console.log('✅ Data appears to be valid base64');
        } else {
          console.error('❌ Data does not appear to be valid base64');
        }
      }
    } catch (error) {
      console.error(`❌ Error checking data encoding: ${error.message}`);
    }
    
    // Summary
    console.log('\n=== DIAGNOSTIC SUMMARY ===');
    console.log(`Recording: ${recording.original_filename} (ID: ${recordingId})`);
    console.log(`Upload Date: ${recording.upload_date}`);
    console.log(`Sensitive Info Count: ${recording.sensitive_info_count}`);
    console.log(`Redacted Audio: ${audioData ? 'Found' : 'Not Found'}`);
    console.log(`Audio Size: ${audioData ? formatBytes(audioData.data_size) : 'N/A'}`);
    console.log(`Content Type: ${audioData ? audioData.content_type : 'N/A'}`);
    console.log(`Redacted Transcript: ${transcriptData ? 'Found' : 'Not Found'}`);
    
    console.log('\n=== RECOMMENDATIONS ===');
    if (audioData && audioData.data_size > 0) {
      console.log('1. The redacted audio data exists in the database and has content.');
      console.log('2. The issue might be with the download endpoint or how the data is being retrieved.');
      console.log('3. Check the server.js file for how the redacted audio is being retrieved and sent.');
      console.log('4. Use the enhanced logging system to get more detailed information about the download process.');
    } else {
      console.log('1. The redacted audio data is missing or empty.');
      console.log('2. Check the audio processing and storage pipeline.');
      console.log('3. Verify that the audio processing is completing successfully.');
      console.log('4. Check for errors during the database transaction.');
    }
    
  } catch (error) {
    console.error(`Error during database diagnosis: ${error.message}`);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Run the diagnosis
diagnoseDatabase();