#!/bin/bash

# Call Info Remover - Health Check Script
# This script checks the health of the Call Info Remover application

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
APP_PORT="8531"
DOMAIN="coveredamerican.com"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -d|--dir)
      APP_DIR="$2"
      shift
      shift
      ;;
    -p|--port)
      APP_PORT="$2"
      shift
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  -d, --dir DIR    Specify application directory (default: $APP_DIR)"
      echo "  -p, --port PORT  Specify application port (default: $APP_PORT)"
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

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
  print_error "PM2 is not installed. Please install it first:"
  print_error "npm install -g pm2"
  exit 1
fi

# Check if Nginx is installed
if ! command -v nginx &> /dev/null; then
  print_warning "Nginx is not installed. Skipping Nginx checks."
  NGINX_INSTALLED=false
else
  NGINX_INSTALLED=true
fi

# Print header
echo "========================================================"
echo "Call Info Remover - Health Check"
echo "========================================================"
echo "Time: $(date)"
echo "Application Directory: $APP_DIR"
echo "Application Port: $APP_PORT"
echo "Domain: $DOMAIN"
echo "========================================================"
echo ""

# Check PM2 status
print_message "Checking PM2 status..."
PM2_STATUS=$(pm2 list | grep call-info-remover)
if [ -z "$PM2_STATUS" ]; then
  print_error "Application is not running with PM2"
  PM2_RUNNING=false
else
  PM2_RUNNING=true
  if echo "$PM2_STATUS" | grep -q "online"; then
    print_success "Application is running with PM2 (online)"
    # Extract memory usage and uptime
    MEM_USAGE=$(echo "$PM2_STATUS" | awk '{print $8}')
    UPTIME=$(echo "$PM2_STATUS" | awk '{print $10}')
    CPU_USAGE=$(echo "$PM2_STATUS" | awk '{print $7}')
    RESTARTS=$(echo "$PM2_STATUS" | awk '{print $9}')
    echo "Memory Usage: $MEM_USAGE"
    echo "CPU Usage: $CPU_USAGE"
    echo "Uptime: $UPTIME"
    echo "Restarts: $RESTARTS"
  else
    print_error "Application is not online in PM2"
    echo "$PM2_STATUS"
  fi
fi

# Check if the application is responding
print_message "Checking if application is responding..."
if command -v curl &> /dev/null; then
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$APP_PORT/ 2>/dev/null)
  if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "302" ]; then
    print_success "Application is responding (HTTP $RESPONSE)"
  else
    print_error "Application is not responding properly (HTTP $RESPONSE)"
  fi
else
  print_warning "curl is not installed. Skipping application response check."
fi

# Check Nginx status
if [ "$NGINX_INSTALLED" = true ]; then
  print_message "Checking Nginx status..."
  if systemctl is-active --quiet nginx; then
    print_success "Nginx is running"
    
    # Check Nginx configuration
    print_message "Checking Nginx configuration..."
    NGINX_CONFIG_TEST=$(nginx -t 2>&1)
    if echo "$NGINX_CONFIG_TEST" | grep -q "successful"; then
      print_success "Nginx configuration is valid"
    else
      print_error "Nginx configuration is invalid"
      echo "$NGINX_CONFIG_TEST"
    fi
    
    # Check if the site is enabled
    if [ -f "/etc/nginx/sites-enabled/$DOMAIN" ]; then
      print_success "Site is enabled in Nginx"
    else
      print_error "Site is not enabled in Nginx"
    fi
    
    # Check SSL certificate
    if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
      print_success "SSL certificate exists"
      
      # Check SSL certificate expiration
      if command -v openssl &> /dev/null; then
        CERT_FILE="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
        if [ -f "$CERT_FILE" ]; then
          CERT_EXPIRY=$(openssl x509 -enddate -noout -in "$CERT_FILE" | cut -d= -f2)
          CERT_EXPIRY_EPOCH=$(date -d "$CERT_EXPIRY" +%s)
          CURRENT_EPOCH=$(date +%s)
          DAYS_LEFT=$(( ($CERT_EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))
          
          if [ $DAYS_LEFT -lt 0 ]; then
            print_error "SSL certificate has expired"
          elif [ $DAYS_LEFT -lt 7 ]; then
            print_warning "SSL certificate will expire in $DAYS_LEFT days"
          else
            print_success "SSL certificate is valid for $DAYS_LEFT more days"
          fi
        else
          print_error "SSL certificate file not found"
        fi
      else
        print_warning "openssl is not installed. Skipping SSL certificate expiration check."
      fi
    else
      print_warning "SSL certificate not found"
    fi
  else
    print_error "Nginx is not running"
  fi
fi

# Check disk space
print_message "Checking disk space..."
if command -v df &> /dev/null; then
  DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
  DISK_AVAILABLE=$(df -h / | awk 'NR==2 {print $4}')
  
  if [ "$DISK_USAGE" -gt 90 ]; then
    print_error "Disk usage is critical: ${DISK_USAGE}% (${DISK_AVAILABLE} available)"
  elif [ "$DISK_USAGE" -gt 80 ]; then
    print_warning "Disk usage is high: ${DISK_USAGE}% (${DISK_AVAILABLE} available)"
  else
    print_success "Disk usage is normal: ${DISK_USAGE}% (${DISK_AVAILABLE} available)"
  fi
else
  print_warning "df is not installed. Skipping disk space check."
fi

# Check memory usage
print_message "Checking memory usage..."
if command -v free &> /dev/null; then
  MEM_TOTAL=$(free -m | awk 'NR==2 {print $2}')
  MEM_USED=$(free -m | awk 'NR==2 {print $3}')
  MEM_USAGE=$((MEM_USED * 100 / MEM_TOTAL))
  
  if [ "$MEM_USAGE" -gt 90 ]; then
    print_error "Memory usage is critical: ${MEM_USAGE}% (${MEM_USED}MB / ${MEM_TOTAL}MB)"
  elif [ "$MEM_USAGE" -gt 80 ]; then
    print_warning "Memory usage is high: ${MEM_USAGE}% (${MEM_USED}MB / ${MEM_TOTAL}MB)"
  else
    print_success "Memory usage is normal: ${MEM_USAGE}% (${MEM_USED}MB / ${MEM_TOTAL}MB)"
  fi
else
  print_warning "free is not installed. Skipping memory usage check."
fi

# Check application logs for errors
print_message "Checking application logs for errors..."
if [ -d "$APP_DIR/logs" ]; then
  ERROR_COUNT=$(grep -i "error" "$APP_DIR/logs/err.log" 2>/dev/null | wc -l)
  if [ "$ERROR_COUNT" -gt 0 ]; then
    print_warning "Found $ERROR_COUNT errors in the application logs"
    echo "Recent errors:"
    grep -i "error" "$APP_DIR/logs/err.log" 2>/dev/null | tail -n 5
  else
    print_success "No errors found in the application logs"
  fi
else
  print_warning "Logs directory not found. Skipping log check."
fi

# Check data directories
print_message "Checking data directories..."
for dir in "uploads" "processed" "transcripts"; do
  if [ -d "$APP_DIR/$dir" ]; then
    FILE_COUNT=$(find "$APP_DIR/$dir" -type f | wc -l)
    DIR_SIZE=$(du -sh "$APP_DIR/$dir" 2>/dev/null | cut -f1)
    print_success "$dir directory exists ($FILE_COUNT files, $DIR_SIZE)"
  else
    print_error "$dir directory not found"
  fi
done

# Print summary
echo ""
echo "========================================================"
echo "Health Check Summary"
echo "========================================================"

if [ "$PM2_RUNNING" = true ] && [ "$NGINX_INSTALLED" = true ] && systemctl is-active --quiet nginx; then
  print_success "Application appears to be running normally"
else
  print_error "Application has issues that need to be addressed"
fi

echo ""
echo "For more detailed information, check the following:"
echo "1. Application logs: pm2 logs call-info-remover"
echo "2. Nginx logs: sudo tail -f /var/log/nginx/error.log"
echo "3. System logs: sudo journalctl -xe"
echo ""
