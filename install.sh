#!/bin/bash

# Call Info Remover - Installation Script
# This script automates the deployment of the Call Info Remover application on a Linux server

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

# Get installation directory
INSTALL_DIR="/var/www/coveredamerican.com/audio"
read -p "Enter installation directory [$INSTALL_DIR]: " input_dir
INSTALL_DIR=${input_dir:-$INSTALL_DIR}

# Get port number
PORT="8531"
read -p "Enter port number [$PORT]: " input_port
PORT=${input_port:-$PORT}

# Get Deepgram API key
read -p "Enter your Deepgram API key: " DEEPGRAM_API_KEY

# Confirm installation
echo ""
echo "Installation will proceed with the following settings:"
echo "Installation directory: $INSTALL_DIR"
echo "Port: $PORT"
echo "Deepgram API key: ${DEEPGRAM_API_KEY:0:5}*****"
echo ""
read -p "Continue with installation? (y/n): " confirm
if [[ $confirm != [yY] && $confirm != [yY][eE][sS] ]]; then
  print_error "Installation aborted by user"
  exit 1
fi

# Update system packages
print_message "Updating system packages..."
apt update
apt upgrade -y
print_success "System packages updated"

# Install Node.js
print_message "Installing Node.js..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
  apt install -y nodejs
  print_success "Node.js installed"
else
  print_warning "Node.js is already installed"
  node -v
fi

# Install SoX and FFmpeg
print_message "Installing SoX and FFmpeg..."
apt install -y sox libsox-fmt-all ffmpeg
print_success "SoX and FFmpeg installed"

# Create installation directory
print_message "Creating installation directory..."
mkdir -p $INSTALL_DIR
print_success "Installation directory created"

# Set directory ownership
current_user=$(logname || echo $SUDO_USER)
if [ -z "$current_user" ]; then
  print_warning "Could not determine the current user, using current directory owner"
  current_user=$(stat -c '%U' .)
fi
print_message "Setting directory ownership to $current_user..."
chown -R $current_user:$current_user $INSTALL_DIR
print_success "Directory ownership set"

# Copy application files
print_message "Copying application files..."
cp -r * $INSTALL_DIR/
print_success "Application files copied"

# Create required directories
print_message "Creating required directories..."
mkdir -p $INSTALL_DIR/uploads
mkdir -p $INSTALL_DIR/processed
mkdir -p $INSTALL_DIR/transcripts
mkdir -p $INSTALL_DIR/temp
mkdir -p $INSTALL_DIR/logs
print_success "Required directories created"

# Create .env file
print_message "Creating .env file..."
cat > $INSTALL_DIR/.env << EOF
NODE_ENV=production
PORT=$PORT
DEEPGRAM_API_KEY=$DEEPGRAM_API_KEY
EOF
chmod 600 $INSTALL_DIR/.env
print_success ".env file created"

# Install PM2
print_message "Installing PM2..."
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
  print_success "PM2 installed"
else
  print_warning "PM2 is already installed"
fi

# Create PM2 configuration
print_message "Creating PM2 configuration..."
cat > $INSTALL_DIR/ecosystem.config.js << EOF
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

# Install application dependencies
print_message "Installing application dependencies..."
cd $INSTALL_DIR
npm install --production
print_success "Application dependencies installed"

# Configure Nginx
print_message "Installing Nginx..."
apt install -y nginx
print_success "Nginx installed"

print_message "Configuring Nginx..."
cat > /etc/nginx/sites-available/coveredamerican.com << EOF
server {
    listen 80;
    server_name coveredamerican.com www.coveredamerican.com;

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

    # Other locations for the main site...
}
EOF

# Enable the site
if [ -f /etc/nginx/sites-enabled/coveredamerican.com ]; then
  rm /etc/nginx/sites-enabled/coveredamerican.com
fi
ln -s /etc/nginx/sites-available/coveredamerican.com /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
print_success "Nginx configured"

# Ask about SSL
echo ""
read -p "Do you want to set up SSL with Let's Encrypt? (y/n): " setup_ssl
if [[ $setup_ssl == [yY] || $setup_ssl == [yY][eE][sS] ]]; then
  print_message "Installing Certbot..."
  apt install -y certbot python3-certbot-nginx
  print_success "Certbot installed"
  
  print_message "Obtaining SSL certificate..."
  certbot --nginx -d coveredamerican.com -d www.coveredamerican.com
  print_success "SSL certificate obtained"
else
  print_warning "Skipping SSL setup"
fi

# Start the application
print_message "Starting the application..."
cd $INSTALL_DIR
pm2 start ecosystem.config.js
print_success "Application started"

# Set up PM2 to start on boot
print_message "Setting up PM2 to start on boot..."
pm2 save
env PATH=$PATH:/usr/bin pm2 startup systemd -u $current_user --hp /home/$current_user
print_success "PM2 startup configured"

# Configure firewall
print_message "Configuring firewall..."
if command -v ufw &> /dev/null; then
  ufw allow 22
  ufw allow 80
  ufw allow 443
  ufw --force enable
  print_success "Firewall configured"
else
  print_warning "UFW not found, skipping firewall configuration"
fi

# Installation complete
echo ""
print_success "Call Info Remover has been successfully installed!"
echo ""
echo "The application is now running at: http://coveredamerican.com/audio"
if [[ $setup_ssl == [yY] || $setup_ssl == [yY][eE][sS] ]]; then
  echo "or securely at: https://coveredamerican.com/audio"
fi
echo ""
echo "You can check the application status with: pm2 status"
echo "View logs with: pm2 logs call-info-remover"
echo ""
echo "For more information, refer to the deployment guide: deployment-guide.md"
