#!/bin/bash

# Call Info Remover - Restore Script
# This script restores a backup of the Call Info Remover application data

# Exit on error
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_message() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Default paths
APP_DIR="/var/www/coveredamerican.com/audio"
BACKUP_DIR="/var/backups/call-info-remover"
BACKUP_FILE=""
RESTORE_CONFIG=true
RESTORE_LOGS=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -d|--dir)
      APP_DIR="$2"
      shift
      shift
      ;;
    -b|--backup)
      BACKUP_FILE="$2"
      shift
      shift
      ;;
    -n|--no-config)
      RESTORE_CONFIG=false
      shift
      ;;
    -l|--logs)
      RESTORE_LOGS=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  -d, --dir DIR      Specify application directory (default: $APP_DIR)"
      echo "  -b, --backup FILE  Specify backup file to restore (required)"
      echo "  -n, --no-config    Don't restore configuration files"
      echo "  -l, --logs         Restore log files"
      echo "  -h, --help         Show this help message"
      echo ""
      echo "Example:"
      echo "  $0 --backup /var/backups/call-info-remover/call-info-remover-backup-20250405-123456.tar.gz"
      echo ""
      exit 0
      ;;
    *)
      print_error "Unknown option: $1"
      echo "Use --help to see available options"
      exit 1
      ;;
  esac
done

# Check if backup file is provided
if [ -z "$BACKUP_FILE" ]; then
  print_error "No backup file specified. Use --backup option to specify a backup file."
  echo "Available backups:"
  ls -lh "$BACKUP_DIR" | grep -v "^total" | awk '{print $9 " (" $5 ")" " - " $6 " " $7 " " $8}'
  exit 1
fi

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  # Try with backup directory prefix
  if [ -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
    BACKUP_FILE="$BACKUP_DIR/$BACKUP_FILE"
  else
    print_error "Backup file not found: $BACKUP_FILE"
    echo "Available backups:"
    ls -lh "$BACKUP_DIR" | grep -v "^total" | awk '{print $9 " (" $5 ")" " - " $6 " " $7 " " $8}'
    exit 1
  fi
fi

# Check if the application directory exists
if [ ! -d "$APP_DIR" ]; then
  print_message "Application directory not found. Creating: $APP_DIR"
  mkdir -p "$APP_DIR"
fi

# Create a temporary directory for the restore
TEMP_DIR=$(mktemp -d)
print_message "Creating temporary directory for restore: $TEMP_DIR"

# Extract the backup archive
print_message "Extracting backup archive: $BACKUP_FILE"
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"
if [ $? -ne 0 ]; then
  print_error "Failed to extract backup archive"
  rm -rf "$TEMP_DIR"
  exit 1
fi

# Confirm restore
echo ""
echo "WARNING: This will overwrite existing data in $APP_DIR"
if [ "$RESTORE_CONFIG" = true ]; then
  echo "Configuration files will be restored"
else
  echo "Configuration files will NOT be restored"
fi
if [ "$RESTORE_LOGS" = true ]; then
  echo "Log files will be restored"
else
  echo "Log files will NOT be restored"
fi
echo ""
read -p "Are you sure you want to continue? (y/n): " confirm
if [[ $confirm != [yY] && $confirm != [yY][eE][sS] ]]; then
  print_error "Restore aborted by user"
  rm -rf "$TEMP_DIR"
  exit 1
fi

# Create required directories if they don't exist
print_message "Creating required directories..."
mkdir -p "$APP_DIR/uploads"
mkdir -p "$APP_DIR/processed"
mkdir -p "$APP_DIR/transcripts"
mkdir -p "$APP_DIR/logs"

# Restore data directories
print_message "Restoring data directories..."
if [ -d "$TEMP_DIR/data/uploads" ]; then
  cp -r "$TEMP_DIR/data/uploads"/* "$APP_DIR/uploads/" 2>/dev/null || true
fi
if [ -d "$TEMP_DIR/data/processed" ]; then
  cp -r "$TEMP_DIR/data/processed"/* "$APP_DIR/processed/" 2>/dev/null || true
fi
if [ -d "$TEMP_DIR/data/transcripts" ]; then
  cp -r "$TEMP_DIR/data/transcripts"/* "$APP_DIR/transcripts/" 2>/dev/null || true
fi

# Restore configuration files if requested
if [ "$RESTORE_CONFIG" = true ]; then
  print_message "Restoring configuration files..."
  if [ -f "$TEMP_DIR/config/.env" ]; then
    cp "$TEMP_DIR/config/.env" "$APP_DIR/.env" 2>/dev/null || true
  fi
  if [ -f "$TEMP_DIR/config/ecosystem.config.js" ]; then
    cp "$TEMP_DIR/config/ecosystem.config.js" "$APP_DIR/ecosystem.config.js" 2>/dev/null || true
  fi
fi

# Restore log files if requested
if [ "$RESTORE_LOGS" = true ]; then
  print_message "Restoring log files..."
  if [ -d "$TEMP_DIR/logs/logs" ]; then
    cp -r "$TEMP_DIR/logs/logs"/* "$APP_DIR/logs/" 2>/dev/null || true
  fi
fi

# Clean up the temporary directory
rm -rf "$TEMP_DIR"

# Set correct permissions
print_message "Setting correct permissions..."
chmod -R 755 "$APP_DIR"
chmod 600 "$APP_DIR/.env" 2>/dev/null || true

# Restart the application if PM2 is installed
if command -v pm2 &> /dev/null; then
  print_message "Restarting the application..."
  cd "$APP_DIR"
  pm2 restart call-info-remover || pm2 start ecosystem.config.js
  print_success "Application restarted"
else
  print_warning "PM2 is not installed. You will need to restart the application manually."
fi

# Restore complete
echo ""
print_success "Restore completed successfully!"
echo ""
echo "The application data has been restored to: $APP_DIR"
echo ""
echo "If you encounter any issues, check the following:"
echo "1. Application logs: pm2 logs call-info-remover"
echo "2. Directory permissions: ls -la $APP_DIR"
echo ""
