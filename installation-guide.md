# Call Info Remover - Diagnostic Tools and Fixes Installation Guide

This guide provides detailed instructions for installing and using the diagnostic tools and fixes for the Call Info Remover application.

## Table of Contents

1. [Issue Overview](#issue-overview)
2. [Diagnostic Tools](#diagnostic-tools)
3. [Enhanced Logging System](#enhanced-logging-system)
4. [Database Fixes](#database-fixes)
5. [Download Endpoint Fixes](#download-endpoint-fixes)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)

## Issue Overview

The Call Info Remover application has two main issues:

1. **Syntax Error**: A syntax error in the server.js file at line 748 with an unexpected token ')'.
2. **Download Issue**: Redacted audio files cannot be downloaded, resulting in a 404 "Redacted audio not found" error.

This guide provides solutions for both issues.

## Diagnostic Tools

### 1. Syntax Validation Tool

The syntax validation tool checks for syntax errors in JavaScript files.

**Installation:**

```bash
# Copy the validate-syntax.js file to your server
scp validate-syntax.js root@104.245.241.185:/var/www/coveredamerican.com/audio/
```

**Usage:**

```bash
# SSH into your server
ssh root@104.245.241.185

# Navigate to your application directory
cd /var/www/coveredamerican.com/audio

# Run the syntax validation on server.js
node validate-syntax.js server.js
```

### 2. Comprehensive File Check Tool

This tool provides detailed information about a file, including content around specific lines and potential problematic patterns.

**Installation:**

```bash
# Copy the check-server-file.js file to your server
scp check-server-file.js root@104.245.241.185:/var/www/coveredamerican.com/audio/
```

**Usage:**

```bash
# SSH into your server
ssh root@104.245.241.185

# Navigate to your application directory
cd /var/www/coveredamerican.com/audio

# Run the comprehensive check on server.js
node check-server-file.js server.js
```

### 3. Database Diagnostic Tool

This tool directly queries the database to check if redacted audio data exists and is properly stored.

**Installation:**

```bash
# Copy the diagnose-database.js file to your server
scp diagnose-database.js root@104.245.241.185:/var/www/coveredamerican.com/audio/
```

**Usage:**

```bash
# SSH into your server
ssh root@104.245.241.185

# Navigate to your application directory
cd /var/www/coveredamerican.com/audio

# Run the database diagnostic for a specific recording ID
node diagnose-database.js 1  # Replace 1 with the recording ID you're having issues with
```

## Enhanced Logging System

The enhanced logging system provides detailed logging for all stages of the audio processing pipeline.

### Installation

1. **Copy the enhanced logging files to your server:**

```bash
# Create the necessary directories
ssh root@104.245.241.185 "mkdir -p /var/www/coveredamerican.com/audio/db"

# Copy the enhanced logging files
scp enhanced-logging.js root@104.245.241.185:/var/www/coveredamerican.com/audio/
scp db/enhanced-index.js root@104.245.241.185:/var/www/coveredamerican.com/audio/db/
scp enhance-download-endpoints.js root@104.245.241.185:/var/www/coveredamerican.com/audio/
```

2. **Apply the enhanced logging to your server.js file:**

```bash
# SSH into your server
ssh root@104.245.241.185

# Navigate to your application directory
cd /var/www/coveredamerican.com/audio

# Run the enhancement script
node enhance-download-endpoints.js

# Restart your server
pm2 restart call-info-remover
```

3. **Verify the enhanced logging is working:**

```bash
# Check if the detailed_logs directory was created
ls -la detailed_logs/

# Check the logs
cat detailed_logs/all.log
```

### Log Files

The enhanced logging system creates the following log files:

- `detailed_logs/upload.log` - Logs related to file uploads
- `detailed_logs/transcription.log` - Logs related to audio transcription
- `detailed_logs/redaction.log` - Logs related to audio redaction
- `detailed_logs/database.log` - Logs related to database operations
- `detailed_logs/download.log` - Logs related to file downloads
- `detailed_logs/error.log` - All error logs in one place
- `detailed_logs/all.log` - All logs in one place

## Database Fixes

The database fixes add the missing `getOriginalAudio` function to the db/index.js file.

### Installation

1. **Copy the fix script to your server:**

```bash
scp fix-db-module.js root@104.245.241.185:/var/www/coveredamerican.com/audio/
```

2. **Apply the fix:**

```bash
# SSH into your server
ssh root@104.245.241.185

# Navigate to your application directory
cd /var/www/coveredamerican.com/audio

# Run the fix script
node fix-db-module.js
```

3. **Create the original_audio table if it doesn't exist:**

```bash
# Connect to your PostgreSQL database
psql -U your_db_user -d call_info_remover

# Create the original_audio table
CREATE TABLE original_audio (
  id SERIAL PRIMARY KEY,
  recording_id INTEGER REFERENCES recordings(id) ON DELETE CASCADE,
  content_type VARCHAR(255) NOT NULL,
  data TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

# Exit PostgreSQL
\q
```

## Download Endpoint Fixes

The download endpoint fixes modify the server.js file to properly retrieve redacted audio data from the database.

### Installation

1. **Copy the fix script to your server:**

```bash
scp fix-download-endpoint.js root@104.245.241.185:/var/www/coveredamerican.com/audio/
```

2. **Apply the fix:**

```bash
# SSH into your server
ssh root@104.245.241.185

# Navigate to your application directory
cd /var/www/coveredamerican.com/audio

# Run the fix script
node fix-download-endpoint.js

# Restart your server
pm2 restart call-info-remover
```

## Verification

After applying all the fixes, verify that everything is working correctly:

1. **Check the server logs:**

```bash
pm2 logs call-info-remover
```

2. **Upload a new audio file** through the web interface.

3. **Check the detailed logs:**

```bash
cat detailed_logs/all.log
```

4. **Try to download the redacted audio file** through the web interface.

5. **If issues persist, run the database diagnostic tool:**

```bash
node diagnose-database.js [recording_id]
```

## Troubleshooting

### 1. Syntax Error Still Occurs

If the syntax error at line 748 still occurs:

1. Manually edit the server.js file:

```bash
nano server.js
```

2. Go to line 748 (press Ctrl+_ then type 748)
3. Remove the closing bracket `});` if it exists
4. Save the file (Ctrl+O, then Enter)
5. Exit nano (Ctrl+X)
6. Restart the server:

```bash
pm2 restart call-info-remover
```

### 2. Download Still Fails

If downloading redacted audio still fails:

1. Check the database structure:

```bash
# Connect to your PostgreSQL database
psql -U your_db_user -d call_info_remover

# Check if the redacted_audio table exists
\dt

# Check the structure of the redacted_audio table
\d redacted_audio

# Check if there are any records in the redacted_audio table
SELECT * FROM redacted_audio;

# Exit PostgreSQL
\q
```

2. Check the detailed logs:

```bash
cat detailed_logs/download.log
cat detailed_logs/database.log
```

3. Run the database diagnostic tool:

```bash
node diagnose-database.js [recording_id]
```

### 3. Enhanced Logging Not Working

If the enhanced logging system is not working:

1. Check if the detailed_logs directory exists:

```bash
ls -la detailed_logs/
```

2. If it doesn't exist, create it:

```bash
mkdir -p detailed_logs
chmod 755 detailed_logs
```

3. Check if the enhanced-logging.js file is being required in server.js:

```bash
grep -n "enhanced-logging" server.js
```

4. If not, manually add it:

```bash
nano server.js
```

5. Add the following line near the top of the file:

```javascript
const logger = require('./enhanced-logging');
```

6. Save the file and restart the server:

```bash
pm2 restart call-info-remover
```

### 4. SCP Command Fails

If you encounter "No such file or directory" errors when using SCP:

1. Make sure you're using the correct path format:
   - Linux paths start with a forward slash `/`
   - The correct path to your application is `/var/www/coveredamerican.com/audio/`

2. Make sure the destination directory exists:

```bash
ssh root@104.245.241.185 "mkdir -p /var/www/coveredamerican.com/audio/db"
```

3. Try using the `-r` flag for recursive copying if needed:

```bash
scp -r db root@104.245.241.185:/var/www/coveredamerican.com/audio/
```

## Additional Resources

- [Enhanced Logging README](enhanced-logging-readme.md)
- [Syntax Fix README](syntax-fix-readme.md)
- [Database Diagnostic Tool Documentation](diagnose-database.js)