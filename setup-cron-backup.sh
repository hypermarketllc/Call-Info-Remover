#!/bin/bash

# Call Info Remover - Setup Cron Backup Script
# This script sets up a cron job for automated backups of the Call Info Remover application

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
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPTS_DIR/backup-app.sh"
BACKUP_FREQUENCY="daily"  # daily, weekly, monthly
BACKUP_TIME="02:00"       # 2 AM
BACKUP_RETENTION=30       # days

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
    -s|--script)
      BACKUP_SCRIPT="$2"
      shift
      shift
      ;;
    -f|--frequency)
      BACKUP_FREQUENCY="$2"
      shift
      shift
      ;;
    -t|--time)
      BACKUP_TIME="$2"
      shift
      shift
      ;;
    -r|--retention)
      BACKUP_RETENTION="$2"
      shift
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  -d, --dir DIR          Specify application directory (default: $APP_DIR)"
      echo "  -o, --output DIR       Specify backup directory (default: $BACKUP_DIR)"
      echo "  -s, --script PATH      Specify backup script path (default: $BACKUP_SCRIPT)"
      echo "  -f, --frequency FREQ   Specify backup frequency (daily, weekly, monthly) (default: $BACKUP_FREQUENCY)"
      echo "  -t, --time TIME        Specify backup time in 24-hour format (default: $BACKUP_TIME)"
      echo "  -r, --retention DAYS   Specify backup retention period in days (default: $BACKUP_RETENTION)"
      echo "  -h, --help             Show this help message"
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

# Check if the backup script exists
if [ ! -f "$BACKUP_SCRIPT" ]; then
  print_error "Backup script not found: $BACKUP_SCRIPT"
  exit 1
fi

# Make the backup script executable
chmod +x "$BACKUP_SCRIPT"

# Create the backup directory if it doesn't exist
if [ ! -d "$BACKUP_DIR" ]; then
  print_message "Creating backup directory: $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
fi

# Parse backup time
HOUR=$(echo "$BACKUP_TIME" | cut -d: -f1)
MINUTE=$(echo "$BACKUP_TIME" | cut -d: -f2)

# Create cron expression based on frequency
case "$BACKUP_FREQUENCY" in
  daily)
    CRON_EXPR="$MINUTE $HOUR * * *"
    ;;
  weekly)
    CRON_EXPR="$MINUTE $HOUR * * 0"  # Sunday
    ;;
  monthly)
    CRON_EXPR="$MINUTE $HOUR 1 * *"  # 1st day of month
    ;;
  *)
    print_error "Invalid frequency: $BACKUP_FREQUENCY. Must be daily, weekly, or monthly."
    exit 1
    ;;
esac

# Create cleanup script for old backups
CLEANUP_SCRIPT="$SCRIPTS_DIR/cleanup-old-backups.sh"
cat > "$CLEANUP_SCRIPT" << EOF
#!/bin/bash
# This script removes backups older than $BACKUP_RETENTION days
find $BACKUP_DIR -name "call-info-remover-backup-*.tar.gz" -type f -mtime +$BACKUP_RETENTION -delete
EOF
chmod +x "$CLEANUP_SCRIPT"

# Create the cron job
CRON_JOB="$CRON_EXPR $BACKUP_SCRIPT -d $APP_DIR -o $BACKUP_DIR && $CLEANUP_SCRIPT"
CRON_JOB_ESCAPED=$(echo "$CRON_JOB" | sed 's/\//\\\//g')

# Check if crontab exists for the current user
CRONTAB_EXISTS=$(crontab -l 2>/dev/null || echo "")

if echo "$CRONTAB_EXISTS" | grep -q "$BACKUP_SCRIPT"; then
  # Update existing cron job
  print_message "Updating existing cron job..."
  NEW_CRONTAB=$(echo "$CRONTAB_EXISTS" | sed "s/.*$BACKUP_SCRIPT.*/$CRON_JOB_ESCAPED/")
  echo "$NEW_CRONTAB" | crontab -
else
  # Add new cron job
  print_message "Adding new cron job..."
  (echo "$CRONTAB_EXISTS"; echo "$CRON_JOB") | crontab -
fi

# Verify cron job was added
if crontab -l | grep -q "$BACKUP_SCRIPT"; then
  print_success "Cron job set up successfully"
  echo "Backup will run $BACKUP_FREQUENCY at $BACKUP_TIME"
  echo "Backups will be stored in $BACKUP_DIR"
  echo "Backups older than $BACKUP_RETENTION days will be automatically removed"
else
  print_error "Failed to set up cron job"
  exit 1
fi

# Print next backup time
case "$BACKUP_FREQUENCY" in
  daily)
    NEXT_BACKUP=$(date -d "tomorrow $BACKUP_TIME" +"%Y-%m-%d %H:%M")
    ;;
  weekly)
    # Find next Sunday
    TODAY=$(date +%u)
    DAYS_TO_SUNDAY=$((7 - TODAY))
    if [ "$DAYS_TO_SUNDAY" -eq 7 ]; then
      DAYS_TO_SUNDAY=0
    fi
    NEXT_BACKUP=$(date -d "+$DAYS_TO_SUNDAY days $BACKUP_TIME" +"%Y-%m-%d %H:%M")
    ;;
  monthly)
    # Find 1st day of next month
    NEXT_MONTH=$(date -d "$(date +%Y-%m-15) +1 month" +%Y-%m-01)
    NEXT_BACKUP=$(date -d "$NEXT_MONTH $BACKUP_TIME" +"%Y-%m-%d %H:%M")
    ;;
esac

echo "Next backup will run at: $NEXT_BACKUP"
echo ""
echo "To view all scheduled cron jobs, run: crontab -l"
echo "To edit cron jobs manually, run: crontab -e"
