#!/bin/bash

# Call Info Remover - Package Scripts
# This script packages all deployment scripts into a single archive for easy distribution

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
SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPTS_DIR"
PACKAGE_NAME="call-info-remover-scripts"
VERSION=$(date +%Y%m%d)

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -o|--output)
      OUTPUT_DIR="$2"
      shift
      shift
      ;;
    -n|--name)
      PACKAGE_NAME="$2"
      shift
      shift
      ;;
    -v|--version)
      VERSION="$2"
      shift
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  -o, --output DIR    Specify output directory (default: current directory)"
      echo "  -n, --name NAME     Specify package name (default: call-info-remover-scripts)"
      echo "  -v, --version VER   Specify package version (default: current date in YYYYMMDD format)"
      echo "  -h, --help          Show this help message"
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

# Create output directory if it doesn't exist
if [ ! -d "$OUTPUT_DIR" ]; then
  print_message "Creating output directory: $OUTPUT_DIR"
  mkdir -p "$OUTPUT_DIR"
fi

# Create a temporary directory for packaging
TEMP_DIR=$(mktemp -d)
print_message "Creating temporary directory for packaging: $TEMP_DIR"

# Create package directory
PACKAGE_DIR="$TEMP_DIR/$PACKAGE_NAME-$VERSION"
mkdir -p "$PACKAGE_DIR"

# List of scripts to include
SCRIPTS=(
  "deploy.sh"
  "update-app.sh"
  "backup-app.sh"
  "restore-app.sh"
  "check-health.sh"
  "setup-cron-backup.sh"
  "SCRIPTS-README.md"
  "DEPLOYMENT.md"
)

# Copy scripts to package directory
print_message "Copying scripts to package directory..."
for script in "${SCRIPTS[@]}"; do
  if [ -f "$SCRIPTS_DIR/$script" ]; then
    cp "$SCRIPTS_DIR/$script" "$PACKAGE_DIR/"
    chmod +x "$PACKAGE_DIR/$script" 2>/dev/null || true
  else
    print_warning "Script not found: $script"
  fi
done

# Create README file if SCRIPTS-README.md doesn't exist
if [ ! -f "$SCRIPTS_DIR/SCRIPTS-README.md" ]; then
  print_message "Creating README.md file..."
  cat > "$PACKAGE_DIR/README.md" << EOF
# Call Info Remover - Deployment Scripts

This package contains scripts to help with deploying, updating, and maintaining the Call Info Remover application on a Linux server.

## Available Scripts

- deploy.sh: Comprehensive deployment script
- update-app.sh: Script to update the application
- backup-app.sh: Script to create backups
- restore-app.sh: Script to restore from backups
- check-health.sh: Script to check application health
- setup-cron-backup.sh: Script to set up automated backups

## Making Scripts Executable

Before using these scripts, make them executable:

\`\`\`bash
chmod +x *.sh
\`\`\`

## Usage

See the help message for each script:

\`\`\`bash
./deploy.sh --help
./update-app.sh --help
./backup-app.sh --help
./restore-app.sh --help
./check-health.sh --help
./setup-cron-backup.sh --help
\`\`\`
EOF
else
  # Rename SCRIPTS-README.md to README.md
  cp "$PACKAGE_DIR/SCRIPTS-README.md" "$PACKAGE_DIR/README.md"
  rm "$PACKAGE_DIR/SCRIPTS-README.md"
fi

# Create the package archive
print_message "Creating package archive..."
PACKAGE_FILE="$OUTPUT_DIR/$PACKAGE_NAME-$VERSION.tar.gz"
tar -czf "$PACKAGE_FILE" -C "$TEMP_DIR" "$PACKAGE_NAME-$VERSION"
if [ $? -ne 0 ]; then
  print_error "Failed to create package archive"
  rm -rf "$TEMP_DIR"
  exit 1
fi

# Clean up the temporary directory
rm -rf "$TEMP_DIR"

# Calculate package size
PACKAGE_SIZE=$(du -h "$PACKAGE_FILE" | cut -f1)

# Package complete
echo ""
print_success "Package created successfully!"
echo "Package file: $PACKAGE_FILE"
echo "Package size: $PACKAGE_SIZE"
echo ""
echo "To extract this package, use:"
echo "tar -xzf $PACKAGE_FILE"
echo ""
