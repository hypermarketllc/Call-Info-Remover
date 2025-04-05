#!/bin/bash

# Call Info Remover - Update Script
# This script updates the Call Info Remover application to the latest version

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

# Default application directory
APP_DIR="/var/www/coveredamerican.com/audio"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -d|--dir)
      APP_DIR="$2"
      shift
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  -d, --dir DIR    Specify application directory (default: $APP_DIR)"
      echo "  -h, --help       Show this help message"
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

# Check if the directory is a git repository
if [ ! -d "$APP_DIR/.git" ]; then
  print_error "Not a git repository: $APP_DIR"
  print_error "This script can only update applications installed from git"
  exit 1
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
  print_error "PM2 is not installed. Please install it first:"
  print_error "npm install -g pm2"
  exit 1
fi

# Create backup of the current application
print_message "Creating backup of the current application..."
BACKUP_DIR="/tmp/call-info-remover-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Copy important files to backup
cp -r "$APP_DIR/.env" "$APP_DIR/ecosystem.config.js" "$BACKUP_DIR/" 2>/dev/null || true
print_success "Backup created at $BACKUP_DIR"

# Update the application
print_message "Updating the application..."
cd "$APP_DIR"

# Stash any local changes
git stash

# Pull the latest changes
print_message "Pulling the latest changes from the repository..."
git pull
if [ $? -ne 0 ]; then
  print_error "Failed to pull the latest changes"
  print_message "Restoring from backup..."
  cp -r "$BACKUP_DIR"/* "$APP_DIR/"
  exit 1
fi
print_success "Latest changes pulled successfully"

# Install dependencies
print_message "Installing dependencies..."
npm install --production
if [ $? -ne 0 ]; then
  print_error "Failed to install dependencies"
  print_message "Restoring from backup..."
  cp -r "$BACKUP_DIR"/* "$APP_DIR/"
  exit 1
fi
print_success "Dependencies installed successfully"

# Restart the application
print_message "Restarting the application..."
pm2 restart call-info-remover || pm2 start ecosystem.config.js
print_success "Application restarted successfully"

# Check if the application is running
pm2_status=$(pm2 list | grep call-info-remover | grep online)
if [ -n "$pm2_status" ]; then
  print_success "Application is running with PM2"
else
  print_error "Application is not running with PM2"
  print_error "Please check the logs: pm2 logs call-info-remover"
  exit 1
fi

# Update complete
echo ""
print_success "Call Info Remover has been successfully updated!"
echo ""
echo "You can check the application status with: pm2 status"
echo "View logs with: pm2 logs call-info-remover"
echo ""
