#!/bin/bash

# Call Info Remover - Backup and Restore Script
# This script helps with backing up and restoring the application data

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
  echo "  -b, --backup         Create a backup"
  echo "  -r, --restore FILE   Restore from a backup file"
  echo "  -l, --list           List available backups"
  echo "  -d, --dir DIR        Specify application directory (default: $APP_DIR)"
  echo "  -o, --output DIR     Specify backup directory (default: $BACKUP_DIR)"
  echo "  -h, --help           Show this help message"
  echo ""
  echo "Examples:"
  echo "  $0 --backup                  Create a backup with default settings"
  echo "  $0 --backup --dir /custom/path  Create a backup from a custom directory"
  echo "  $0 --restore backup_20250405.tar.gz  Restore from a specific backup"
  echo "  $0 --list                    List all available backups"
}

# Check if no arguments provided
if [ $# -eq 0 ]; then
  show_usage
  exit 1
fi

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -b|--backup)
      ACTION="backup"
      shift
      ;;
    -r|--restore)
      ACTION="restore"
      BACKUP_FILE="$2"
      shift
      shift
      ;;
    -l|--list)
      ACTION="list"
      shift
      ;;
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

# Create backup directory if it doesn't exist
if [ ! -d "$BACKUP_DIR" ]; then
  print_message "Creating backup directory: $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
  print_success "Backup directory created"
fi

# List available backups
list_backups() {
  print_message "Available backups in $BACKUP_DIR:"
  if [ -z "$(ls -A $BACKUP_DIR 2>/dev/null)" ]; then
    echo "No backups found"
  else
    ls -lh $BACKUP_DIR | grep -v "^total" | awk '{print $9 " (" $5 ")" " - " $6 " " $7 " " $8}'
  fi
}

# Create a backup
create_backup() {
  print_message "Creating backup from $APP_DIR"
  
  # Check if application directory exists
  if [ ! -d "$APP_DIR" ]; then
    print_error "Application directory not found: $APP_DIR"
    exit 1
  fi
  
  # Check for required directories
  for dir in uploads processed transcripts; do
    if [ ! -d "$APP_DIR/$dir" ]; then
      print_warning "Directory not found: $APP_DIR/$dir"
    fi
  done
  
  # Create backup filename
  BACKUP_FILE="$BACKUP_DIR/backup_$DATE.tar.gz"
  
  # Create backup
  print_message "Backing up data to $BACKUP_FILE"
  tar -czf "$BACKUP_FILE" -C "$APP_DIR" uploads processed transcripts 2>/dev/null || true
  
  # Check if .env file exists and back it up separately
  if [ -f "$APP_DIR/.env" ]; then
    print_message "Backing up configuration"
    cp "$APP_DIR/.env" "$BACKUP_DIR/env_$DATE.bak"
    print_success "Configuration backed up to $BACKUP_DIR/env_$DATE.bak"
  else
    print_warning "No .env file found, skipping configuration backup"
  fi
  
  print_success "Backup completed: $BACKUP_FILE"
  
  # Show backup size
  BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "Backup size: $BACKUP_SIZE"
}

# Restore from a backup
restore_backup() {
  # Check if backup file exists
  if [ ! -f "$BACKUP_FILE" ] && [ ! -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
    print_error "Backup file not found: $BACKUP_FILE"
    echo "Available backups:"
    list_backups
    exit 1
  fi
  
  # Use full path if only filename was provided
  if [ ! -f "$BACKUP_FILE" ]; then
    BACKUP_FILE="$BACKUP_DIR/$BACKUP_FILE"
  fi
  
  print_message "Restoring from backup: $BACKUP_FILE"
  
  # Check if application directory exists
  if [ ! -d "$APP_DIR" ]; then
    print_message "Creating application directory: $APP_DIR"
    mkdir -p "$APP_DIR"
  fi
  
  # Confirm restore
  echo ""
  echo "WARNING: This will overwrite existing data in $APP_DIR"
  read -p "Are you sure you want to continue? (y/n): " confirm
  if [[ $confirm != [yY] && $confirm != [yY][eE][sS] ]]; then
    print_error "Restore aborted by user"
    exit 1
  fi
  
  # Extract backup
  print_message "Extracting backup to $APP_DIR"
  tar -xzf "$BACKUP_FILE" -C "$APP_DIR"
  
  # Check if there's a corresponding .env backup
  ENV_BACKUP=$(echo "$BACKUP_FILE" | sed 's/backup_/env_/g' | sed 's/\.tar\.gz/\.bak/g')
  if [ -f "$ENV_BACKUP" ]; then
    print_message "Found configuration backup: $ENV_BACKUP"
    read -p "Do you want to restore the configuration as well? (y/n): " restore_env
    if [[ $restore_env == [yY] || $restore_env == [yY][eE][sS] ]]; then
      cp "$ENV_BACKUP" "$APP_DIR/.env"
      print_success "Configuration restored"
    else
      print_warning "Configuration not restored"
    fi
  fi
  
  # Fix permissions
  print_message "Setting correct permissions"
  chmod -R 755 "$APP_DIR"
  
  print_success "Restore completed"
  echo "You may need to restart the application for changes to take effect:"
  echo "cd $APP_DIR && pm2 restart call-info-remover"
}

# Execute the requested action
case $ACTION in
  backup)
    create_backup
    ;;
  restore)
    restore_backup
    ;;
  list)
    list_backups
    ;;
  *)
    print_error "No action specified"
    show_usage
    exit 1
    ;;
esac
