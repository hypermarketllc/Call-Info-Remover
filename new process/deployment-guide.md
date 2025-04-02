# Audio Redaction System: Linux Server Deployment Guide

This guide provides detailed instructions for deploying the audio redaction system on a Linux server. The system is designed to work well in both development and production environments.

## System Requirements

- Ubuntu 20.04 LTS or newer (or similar Linux distribution)
- Node.js 14.x or newer
- SoX audio processing tool
- PM2 process manager (for production)
- Nginx (for production)
- 2GB RAM minimum (4GB recommended)
- 20GB disk space minimum

## Installation Steps

### 1. Update System Packages

```bash
sudo apt update
sudo apt upgrade -y
```

### 2. Install Node.js and npm

```bash
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify installation:

```bash
node -v
npm -v
```

### 3. Install SoX and Audio Dependencies

SoX is the primary tool used for audio manipulation:

```bash
sudo apt install -y sox libsox-fmt-all
```

Verify SoX installation:

```bash
sox --version
```

### 4. Install Additional Audio Processing Dependencies

```bash
sudo apt install -y libmp3lame-dev libasound2-dev
```

### 5. Set Up Project Directory

```bash
mkdir -p /opt/audio-redaction
cd /opt/audio-redaction
```

### 6. Clone or Copy Application Files

If using Git:

```bash
git clone https://your-repository-url.git .
```

Or copy files manually to the directory.

### 7. Install Application Dependencies

```bash
npm install
```

### 8. Create Configuration File

Create a `.env` file with your configuration:

```bash
touch .env
```

Add the following content (adjust values as needed):

```
NODE_ENV=production
PORT=3000
DEEPGRAM_API_KEY=your_api_key_here
MAX_FILE_SIZE=100000000
```

### 9. Set Up Directory Permissions

```bash
# Create required directories if they don't exist
mkdir -p uploads processed transcripts logs

# Set correct permissions
chmod 755 /opt/audio-redaction
chmod -R 755 uploads processed transcripts logs
```

### 10. Install PM2 for Process Management

```bash
sudo npm install -g pm2
```

### 11. Create PM2 Configuration

Create a file named `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'audio-redaction',
    script: 'server.js',
    instances: 'max',
    exec_