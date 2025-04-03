# Call Info Remover - Audio Redaction System

## Overview

This system allows users to upload audio files, automatically transcribe them, identify sensitive information (SSNs, credit card numbers, phone numbers, etc.), and create redacted versions with beep sounds replacing the sensitive content.

## Security Improvements

The system has been updated with the following security improvements:

1. **Disk Space Checking**: The system now checks for available disk space before processing audio files to prevent errors due to insufficient space.

2. **Secure Fallback Mechanism**: If audio processing fails, the system now creates a silent audio file of the same duration instead of copying the original file. This prevents sensitive information from being exposed in case of processing errors.

3. **Output Format Handling**: Fixed an issue where the output format was always forced to MP3 regardless of the requested format.

4. **Better Error Reporting**: Improved error messages and logging to help diagnose issues.

## Installation

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

## Usage

1. Upload an audio file through the web interface
2. The system will automatically:
   - Transcribe the audio
   - Identify sensitive information
   - Create a redacted version with beeps over sensitive content
   - Store both the original and redacted versions

## API Endpoints

- `POST /api/upload` - Upload and process audio file
- `GET /api/calls` - List all processed recordings
- `GET /api/calls/:id` - Get details for a specific recording
- `GET /api/download/original/:id` - Download original audio
- `GET /api/download/redacted/:id` - Download redacted audio
- `GET /api/download/transcript/:id` - Download transcript
- `GET /api/logs` - Get processing logs
- `POST /api/logs/clear` - Clear logs

## Technical Details

The system uses:
- Node.js with Express for the backend
- Deepgram API for speech-to-text
- FFmpeg for audio processing
- Regular expressions for sensitive information detection
