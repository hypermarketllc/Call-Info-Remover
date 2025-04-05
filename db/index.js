/**
 * Database Module for Call Info Remover
 * 
 * This module provides database connection and utility functions for
 * interacting with the PostgreSQL database.
 */

const { Pool } = require('pg');
const format = require('pg-format');
const fs = require('fs');

// Create a connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'call_info_remover',
  user: process.env.DB_USER || 'call_info_user',
  password: process.env.DB_PASSWORD || 'your_secure_password'
});

// Log connection status
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

/**
 * Database utility functions
 */
const db = {
  /**
   * Store a new recording in the database
   * @param {Object} recording - Recording metadata
   * @param {string} recording.originalFileName - Original file name
   * @param {number} recording.sensitiveInfoCount - Number of sensitive items found
   * @param {Buffer|string} redactedAudioData - Redacted audio data as Buffer or base64 string
   * @param {string} contentType - MIME type of the audio file
   * @param {string} redactedTranscript - Redacted transcript text
   * @returns {Promise<Object>} - The created recording with ID
   */
  async storeRecording(recording, redactedAudioData, contentType, redactedTranscript) {
    const client = await pool.connect();
    
    try {
      // Begin transaction
      await client.query('BEGIN');
      
      // Insert recording metadata
      const recordingResult = await client.query(
        'INSERT INTO recordings (original_filename, upload_date, sensitive_info_count) VALUES ($1, NOW(), $2) RETURNING *',
        [recording.originalFileName, recording.sensitiveInfoCount]
      );
      
      const recordingId = recordingResult.rows[0].id;
      
      // Convert Buffer to base64 if needed
      const base64Data = Buffer.isBuffer(redactedAudioData) 
        ? redactedAudioData.toString('base64') 
        : redactedAudioData;
      
      // Insert redacted audio
      await client.query(
        'INSERT INTO redacted_audio (recording_id, content_type, data) VALUES ($1, $2, $3)',
        [recordingId, contentType, base64Data]
      );
      
      // Insert redacted transcript
      await client.query(
        'INSERT INTO redacted_transcripts (recording_id, content) VALUES ($1, $2)',
        [recordingId, redactedTranscript]
      );
      
      // Commit transaction
      await client.query('COMMIT');
      
      return recordingResult.rows[0];
    } catch (err) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
  
  /**
   * Get all recordings
   * @returns {Promise<Array>} - Array of recording objects
   */
  async getAllRecordings() {
    const result = await pool.query(
      'SELECT id, original_filename, upload_date, sensitive_info_count FROM recordings ORDER BY upload_date DESC'
    );
    return result.rows;
  },
  
  /**
   * Get a specific recording by ID
   * @param {number|string} id - Recording ID
   * @returns {Promise<Object>} - Recording object
   */
  async getRecordingById(id) {
    const result = await pool.query(
      'SELECT id, original_filename, upload_date, sensitive_info_count FROM recordings WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  },
  
  /**
   * Get redacted audio for a recording
   * @param {number|string} recordingId - Recording ID
   * @returns {Promise<Object>} - Object with content_type and data (base64)
   */
  async getRedactedAudio(recordingId) {
    const result = await pool.query(
      'SELECT content_type, data FROM redacted_audio WHERE recording_id = $1',
      [recordingId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  },
  
  /**
   * Get redacted transcript for a recording
   * @param {number|string} recordingId - Recording ID
   * @returns {Promise<string>} - Transcript text
   */
  async getRedactedTranscript(recordingId) {
    const result = await pool.query(
      'SELECT content FROM redacted_transcripts WHERE recording_id = $1',
      [recordingId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0].content;
  },
  
  /**
   * Delete a recording and its associated data
   * @param {number|string} id - Recording ID
   * @returns {Promise<boolean>} - True if deleted, false if not found
   */
  async deleteRecording(id) {
    // Due to CASCADE constraints, this will also delete associated audio and transcript
    const result = await pool.query(
      'DELETE FROM recordings WHERE id = $1 RETURNING id',
      [id]
    );
    
    return result.rowCount > 0;
  },
  
  /**
   * Close the database connection pool
   */
  async close() {
    await pool.end();
  }
};

module.exports = db;
