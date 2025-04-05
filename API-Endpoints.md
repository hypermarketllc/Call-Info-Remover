# Call Info Remover API Documentation

This document describes the API endpoints available in the Call Info Remover application.

## Authentication

No authentication is currently required for these endpoints. However, the application is designed to be deployed behind a reverse proxy (like Nginx) which can handle authentication if needed.

## API Endpoints

### Upload Audio

```
POST /api/upload
```

Uploads an audio file for processing. The file will be transcribed, analyzed for sensitive information, and a redacted version will be created.

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `audio`: The audio file to upload (required)
  - `beepVolume`: Volume of the beep sound (optional, default: 0.0001)
  - `audioVolume`: Volume of the audio (optional, default: 1.25)

**Response:**
```json
{
  "success": true,
  "jobId": "1680123456789-abc123",
  "message": "File uploaded successfully. Processing started.",
  "status": "processing"
}
```

**Notes:**
- The upload endpoint now uses a two-step process to handle large files and avoid Cloudflare timeout issues.
- The endpoint returns immediately after receiving the file, and processing continues in the background.
- Use the `/api/status/:jobId` endpoint to check the processing status.

### Check Processing Status

```
GET /api/status/:jobId
```

Checks the status of a processing job.

**Parameters:**
- `jobId`: The ID of the job to check (required)

**Response:**
```json
{
  "jobId": "1680123456789-abc123",
  "status": "processing",
  "stage": "transcribing",
  "originalFileName": "recording.mp3",
  "createdAt": "2025-04-05T20:45:12.345Z"
}
```

**Possible Status Values:**
- `processing`: The job is still being processed
- `completed`: The job has completed successfully
- `failed`: The job has failed

**Possible Stage Values:**
- `starting`: Initial stage after upload
- `transcribing`: Audio is being transcribed
- `analyzing`: Transcript is being analyzed for sensitive information
- `redacting`: Sensitive information is being redacted from the audio
- `storing`: Processed files are being stored in the database

**When Completed:**
```json
{
  "jobId": "1680123456789-abc123",
  "status": "completed",
  "stage": "storing",
  "originalFileName": "recording.mp3",
  "createdAt": "2025-04-05T20:45:12.345Z",
  "result": {
    "id": "123",
    "originalFileName": "recording.mp3",
    "uploadDate": "2025-04-05T20:47:23.456Z",
    "sensitiveInfoCount": 5
  }
}
```

**When Failed:**
```json
{
  "jobId": "1680123456789-abc123",
  "status": "failed",
  "stage": "transcribing",
  "originalFileName": "recording.mp3",
  "createdAt": "2025-04-05T20:45:12.345Z",
  "error": "Transcription failed: Invalid audio format"
}
```

### Get All Recordings

```
GET /api/calls
```

Returns a list of all processed recordings.

**Response:**
```json
[
  {
    "id": "123",
    "originalFileName": "recording1.mp3",
    "uploadDate": "2025-04-05T20:47:23.456Z",
    "sensitiveInfoCount": 5
  },
  {
    "id": "124",
    "originalFileName": "recording2.mp3",
    "uploadDate": "2025-04-05T21:15:42.789Z",
    "sensitiveInfoCount": 3
  }
]
```

### Get Recording Details

```
GET /api/calls/:id
```

Returns details for a specific recording.

**Parameters:**
- `id`: The ID of the recording to retrieve (required)

**Response:**
```json
{
  "id": "123",
  "originalFileName": "recording1.mp3",
  "uploadDate": "2025-04-05T20:47:23.456Z",
  "sensitiveInfoCount": 5
}
```

### Download Original Audio

```
GET /api/download/original/:id
```

Downloads the original audio file.

**Parameters:**
- `id`: The ID of the recording to download (required)

**Response:**
- Content-Type: The original audio file's MIME type
- Content-Disposition: `attachment; filename="original_filename.mp3"`
- Body: The audio file data

### Download Redacted Audio

```
GET /api/download/redacted/:id
```

Downloads the redacted audio file.

**Parameters:**
- `id`: The ID of the recording to download (required)

**Response:**
- Content-Type: The redacted audio file's MIME type
- Content-Disposition: `attachment; filename="redacted_original_filename.mp3"`
- Body: The audio file data

### Download Transcript

```
GET /api/download/transcript/:id
```

Downloads the redacted transcript.

**Parameters:**
- `id`: The ID of the recording to download (required)

**Response:**
- Content-Type: `text/plain`
- Content-Disposition: `attachment; filename="transcript_original_filename.txt"`
- Body: The transcript text

### Get Logs

```
GET /api/logs
```

Returns the application logs.

**Response:**
```json
[
  {
    "timestamp": "2025-04-05T20:45:12.345Z",
    "level": "info",
    "category": "system",
    "message": "File uploaded successfully: recording.mp3",
    "details": {
      "mimetype": "audio/mpeg",
      "size": "5.2 MB"
    }
  },
  {
    "timestamp": "2025-04-05T20:46:23.456Z",
    "level": "success",
    "category": "transcription",
    "message": "Transcription completed successfully"
  }
]
```

### Update Deepgram API Key

```
POST /api/settings/deepgram-key
```

Updates the Deepgram API key used for transcription.

**Request:**
- Content-Type: `application/json`
- Body:
  ```json
  {
    "apiKey": "your_deepgram_api_key"
  }
  ```

**Response:**
```json
{
  "success": true
}
```

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200 OK`: The request was successful
- `400 Bad Request`: The request was invalid
- `404 Not Found`: The requested resource was not found
- `500 Internal Server Error`: An error occurred on the server

Error responses include a JSON object with an `error` field describing the error:

```json
{
  "error": "Error message",
  "details": "Additional error details (if available)"
}
```

## Cloudflare Compatibility

The API is designed to work with Cloudflare's timeout limitations:

1. The `/api/upload` endpoint returns immediately after receiving the file
2. Processing continues in the background
3. The frontend polls the `/api/status/:jobId` endpoint to track progress
4. This approach prevents Cloudflare 524 timeout errors for large files
