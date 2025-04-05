#!/bin/bash

# Call Info Remover - Comprehensive Deployment Script
# This script automates the complete deployment process for the Call Info Remover application

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

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  print_error "Please run this script as root or with sudo"
  exit 1
fi

# Configuration variables
DOMAIN="coveredamerican.com"
APP_DIR="/var/www/${DOMAIN}/audio"
PORT="8531"
REPO_URL="https://github.com/hypermarketllc/Call-Info-Remover.git"

# Get Deepgram API key
read -p "Enter your Deepgram API key: " DEEPGRAM_API_KEY
if [ -z "$DEEPGRAM_API_KEY" ]; then
  print_warning "No Deepgram API key provided. You will need to set this manually later."
  DEEPGRAM_API_KEY="your_api_key_here"
fi

# Get PostgreSQL credentials
read -p "Enter PostgreSQL database name (default: call_info_remover): " DB_NAME
DB_NAME=${DB_NAME:-call_info_remover}

read -p "Enter PostgreSQL username (default: call_info_user): " DB_USER
DB_USER=${DB_USER:-call_info_user}

read -p "Enter PostgreSQL password: " DB_PASSWORD
if [ -z "$DB_PASSWORD" ]; then
  # Generate a random password if none provided
  DB_PASSWORD=$(openssl rand -base64 12)
  print_warning "No password provided. Generated random password: $DB_PASSWORD"
  print_warning "Please save this password for future reference."
fi

# Confirm installation
echo ""
echo "Installation will proceed with the following settings:"
echo "Domain: $DOMAIN"
echo "Installation directory: $APP_DIR"
echo "Port: $PORT"
echo "Repository URL: $REPO_URL"
echo "Deepgram API key: ${DEEPGRAM_API_KEY:0:5}*****"
echo "PostgreSQL database: $DB_NAME"
echo "PostgreSQL user: $DB_USER"
echo "PostgreSQL password: ${DB_PASSWORD:0:2}*****"
echo ""
read -p "Continue with installation? (y/n): " confirm
if [[ $confirm != [yY] && $confirm != [yY][eE][sS] ]]; then
  print_error "Installation aborted by user"
  exit 1
fi

# Function to check if a command exists
command_exists() {
  command -v "$1" &> /dev/null
}

# Function to check if a package is installed
package_installed() {
  dpkg -l "$1" &> /dev/null
}

# Step 1: Update system packages
print_message "Step 1: Updating system packages..."
apt update
apt upgrade -y
print_success "System packages updated"

# Step 2: Install Node.js
print_message "Step 2: Installing Node.js..."
if ! command_exists node; then
  print_message "Node.js not found, installing..."
  curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
  apt install -y nodejs
  print_success "Node.js installed"
else
  node_version=$(node -v)
  print_warning "Node.js is already installed (${node_version})"
fi

# Verify Node.js installation
if ! command_exists node; then
  print_error "Node.js installation failed"
  exit 1
fi

node_version=$(node -v)
npm_version=$(npm -v)
print_success "Node.js ${node_version} and npm ${npm_version} are installed"

# Step 3: Install SoX and FFmpeg
print_message "Step 3: Installing SoX and FFmpeg..."
apt install -y sox libsox-fmt-all ffmpeg
print_success "SoX and FFmpeg installed"

# Verify SoX and FFmpeg installations
if ! command_exists sox || ! command_exists ffmpeg; then
  print_error "SoX or FFmpeg installation failed"
  exit 1
fi

sox_version=$(sox --version | head -n 1)
ffmpeg_version=$(ffmpeg -version | head -n 1)
print_success "${sox_version} and ${ffmpeg_version} are installed"

# Step 4: Install PostgreSQL
print_message "Step 4: Installing PostgreSQL..."
apt install -y postgresql postgresql-contrib
print_success "PostgreSQL installed"

# Verify PostgreSQL installation
if ! command_exists psql; then
  print_error "PostgreSQL installation failed"
  exit 1
fi

pg_version=$(psql --version)
print_success "${pg_version} is installed"

# Step 5: Configure PostgreSQL
print_message "Step 5: Configuring PostgreSQL..."

# Create database and user
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

print_success "PostgreSQL database and user created"

# Step 6: Install Nginx
print_message "Step 6: Installing Nginx..."
apt install -y nginx
print_success "Nginx installed"

# Verify Nginx installation
if ! command_exists nginx; then
  print_error "Nginx installation failed"
  exit 1
fi

nginx_version=$(nginx -v 2>&1)
print_success "${nginx_version} is installed"

# Step 7: Install PM2
print_message "Step 7: Installing PM2..."
if ! command_exists pm2; then
  npm install -g pm2
  print_success "PM2 installed"
else
  print_warning "PM2 is already installed"
fi

# Verify PM2 installation
if ! command_exists pm2; then
  print_error "PM2 installation failed"
  exit 1
fi

pm2_version=$(pm2 -v)
print_success "PM2 version ${pm2_version} is installed"

# Step 8: Create directory structure
print_message "Step 8: Creating directory structure..."
mkdir -p $APP_DIR
mkdir -p $APP_DIR/uploads
mkdir -p $APP_DIR/processed
mkdir -p $APP_DIR/transcripts
mkdir -p $APP_DIR/temp
mkdir -p $APP_DIR/logs

# Get current user
current_user=$(logname || echo $SUDO_USER)
if [ -z "$current_user" ]; then
  print_warning "Could not determine the current user, using current directory owner"
  current_user=$(stat -c '%U' .)
fi

# Set directory ownership
print_message "Setting directory ownership to $current_user..."
chown -R $current_user:$current_user $APP_DIR
chmod -R 755 $APP_DIR
print_success "Directory structure created with correct permissions"

# Step 9: Clone the repository
print_message "Step 9: Cloning the repository..."
cd $APP_DIR

# Check if the directory is not empty
if [ "$(ls -A $APP_DIR)" ]; then
  print_warning "Directory is not empty. Cleaning up..."
  # Keep only the data directories
  find $APP_DIR -mindepth 1 -maxdepth 1 -not -name 'uploads' -not -name 'processed' -not -name 'transcripts' -not -name 'temp' -not -name 'logs' -exec rm -rf {} \;
fi

# Clone the repository
print_message "Cloning from $REPO_URL..."
git clone $REPO_URL .
if [ $? -ne 0 ]; then
  print_error "Failed to clone repository"
  exit 1
fi
print_success "Repository cloned successfully"

# Step 10: Install application dependencies
print_message "Step 10: Installing application dependencies..."
npm install --production
print_success "Dependencies installed"

# Step 11: Create .env file
print_message "Step 11: Creating .env file..."
cat > $APP_DIR/.env << EOF
NODE_ENV=production
PORT=$PORT
DEEPGRAM_API_KEY=$DEEPGRAM_API_KEY

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
EOF
chmod 600 $APP_DIR/.env
print_success ".env file created"

# Step 12: Set up the database
print_message "Step 12: Setting up the database..."
cd $APP_DIR
node db/setup.js
print_success "Database setup completed"

# Step 13: Create PM2 configuration
print_message "Step 13: Creating PM2 configuration..."
cat > $APP_DIR/ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'call-info-remover',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: $PORT
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
EOF
print_success "PM2 configuration created"

# Step 14: Configure Nginx
print_message "Step 14: Configuring Nginx..."

# Create Nginx configuration
cat > /etc/nginx/sites-available/$DOMAIN << EOF
# HTTP server - redirects to HTTPS
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    # Redirect all HTTP traffic to HTTPS
    return 301 https://\$host\$request_uri;
}

# HTTPS server
server {
    listen 443 ssl;
    server_name $DOMAIN www.$DOMAIN;
    
    # SSL configuration will be added by Certbot
    
    # Audio redaction application
    location /audio/ {
        proxy_pass http://localhost:$PORT/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Increase timeouts for large file uploads
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        # Increase max body size for large file uploads (100MB)
        client_max_body_size 100M;
    }
    
    # For root path, redirect to /audio
    location = / {
        return 301 https://\$host/audio;
    }
}
EOF

# Enable the site
if [ -f /etc/nginx/sites-enabled/$DOMAIN ]; then
  rm /etc/nginx/sites-enabled/$DOMAIN
fi
ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/

# Test Nginx configuration
print_message "Testing Nginx configuration..."
nginx -t
if [ $? -ne 0 ]; then
  print_error "Nginx configuration test failed"
  exit 1
fi

# Restart Nginx
systemctl restart nginx
print_success "Nginx configured and restarted"

# Step 15: Set up SSL with Let's Encrypt
print_message "Step 15: Setting up SSL with Let's Encrypt..."
apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
print_message "Obtaining SSL certificate for $DOMAIN and www.$DOMAIN..."
certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN

# Check if SSL certificate was obtained
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  print_warning "Failed to obtain SSL certificate automatically. You may need to run certbot manually."
  print_warning "Run: sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
else
  print_success "SSL certificate obtained successfully"
fi

# Step 16: Start the application
print_message "Step 16: Starting the application with PM2..."
cd $APP_DIR
pm2 start ecosystem.config.js
print_success "Application started"

# Step 17: Set up PM2 to start on boot
print_message "Step 17: Setting up PM2 to start on boot..."
pm2 save
env PATH=$PATH:/usr/bin pm2 startup systemd -u $current_user --hp /home/$current_user
print_success "PM2 startup configured"

# Step 18: Configure firewall
print_message "Step 18: Configuring firewall..."
if command_exists ufw; then
  ufw allow 22
  ufw allow 80
  ufw allow 443
  ufw --force enable
  print_success "Firewall configured"
else
  print_warning "UFW not found, skipping firewall configuration"
fi

# Step 19: Final verification
print_message "Step 19: Performing final verification..."

# Check if Nginx is running
if systemctl is-active --quiet nginx; then
  print_success "Nginx is running"
else
  print_error "Nginx is not running"
fi

# Check if PostgreSQL is running
if systemctl is-active --quiet postgresql; then
  print_success "PostgreSQL is running"
else
  print_error "PostgreSQL is not running"
fi

# Check if PM2 is running the application
pm2_status=$(pm2 list | grep call-info-remover | grep online)
if [ -n "$pm2_status" ]; then
  print_success "Application is running with PM2"
else
  print_error "Application is not running with PM2"
fi

# Installation complete
echo ""
print_success "Call Info Remover has been successfully installed!"
echo ""
echo "The application is now running at: https://$DOMAIN/audio"
echo ""
echo "PostgreSQL Database Information:"
echo "  Database: $DB_NAME"
echo "  Username: $DB_USER"
echo "  Password: $DB_PASSWORD"
echo ""
echo "You can check the application status with: pm2 status"
echo "View logs with: pm2 logs call-info-remover"
echo ""
echo "If you encounter any issues, check the following:"
echo "1. Application logs: pm2 logs call-info-remover"
echo "2. Nginx logs: sudo tail -f /var/log/nginx/error.log"
echo "3. PostgreSQL logs: sudo tail -f /var/log/postgresql/postgresql-*.log"
echo "4. Directory permissions: ls -la $APP_DIR"
echo ""
echo "To update the application in the future, run:"
echo "cd $APP_DIR && git pull && npm install --production && pm2 restart call-info-remover"
