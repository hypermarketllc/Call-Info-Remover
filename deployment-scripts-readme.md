# Call Info Remover - Deployment Scripts

This directory contains scripts to help with deploying, updating, and maintaining the Call Info Remover application on a Linux server.

## Scripts Overview

### 1. install.sh

This script automates the complete installation process of the Call Info Remover application on a Linux server.

**Usage:**
```bash
sudo ./install.sh
```

The script will:
- Update system packages
- Install Node.js, SoX, and FFmpeg
- Set up the application directory
- Install application dependencies
- Configure Nginx as a reverse proxy
- Set up SSL with Let's Encrypt (optional)
- Start the application with PM2
- Configure PM2 to start on boot
- Configure the firewall

### 2. backup-restore.sh

This script helps with backing up and restoring the application data.

**Usage:**
```bash
# Create a backup
./backup-restore.sh --backup

# List available backups
./backup-restore.sh --list

# Restore from a backup
./backup-restore.sh --restore backup_20250405.tar.gz

# Specify custom directories
./backup-restore.sh --backup --dir /custom/app/path --output /custom/backup/path
```

The script will:
- Create backups of uploads, processed files, and transcripts
- Back up the configuration file separately
- Restore data from backups
- List available backups

### 3. update.sh

This script helps with updating the application to a newer version.

**Usage:**
```bash
# Update from a source directory
./update.sh --source /path/to/new/version

# Update and restart the application
./update.sh --source /path/to/new/version --restart

# Update dependencies only
./update.sh --restart
```

The script will:
- Create a backup before updating (can be disabled with --no-backup)
- Copy new files from the source directory
- Update dependencies
- Restart the application (if --restart is specified)

## Making Scripts Executable on Linux

When you transfer these scripts to a Linux server, you'll need to make them executable:

```bash
chmod +x install.sh backup-restore.sh update.sh
```

## Server Requirements

- Ubuntu 20.04 LTS or newer (or similar Linux distribution)
- Node.js 16.x or newer
- SoX audio processing tool with MP3 support
- FFmpeg for audio processing
- Nginx for reverse proxy
- 2GB RAM minimum (4GB recommended)
- 20GB disk space minimum

## Deployment Process

1. Transfer the application files and scripts to your server
2. Make the scripts executable: `chmod +x *.sh`
3. Run the installation script: `sudo ./install.sh`
4. Follow the prompts to complete the installation

For detailed deployment instructions, see [deployment-guide.md](deployment-guide.md).
