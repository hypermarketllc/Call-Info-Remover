# Call Info Remover - Deployment Scripts

This directory contains scripts to help with deploying, updating, and maintaining the Call Info Remover application on a Linux server.

## Available Scripts

### 1. deploy.sh

A comprehensive deployment script that automates the complete installation process.

**Usage:**
```bash
sudo ./deploy.sh
```

**What it does:**
- Updates system packages
- Installs required dependencies (Node.js, SoX, FFmpeg, Nginx, PM2)
- Creates the necessary directory structure
- Clones the application repository
- Installs application dependencies
- Creates configuration files
- Configures Nginx as a reverse proxy
- Sets up SSL with Let's Encrypt
- Starts the application with PM2
- Configures PM2 to start on boot
- Sets up firewall rules
- Performs final verification

### 2. update-app.sh

A script to update the application to the latest version.

**Usage:**
```bash
./update-app.sh [options]
```

**Options:**
- `-d, --dir DIR` - Specify application directory (default: /var/www/coveredamerican.com/audio)
- `-h, --help` - Show help message

**What it does:**
- Creates a backup of important configuration files
- Pulls the latest changes from the repository
- Installs dependencies
- Restarts the application

### 3. backup-app.sh

A script to create a backup of the application data.

**Usage:**
```bash
./backup-app.sh [options]
```

**Options:**
- `-d, --dir DIR` - Specify application directory (default: /var/www/coveredamerican.com/audio)
- `-o, --output DIR` - Specify backup directory (default: /var/backups/call-info-remover)
- `-n, --no-config` - Exclude configuration files from backup
- `-l, --logs` - Include log files in backup
- `-h, --help` - Show help message

**What it does:**
- Creates a backup of uploads, processed files, and transcripts
- Optionally includes configuration files
- Optionally includes log files
- Creates a compressed archive of the backup

### 4. restore-app.sh

A script to restore a backup of the application data.

**Usage:**
```bash
./restore-app.sh --backup BACKUP_FILE [options]
```

**Options:**
- `-d, --dir DIR` - Specify application directory (default: /var/www/coveredamerican.com/audio)
- `-b, --backup FILE` - Specify backup file to restore (required)
- `-n, --no-config` - Don't restore configuration files
- `-l, --logs` - Restore log files
- `-h, --help` - Show help message

**What it does:**
- Extracts the backup archive
- Restores data directories (uploads, processed, transcripts)
- Optionally restores configuration files
- Optionally restores log files
- Restarts the application

### 5. check-health.sh

A script to check the health of the application and server.

**Usage:**
```bash
./check-health.sh [options]
```

**Options:**
- `-d, --dir DIR` - Specify application directory (default: /var/www/coveredamerican.com/audio)
- `-p, --port PORT` - Specify application port (default: 8531)
- `-h, --help` - Show help message

**What it does:**
- Checks if the application is running with PM2
- Checks if the application is responding
- Checks Nginx status and configuration
- Checks SSL certificate status and expiration
- Checks disk space usage
- Checks memory usage
- Checks application logs for errors
- Checks data directories
- Provides a summary of the application health

### 6. setup-cron-backup.sh

A script to set up automated backups using cron.

**Usage:**
```bash
./setup-cron-backup.sh [options]
```

**Options:**
- `-d, --dir DIR` - Specify application directory (default: /var/www/coveredamerican.com/audio)
- `-o, --output DIR` - Specify backup directory (default: /var/backups/call-info-remover)
- `-s, --script PATH` - Specify backup script path (default: ./backup-app.sh)
- `-f, --frequency FREQ` - Specify backup frequency (daily, weekly, monthly) (default: daily)
- `-t, --time TIME` - Specify backup time in 24-hour format (default: 02:00)
- `-r, --retention DAYS` - Specify backup retention period in days (default: 30)
- `-h, --help` - Show help message

**What it does:**
- Sets up a cron job to run backups automatically
- Creates a cleanup script to remove old backups
- Configures backup frequency, time, and retention period
- Provides information about the next scheduled backup

### 7. package-scripts.sh

A script to package all deployment scripts into a single archive for easy distribution.

**Usage:**
```bash
./package-scripts.sh [options]
```

**Options:**
- `-o, --output DIR` - Specify output directory (default: current directory)
- `-n, --name NAME` - Specify package name (default: call-info-remover-scripts)
- `-v, --version VER` - Specify package version (default: current date in YYYYMMDD format)
- `-h, --help` - Show help message

**What it does:**
- Collects all deployment scripts
- Creates a README file
- Packages everything into a compressed archive
- Makes scripts executable in the package
- Provides information about the created package

## Making Scripts Executable on Linux

When you transfer these scripts to a Linux server, you'll need to make them executable:

```bash
chmod +x deploy.sh update-app.sh backup-app.sh restore-app.sh check-health.sh setup-cron-backup.sh package-scripts.sh
```

## Usage Examples

### Complete Installation

```bash
sudo ./deploy.sh
```

### Update the Application

```bash
./update-app.sh
```

### Create a Backup

```bash
./backup-app.sh
```

### Restore from a Backup

```bash
./restore-app.sh --backup call-info-remover-backup-20250405-123456.tar.gz
```

### Check Application Health

```bash
./check-health.sh
```

### Set Up Automated Daily Backups

```bash
./setup-cron-backup.sh --frequency daily --time 02:00
```

### Package All Scripts for Distribution

```bash
./package-scripts.sh --output /tmp
```

## Notes

- These scripts are designed to be run on a Linux server (Ubuntu 20.04 LTS or newer recommended).
- The `deploy.sh` script must be run with sudo privileges.
- The other scripts can be run as a regular user if the application directory has the correct permissions.
- All scripts include help messages that can be displayed with the `-h` or `--help` option.
