/**
 * Database Setup Script for Call Info Remover
 * 
 * This script creates the necessary PostgreSQL database tables for storing
 * redacted audio files and transcripts.
 */

require('dotenv').config();
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

// SQL statements to create tables
const createTablesSQL = `
-- Table for storing call recordings metadata
CREATE TABLE IF NOT EXISTS recordings (
  id SERIAL PRIMARY KEY,
  original_filename VARCHAR(255) NOT NULL,
  upload_date TIMESTAMP NOT NULL DEFAULT NOW(),
  sensitive_info_count INTEGER NOT NULL DEFAULT 0
);

-- Table for storing redacted audio files only
CREATE TABLE IF NOT EXISTS redacted_audio (
  id SERIAL PRIMARY KEY,
  recording_id INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
  content_type VARCHAR(100) NOT NULL,
  data TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table for storing redacted transcripts only
CREATE TABLE IF NOT EXISTS redacted_transcripts (
  id SERIAL PRIMARY KEY,
  recording_id INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_redacted_audio_recording_id ON redacted_audio(recording_id);
CREATE INDEX IF NOT EXISTS idx_redacted_transcripts_recording_id ON redacted_transcripts(recording_id);
`;

// Function to set up the database
async function setupDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Setting up database tables...');
    
    // Create tables
    await client.query(createTablesSQL);
    console.log('Database tables created successfully');
    
    // Check if we need to migrate existing data
    const processedDir = path.join(__dirname, '..', 'processed');
    const transcriptsDir = path.join(__dirname, '..', 'transcripts');
    
    if (fs.existsSync(processedDir) && fs.existsSync(transcriptsDir)) {
      const processedFiles = fs.readdirSync(processedDir).filter(file => file.startsWith('redacted_'));
      
      if (processedFiles.length > 0) {
        console.log(`Found ${processedFiles.length} existing processed files. Do you want to migrate them to the database? (y/n)`);
        
        // This is a simple way to get user input in a script
        // In a real application, you might want to use a proper CLI library
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        
        process.stdin.on('data', async (data) => {
          const input = data.trim().toLowerCase();
          
          if (input === 'y' || input === 'yes') {
            console.log('Starting migration of existing files...');
            
            for (const file of processedFiles) {
              try {
                // Extract original filename from the redacted filename
                const originalFilename = file.replace('redacted_', '');
                
                // Check if there's a corresponding transcript
                const transcriptPath = path.join(transcriptsDir, `redacted_${originalFilename}.txt`);
                if (!fs.existsSync(transcriptPath)) {
                  console.log(`Skipping ${file} - no matching transcript found`);
                  continue;
                }
                
                // Read the files
                const audioPath = path.join(processedDir, file);
                const audioData = fs.readFileSync(audioPath);
                const transcriptData = fs.readFileSync(transcriptPath, 'utf8');
                
                // Determine content type based on file extension
                const ext = path.extname(file).toLowerCase();
                let contentType = 'audio/mpeg';
                if (ext === '.wav') contentType = 'audio/wav';
                else if (ext === '.ogg') contentType = 'audio/ogg';
                
                // Insert into database
                const result = await client.query(
                  'INSERT INTO recordings (original_filename, upload_date) VALUES ($1, NOW()) RETURNING id',
                  [originalFilename]
                );
                
                const recordingId = result.rows[0].id;
                
                // Insert redacted audio
                await client.query(
                  'INSERT INTO redacted_audio (recording_id, content_type, data) VALUES ($1, $2, $3)',
                  [recordingId, contentType, audioData.toString('base64')]
                );
                
                // Insert redacted transcript
                await client.query(
                  'INSERT INTO redacted_transcripts (recording_id, content) VALUES ($1, $2)',
                  [recordingId, transcriptData]
                );
                
                console.log(`Migrated ${file} to database`);
              } catch (err) {
                console.error(`Error migrating ${file}:`, err);
              }
            }
            
            console.log('Migration completed');
          } else {
            console.log('Migration skipped');
          }
          
          process.exit(0);
        });
      } else {
        console.log('No existing processed files found to migrate');
        process.exit(0);
      }
    } else {
      console.log('Processed or transcripts directory not found, skipping migration');
      process.exit(0);
    }
  } catch (err) {
    console.error('Error setting up database:', err);
    process.exit(1);
  } finally {
    if (!client.release) {
      client.release();
    }
  }
}

// Run the setup
setupDatabase();
