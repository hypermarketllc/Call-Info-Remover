# Enhanced Logging System for Call Info Remover

This package provides an enhanced logging system to help diagnose issues with the Call Info Remover application, particularly focusing on the file upload, processing, storage, and download pipeline.

## The Issue

You're experiencing an issue where uploaded files are processed but cannot be downloaded, with a 404 "Redacted audio not found" error. This could be happening at several points in the pipeline:

1. **Upload**: The file might not be properly uploaded
2. **Processing**: The audio processing might fail
3. **Database Storage**: The file might not be properly stored in the database
4. **Database Retrieval**: The file might not be properly retrieved from the database
5. **Download**: The download endpoint might have issues

## Enhanced Logging Components

### 1. Enhanced Logging Module (`enhanced-logging.js`)

This module provides detailed logging for all stages of the audio processing pipeline:
- Creates separate log files for each stage (upload, transcription, redaction, database, download)
- Logs detailed information about each operation, including file sizes, data types, and error details
- Provides helper functions for logging database queries and file operations

### 2. Enhanced Database Module (`db/enhanced-index.js`)

This is an enhanced version of your database module with detailed logging:
- Logs all database operations with detailed information
- Verifies data integrity at each step
- Provides a new function to verify database structure
- Logs detailed information about query results

### 3. Enhanced Download Endpoints Script (`enhance-download-endpoints.js`)

This script modifies your server.js file to use the enhanced logging system:
- Adds detailed logging to the download endpoints
- Verifies database structure at server startup
- Creates a backup of your original server.js file

## Installation and Usage

### Step 1: Install the Enhanced Logging System

1. Copy the enhanced logging files to your project:
   - `enhanced-logging.js`
   - `db/enhanced-index.js`

2. Run the enhancement script to modify your server.js file:
   ```bash
   node enhance-download-endpoints.js
   ```

   This will:
   - Create a backup of your original server.js file
   - Modify server.js to use the enhanced logging system
   - Add detailed logging to the download endpoints

### Step 2: Restart Your Server

Restart your server to apply the changes:

```bash
pm2 restart call-info-remover
```

### Step 3: Monitor the Logs

The enhanced logging system will create a `detailed_logs` directory with separate log files for each stage of the pipeline:

- `upload.log` - Logs related to file uploads
- `transcription.log` - Logs related to audio transcription
- `redaction.log` - Logs related to audio redaction
- `database.log` - Logs related to database operations
- `download.log` - Logs related to file downloads
- `error.log` - All error logs in one place
- `all.log` - All logs in one place

Monitor these logs to identify where the issue is occurring.

## Diagnosing the Issue

1. **Upload a new file** through the application
2. **Check the logs** to see if the file is properly uploaded, processed, and stored
3. **Try to download the file** and check the logs to see where the issue occurs

### Common Issues and Solutions

#### 1. Database Connection Issues

If you see errors related to database connections in the logs, check:
- Database credentials in your .env file
- Database server status
- Network connectivity

#### 2. Database Schema Issues

If the database structure verification fails, check:
- Database schema
- Table structure
- Column types

#### 3. Data Storage Issues

If the file is uploaded and processed but not properly stored in the database, check:
- Database transaction logs
- Data size limits
- Base64 encoding/decoding

#### 4. Data Retrieval Issues

If the file is stored but cannot be retrieved, check:
- Query parameters
- Record IDs
- Data integrity

## Additional Diagnostic Tools

The package also includes several diagnostic tools:

1. **Database Structure Verification**
   The enhanced database module includes a function to verify the database structure:
   ```javascript
   const dbStructure = await db.verifyDatabaseStructure();
   console.log(dbStructure);
   ```

2. **Manual Database Query**
   You can manually query the database to check if the redacted audio exists:
   ```sql
   SELECT * FROM redacted_audio WHERE recording_id = 1;
   ```

3. **File System Check**
   Check if temporary files are being created and cleaned up properly:
   ```bash
   ls -la temp/
   ```

## Reverting Changes

If you need to revert to the original server.js file, you can find the backup at:
```
server.js.backup-[timestamp]
```

Simply copy this file back to server.js:
```bash
cp server.js.backup-[timestamp] server.js
```

## Support

If you need further assistance, please provide the following information:
- The complete logs from the `detailed_logs` directory
- Database schema information
- Server environment details (Node.js version, OS, etc.)