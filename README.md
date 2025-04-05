# Call Info Remover - Audio Redaction System

## Overview

This system allows users to upload audio files, automatically transcribe them, identify sensitive information (SSNs, credit card numbers, phone numbers, etc.), and create redacted versions with beep sounds replacing the sensitive content.

## Features

- **Batch Processing**: Upload and process multiple audio files at once
- **Automatic Transcription**: Uses Deepgram API for accurate speech-to-text conversion
- **Sensitive Information Detection**: Identifies SSNs, credit card numbers, phone numbers, and more
- **Audio Redaction**: Replaces sensitive information with beep sounds
- **Secure Storage**: Maintains both original and redacted versions with proper access controls
- **User-Friendly Interface**: Clean, intuitive web interface for easy file management

## Security Features

1. **Disk Space Checking**: The system checks for available disk space before processing audio files to prevent errors due to insufficient space.

2. **Secure Fallback Mechanism**: If audio processing fails, the system creates a silent audio file of the same duration instead of copying the original file. This prevents sensitive information from being exposed in case of processing errors.

3. **Output Format Handling**: Preserves the original audio format when creating redacted versions.

4. **Comprehensive Logging**: Detailed error messages and logging to help diagnose issues.

## Installation

### Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your Deepgram API key:
   ```
   DEEPGRAM_API_KEY=your_api_key_here
   ```
4. Start the server:
   ```bash
   npm start
   ```

### Production Deployment

For production deployment on a Linux server, we provide several scripts:

1. **install.sh**: Automates the complete installation process
   ```bash
   sudo ./install.sh
   ```

2. **backup-restore.sh**: Manages backups and restores of application data
   ```bash
   # Create a backup
   ./backup-restore.sh --backup
   
   # Restore from a backup
   ./backup-restore.sh --restore backup_20250405.tar.gz
   ```

3. **update.sh**: Updates the application to a newer version
   ```bash
   ./update.sh --source /path/to/new/version --restart
   ```

For detailed deployment instructions, see [deployment-guide.md](deployment-guide.md).

## Usage

1. Upload one or more audio files through the web interface
2. The system will automatically:
   - Transcribe the audio
   - Identify sensitive information
   - Create a redacted version with beeps over sensitive content
   - Store both the original and redacted versions
3. Download or manage your processed files from the recordings list

## API Endpoints

- `POST /api/upload` - Upload and process audio file(s)
- `GET /api/calls` - List all processed recordings
- `GET /api/calls/:id` - Get details for a specific recording
- `GET /api/download/original/:id` - Download original audio
- `GET /api/download/redacted/:id` - Download redacted audio
- `GET /api/download/transcript/:id` - Download transcript
- `GET /api/logs` - Get processing logs
- `POST /api/logs/clear` - Clear logs
- `POST /api/settings/deepgram-key` - Update Deepgram API key

## Technical Details

The system uses:
- Node.js with Express for the backend
- Deepgram API for speech-to-text
- FFmpeg and SoX for audio processing
- Regular expressions for sensitive information detection
- PM2 for process management in production
- Nginx for reverse proxy in production
