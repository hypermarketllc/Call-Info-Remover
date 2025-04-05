/**
 * Enhanced Database Module for Call Info Remover with Detailed Logging
 * 
 * This module provides database connection and utility functions for
 * interacting with the PostgreSQL database with comprehensive logging.
 */

const { Pool } = require('pg');
const format = require('pg-format');
const fs = require('fs');
const path = require('path');
const logger = require('../enhanced-logging');

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
  logger.database.info('Connected to PostgreSQL database', {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'call_info_remover',
    user: process.env.DB_USER || 'call_info_user'
  });
});

pool.on('error', (err) => {
  logger.database.error('Unexpected error on idle PostgreSQL client', err);
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
    logger.database.info('Starting storeRecording transaction', {
      fileName: recording.originalFileName,
      sensitiveInfoCount: recording.sensitiveInfoCount,
      contentType: contentType,
      audioDataSize: Buffer.isBuffer(redactedAudioData) ? redactedAudioData.length : redactedAudioData.length,
      transcriptLength: redactedTranscript ? redactedTranscript.length : 0
    });
    
    const client = await pool.connect();
    logger.database.debug('Database client acquired');
    
    try {
      // Begin transaction
      logger.database.debug('Beginning transaction');
      await client.query('BEGIN');
      
      // Insert recording metadata
      const insertRecordingQuery = 'INSERT INTO recordings (original_filename, upload_date, sensitive_info_count) VALUES ($1, NOW(), $2) RETURNING *';
      logger.logQuery(insertRecordingQuery, [recording.originalFileName, recording.sensitiveInfoCount]);
      
      const recordingResult = await client.query(
        insertRecordingQuery,
        [recording.originalFileName, recording.sensitiveInfoCount]
      );
      
      logger.logQueryResult(recordingResult, 'insertRecording');
      
      if (recordingResult.rows.length === 0) {
        throw new Error('Failed to insert recording metadata - no rows returned');
      }
      
      const recordingId = recordingResult.rows[0].id;
      logger.database.info(`Recording metadata inserted with ID: ${recordingId}`);
      
      // Convert Buffer to base64 if needed
      logger.database.debug('Processing audio data for storage', {
        isBuffer: Buffer.isBuffer(redactedAudioData),
        dataLength: Buffer.isBuffer(redactedAudioData) ? redactedAudioData.length : redactedAudioData.length
      });
      
      const base64Data = Buffer.isBuffer(redactedAudioData) 
        ? redactedAudioData.toString('base64') 
        : redactedAudioData;
      
      logger.database.debug('Audio data converted to base64', {
        base64Length: base64Data.length
      });
      
      // Insert redacted audio
      const insertAudioQuery = 'INSERT INTO redacted_audio (recording_id, content_type, data) VALUES ($1, $2, $3)';
      logger.logQuery(insertAudioQuery, [recordingId, contentType, `<Base64 data of length ${base64Data.length}>`]);
      
      await client.query(
        insertAudioQuery,
        [recordingId, contentType, base64Data]
      );
      
      logger.database.info('Redacted audio data inserted', {
        recordingId,
        contentType,
        dataSize: base64Data.length
      });
      
      // Insert redacted transcript
      const insertTranscriptQuery = 'INSERT INTO redacted_transcripts (recording_id, content) VALUES ($1, $2)';
      logger.logQuery(insertTranscriptQuery, [recordingId, `<Transcript of length ${redactedTranscript.length}>`]);
      
      await client.query(
        insertTranscriptQuery,
        [recordingId, redactedTranscript]
      );
      
      logger.database.info('Redacted transcript inserted', {
        recordingId,
        transcriptLength: redactedTranscript.length
      });
      
      // Commit transaction
      logger.database.debug('Committing transaction');
      await client.query('COMMIT');
      
      logger.database.success('Recording stored successfully', {
        recordingId,
        fileName: recording.originalFileName
      });
      
      return recordingResult.rows[0];
    } catch (err) {
      // Rollback transaction on error
      logger.database.error('Error storing recording - rolling back transaction', err);
      await client.query('ROLLBACK');
      throw err;
    } finally {
      logger.database.debug('Releasing database client');
      client.release();
    }
  },
  
  /**
   * Get all recordings
   * @returns {Promise<Array>} - Array of recording objects
   */
  async getAllRecordings() {
    logger.database.info('Getting all recordings');
    
    const query = 'SELECT id, original_filename, upload_date, sensitive_info_count FROM recordings ORDER BY upload_date DESC';
    logger.logQuery(query);
    
    try {
      const result = await pool.query(query);
      
      logger.database.info(`Retrieved ${result.rows.length} recordings`);
      logger.logQueryResult(result, 'getAllRecordings');
      
      return result.rows;
    } catch (err) {
      logger.database.error('Error retrieving all recordings', err);
      throw err;
    }
  },
  
  /**
   * Get a specific recording by ID
   * @param {number|string} id - Recording ID
   * @returns {Promise<Object>} - Recording object
   */
  async getRecordingById(id) {
    logger.database.info(`Getting recording by ID: ${id}`);
    
    const query = 'SELECT id, original_filename, upload_date, sensitive_info_count FROM recordings WHERE id = $1';
    logger.logQuery(query, [id]);
    
    try {
      const result = await pool.query(query, [id]);
      
      logger.logQueryResult(result, 'getRecordingById');
      
      if (result.rows.length === 0) {
        logger.database.warning(`Recording not found with ID: ${id}`);
        return null;
      }
      
      logger.database.info(`Retrieved recording: ${result.rows[0].original_filename}`);
      return result.rows[0];
    } catch (err) {
      logger.database.error(`Error retrieving recording with ID: ${id}`, err);
      throw err;
    }
  },
  
  /**
   * Get redacted audio for a recording
   * @param {number|string} recordingId - Recording ID
   * @returns {Promise<Object>} - Object with content_type and data (base64)
   */
  async getRedactedAudio(recordingId) {
    logger.database.info(`Getting redacted audio for recording ID: ${recordingId}`);
    
    const query = 'SELECT content_type, data FROM redacted_audio WHERE recording_id = $1';
    logger.logQuery(query, [recordingId]);
    
    try {
      const result = await pool.query(query, [recordingId]);
      
      if (result.rows.length === 0) {
        logger.database.warning(`Redacted audio not found for recording ID: ${recordingId}`);
        return null;
      }
      
      logger.database.info('Retrieved redacted audio', {
        recordingId,
        contentType: result.rows[0].content_type,
        dataSize: result.rows[0].data ? result.rows[0].data.length : 0
      });
      
      // Verify data integrity
      if (!result.rows[0].data || result.rows[0].data.length === 0) {
        logger.database.error(`Retrieved empty audio data for recording ID: ${recordingId}`);
      }
      
      return result.rows[0];
    } catch (err) {
      logger.database.error(`Error retrieving redacted audio for recording ID: ${recordingId}`, err);
      throw err;
    }
  },
  
  /**
   * Get redacted transcript for a recording
   * @param {number|string} recordingId - Recording ID
   * @returns {Promise<string>} - Transcript text
   */
  async getRedactedTranscript(recordingId) {
    logger.database.info(`Getting redacted transcript for recording ID: ${recordingId}`);
    
    const query = 'SELECT content FROM redacted_transcripts WHERE recording_id = $1';
    logger.logQuery(query, [recordingId]);
    
    try {
      const result = await pool.query(query, [recordingId]);
      
      if (result.rows.length === 0) {
        logger.database.warning(`Redacted transcript not found for recording ID: ${recordingId}`);
        return null;
      }
      
      logger.database.info('Retrieved redacted transcript', {
        recordingId,
        contentLength: result.rows[0].content ? result.rows[0].content.length : 0
      });
      
      return result.rows[0].content;
    } catch (err) {
      logger.database.error(`Error retrieving redacted transcript for recording ID: ${recordingId}`, err);
      throw err;
    }
  },
  
  /**
   * Delete a recording and its associated data
   * @param {number|string} id - Recording ID
   * @returns {Promise<boolean>} - True if deleted, false if not found
   */
  async deleteRecording(id) {
    logger.database.info(`Deleting recording with ID: ${id}`);
    
    const query = 'DELETE FROM recordings WHERE id = $1 RETURNING id';
    logger.logQuery(query, [id]);
    
    try {
      const result = await pool.query(query, [id]);
      
      const deleted = result.rowCount > 0;
      
      if (deleted) {
        logger.database.success(`Recording with ID ${id} deleted successfully`);
      } else {
        logger.database.warning(`Recording with ID ${id} not found for deletion`);
      }
      
      return deleted;
    } catch (err) {
      logger.database.error(`Error deleting recording with ID: ${id}`, err);
      throw err;
    }
  },
  
  /**
   * Close the database connection pool
   */
  async close() {
    logger.database.info('Closing database connection pool');
    await pool.end();
    logger.database.info('Database connection pool closed');
  },
  
  /**
   * Verify database tables exist and are properly structured
   * This can help diagnose issues with the database schema
   */
  async verifyDatabaseStructure() {
    logger.database.info('Verifying database structure');
    
    try {
      // Check recordings table
      const recordingsQuery = `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'recordings'
      `;
      logger.logQuery(recordingsQuery);
      const recordingsResult = await pool.query(recordingsQuery);
      
      logger.database.info('Recordings table structure', {
        exists: recordingsResult.rows.length > 0,
        columns: recordingsResult.rows.map(row => `${row.column_name} (${row.data_type})`)
      });
      
      // Check redacted_audio table
      const audioQuery = `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'redacted_audio'
      `;
      logger.logQuery(audioQuery);
      const audioResult = await pool.query(audioQuery);
      
      logger.database.info('Redacted_audio table structure', {
        exists: audioResult.rows.length > 0,
        columns: audioResult.rows.map(row => `${row.column_name} (${row.data_type})`)
      });
      
      // Check redacted_transcripts table
      const transcriptsQuery = `
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'redacted_transcripts'
      `;
      logger.logQuery(transcriptsQuery);
      const transcriptsResult = await pool.query(transcriptsQuery);
      
      logger.database.info('Redacted_transcripts table structure', {
        exists: transcriptsResult.rows.length > 0,
        columns: transcriptsResult.rows.map(row => `${row.column_name} (${row.data_type})`)
      });
      
      return {
        recordings: recordingsResult.rows.length > 0,
        redactedAudio: audioResult.rows.length > 0,
        redactedTranscripts: transcriptsResult.rows.length > 0
      };
    } catch (err) {
      logger.database.error('Error verifying database structure', err);
      throw err;
    }
  }
};

module.exports = db;