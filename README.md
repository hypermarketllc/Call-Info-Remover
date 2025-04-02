# Call Info Remover - Audio Redaction System

A comprehensive system for uploading, processing, and storing audio files with automatic redaction of sensitive information. The system transcribes audio files, identifies sensitive information (SSNs, credit card numbers, phone numbers, etc.), and creates modified versions with beep sounds replacing the sensitive content.

## Features

- **Audio File Upload**: Support for MP3 and WAV audio files
- **Automatic Transcription**: Uses Deepgram API for high-quality speech-to-text conversion
- **Sensitive Information Detection**: Identifies SSNs, credit card numbers, phone numbers, and more
- **Audio Redaction**: Replaces sensitive information with beep sounds
- **Transcript Redaction**: Creates redacted text transcripts
- **MP3 to WAV Conversion**: Automatically converts MP3 files to WAV for processing
- **Robust Error Handling**: Multiple fallback mechanisms for reliable operation
- **Downloadable Files**: Download original audio, redacted audio, and transcripts

## System Architecture

### Components

1. **Frontend**: A clean, minimalist web interface for file uploads
2. **Backend API**: Node.js Express server for handling file processing
3. **Speech-to-Text**: Deepgram API integration for audio transcription
4. **Audio Processing**: Integrated audio processor with MP3 to WAV conversion
5. **Storage System**: File system storage for original and processed files
6. **Database**: Simple in-memory storage system to keep track of uploads

## Installation

### Prerequisites

- Node.js (v14+)
- FFmpeg (included via ffmpeg-static package)
- Deepgram API key

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/call-info-remover.git
   cd call-info-remover
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with your Deepgram API key:
   ```
   DEEPGRAM_API_KEY=your_api_key_here
   PORT=3000
   ```

4. Start the server:
   ```bash
   npm start
   ```

## Usage

### Web Interface

1. Open your browser and navigate to `http://localhost:3000`
2. Use the upload form to select and upload an audio file
3. Wait for the processing to complete
4. Download the redacted audio file and transcript

### API Endpoints

- `POST /api/upload` - Upload and process an audio file
- `GET /api/calls` - List all processed recordings
- `GET /api/calls/:id` - Get details for a specific recording
- `GET /api/download/original/:id` - Download original audio
- `GET /api/download/redacted/:id` - Download redacted audio
- `GET /api/download/transcript/:id` - Download transcript
- `GET /api/logs` - Get processing logs
- `POST /api/logs/clear` - Clear logs

## MP3 to WAV Conversion

The system includes a robust MP3 to WAV conversion module that:

1. Automatically detects MP3 files and converts them to WAV format
2. Uses multiple conversion methods with fallback mechanisms
3. Verifies the converted files to ensure they are valid
4. Implements retry logic for reliable operation
5. Cleans up temporary files after processing

## Audio Redaction Process

1. **Upload**: Audio file is uploaded to the server
2. **Transcription**: File is transcribed using Deepgram API
3. **Detection**: Sensitive information is identified in the transcript with timestamps
4. **Conversion**: If the file is MP3, it's converted to WAV format
5. **Redaction**: Beep sounds are added at the timestamps of sensitive information
6. **Storage**: Original and redacted files are stored for download

## Testing

To test the audio processor functionality:

```bash
node test-audio-processor.js [path_to_audio_file]
```

This will process the specified audio file (or `sample.mp3` by default) with test timestamps and save the result to the `processed` directory.

## Troubleshooting

### Common Issues

1. **File Upload Errors**
   - Check file size limits (100MB by default)
   - Verify supported audio formats (MP3 and WAV)
   - Ensure proper permissions on upload directories

2. **Audio Processing Errors**
   - Check FFmpeg installation
   - Verify audio file integrity
   - Ensure sufficient system resources

3. **Transcription Errors**
   - Verify Deepgram API key
   - Check audio quality
   - Ensure proper audio format compatibility

### Logs

The system maintains detailed logs that can be accessed via the `/api/logs` endpoint. These logs include information about:

- File uploads
- Transcription process
- Sensitive information detection
- Audio processing
- Error details

## License

[MIT License](LICENSE)

## Acknowledgements

- [Deepgram](https://deepgram.com/) for speech-to-text API
- [FFmpeg](https://ffmpeg.org/) for audio processing
- [Node.js](https://nodejs.org/) and [Express](https://expressjs.com/) for the server framework
