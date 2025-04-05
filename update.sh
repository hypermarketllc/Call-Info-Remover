#!/bin/bash

# Call Info Remover - Update Script
# This script helps with updating the application to a newer version

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
DATE=$(date +%Y%m%d-%H%M%S)

# Show usage
show_usage() {
  echo "Usage: $0 [options]"
  echo ""
  echo "Options:"
  echo "  -d, --dir DIR        Specify application directory (default: $APP_DIR)"
  echo "  -s, --source DIR     Specify source directory with new files"
  echo "  -n, --no-backup      Skip creating a backup before updating"
  echo "  -r, --restart        Restart the application after updating"
  echo "  -h, --help           Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0 --source /path/to/new/version  Update from a local directory"
  echo "  $0 --restart                      Update and restart the application"
}

# Default options
SOURCE_DIR=""
CREATE_BACKUP=true
RESTART_APP=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -d|--dir)
      APP_DIR="$2"
      shift
      shift
      ;;
    -s|--source)
      SOURCE_DIR="$2"
      shift
      shift
      ;;
    -n|--no-backup)
      CREATE_BACKUP=false
      shift
      ;;
    -r|--restart)
      RESTART_APP=true
      shift
      ;;
    -h|--help)
      show_usage
      exit 0
      ;;
    *)
      print_error "Unknown option: $1"
      show_usage
      exit 1
      ;;
  esac
done

# Check if application directory exists
if [ ! -d "$APP_DIR" ]; then
  print_error "Application directory not found: $APP_DIR"
  exit 1
fi

# Create backup
create_backup() {
  print_message "Creating backup before updating"
  
  # Create backup directory if it doesn't exist
  if [ ! -d "$BACKUP_DIR" ]; then
    print_message "Creating backup directory: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
  fi
  
  # Create backup filename
  BACKUP_FILE="$BACKUP_DIR/pre_update_$DATE.tar.gz"
  
  # Create backup
  print_message "Backing up data to $BACKUP_FILE"
  tar -czf "$BACKUP_FILE" -C "$APP_DIR" uploads processed transcripts 2>/dev/null || true
  
  # Backup configuration
  if [ -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" "$BACKUP_DIR/env_pre_update_$DATE.bak"
    print_success "Configuration backed up to $BACKUP_DIR/env_pre_update_$DATE.bak"
  fi
  
  print_success "Backup completed: $BACKUP_FILE"
}

# Update from source directory
update_from_source() {
  print_message "Updating from source directory: $SOURCE_DIR"
  
  # Check if source directory exists
  if [ ! -d "$SOURCE_DIR" ]; then
    print_error "Source directory not found: $SOURCE_DIR"
    exit 1
  fi
  
  # Copy files, excluding data directories and configuration
  print_message "Copying new files"
  rsync -av --progress "$SOURCE_DIR/" "$APP_DIR/" \
    --exclude "uploads" \
    --exclude "processed" \
    --exclude "transcripts" \
    --exclude "temp" \
    --exclude "logs" \
    --exclude ".env" \
    --exclude "node_modules"
  
  print_success "Files copied successfully"
}

# Update dependencies
update_dependencies() {
  print_message "Updating dependencies"
  
  # Check if package.json exists
  if [ ! -f "$APP_DIR/package.json" ]; then
    print_warning "package.json not found, skipping dependency update"
    return
  }
  
  # Install dependencies
  cd "$APP_DIR"
  npm install --production
  
  print_success "Dependencies updated"
}

# Restart application
restart_application() {
  print_message "Restarting application"
  
  # Check if PM2 is installed
  if ! command -v pm2 &> /dev/null; then
    print_warning "PM2 not found, skipping restart"
    return
  fi
  
  # Restart application
  cd "$APP_DIR"
  pm2 restart call-info-remover || pm2 start server.js --name call-info-remover
  
  print_success "Application restarted"
}

# Main update process
print_message "Starting update process for Call Info Remover"

# Create backup if enabled
if [ "$CREATE_BACKUP" = true ]; then
  create_backup
else
  print_warning "Skipping backup creation"
fi

# Update from source directory if provided
if [ -n "$SOURCE_DIR" ]; then
  update_from_source
else
  print_message "No source directory provided, updating dependencies only"
fi

# Update dependencies
update_dependencies

# Restart application if enabled
if [ "$RESTART_APP" = true ]; then
  restart_application
else
  print_message "Application not restarted. To restart manually, run:"
  echo "cd $APP_DIR && pm2 restart call-info-remover"
fi

print_success "Update process completed"
