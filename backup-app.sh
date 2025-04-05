#!/bin/bash

# Call Info Remover - Backup Script
# This script creates a backup of the Call Info Remover application data

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
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
INCLUDE_CONFIG=true
INCLUDE_LOGS=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -d|--dir)
      APP_DIR="$2"
      shift
      shift
      ;;
    -o|--output)
      BACKUP_DIR="$2"
      shift
      shift
      ;;
    -n|--no-config)
      INCLUDE_CONFIG=false
      shift
      ;;
    -l|--logs)
      INCLUDE_LOGS=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  -d, --dir DIR      Specify application directory (default: $APP_DIR)"
      echo "  -o, --output DIR   Specify backup directory (default: $BACKUP_DIR)"
      echo "  -n, --no-config    Exclude configuration files from backup"
      echo "  -l, --logs         Include log files in backup"
      echo "  -h, --help         Show this help message"
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

# Check if the application directory exists
if [ ! -d "$APP_DIR" ]; then
  print_error "Application directory not found: $APP_DIR"
  exit 1
fi

# Create backup directory if it doesn't exist
if [ ! -d "$BACKUP_DIR" ]; then
  print_message "Creating backup directory: $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
fi

# Create backup filename
BACKUP_FILE="$BACKUP_DIR/call-info-remover-backup-$TIMESTAMP.tar.gz"

# Create a temporary directory for the backup
TEMP_DIR=$(mktemp -d)
print_message "Creating temporary directory for backup: $TEMP_DIR"

# Copy data directories to the temporary directory
print_message "Copying data directories..."
mkdir -p "$TEMP_DIR/data"
cp -r "$APP_DIR/uploads" "$APP_DIR/processed" "$APP_DIR/transcripts" "$TEMP_DIR/data/" 2>/dev/null || true

# Copy configuration files if requested
if [ "$INCLUDE_CONFIG" = true ]; then
  print_message "Copying configuration files..."
  mkdir -p "$TEMP_DIR/config"
  cp "$APP_DIR/.env" "$APP_DIR/ecosystem.config.js" "$TEMP_DIR/config/" 2>/dev/null || true
fi

# Copy log files if requested
if [ "$INCLUDE_LOGS" = true ]; then
  print_message "Copying log files..."
  mkdir -p "$TEMP_DIR/logs"
  cp -r "$APP_DIR/logs" "$TEMP_DIR/logs/" 2>/dev/null || true
fi

# Create the backup archive
print_message "Creating backup archive: $BACKUP_FILE"
tar -czf "$BACKUP_FILE" -C "$TEMP_DIR" .
if [ $? -ne 0 ]; then
  print_error "Failed to create backup archive"
  rm -rf "$TEMP_DIR"
  exit 1
fi

# Clean up the temporary directory
rm -rf "$TEMP_DIR"

# Calculate backup size
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

# Backup complete
echo ""
print_success "Backup completed successfully!"
echo "Backup file: $BACKUP_FILE"
echo "Backup size: $BACKUP_SIZE"
echo ""
echo "To restore this backup, use:"
echo "tar -xzf $BACKUP_FILE -C /path/to/restore/directory"
echo ""

# List all backups
print_message "Available backups:"
ls -lh "$BACKUP_DIR" | grep -v "^total" | awk '{print $9 " (" $5 ")" " - " $6 " " $7 " " $8}'
