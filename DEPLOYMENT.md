# Call Info Remover - Deployment Instructions

This document provides instructions for deploying the Call Info Remover application on a Linux server.

## Quick Deployment

For a quick and automated deployment, use the provided `deploy.sh` script:

1. Upload the script to your server:
   ```bash
   scp deploy.sh user@your-server-ip:~/
   ```

2. SSH into your server:
   ```bash
   ssh user@your-server-ip
   ```

3. Make the script executable:
   ```bash
   chmod +x deploy.sh
   ```

4. Run the script with sudo:
   ```bash
   sudo ./deploy.sh
   ```

5. Follow the prompts to complete the installation.

## What the Deployment Script Does

The `deploy.sh` script automates the following steps:

1. Updates system packages
2. Installs required dependencies:
   - Node.js 16.x
   - SoX with MP3 support
   - FFmpeg
   - Nginx
   - PM2 process manager
3. Creates the necessary directory structure
4. Clones the application repository
5. Installs application dependencies
6. Creates configuration files
7. Configures Nginx as a reverse proxy
8. Sets up SSL with Let's Encrypt
9. Starts the application with PM2
10. Configures PM2 to start on boot
11. Sets up firewall rules
12. Performs final verification

## Manual Deployment

If you prefer to deploy manually or need to troubleshoot specific steps, follow these instructions:

### 1. Prepare the Server

Update system packages:

```bash
sudo apt update
sudo apt upgrade -y
```

### 2. Install Node.js and npm

```bash
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Install SoX and FFmpeg

```bash
sudo apt install -y sox libsox-fmt-all ffmpeg
```

### 4. Install Nginx

```bash
sudo apt install -y nginx
```

### 5. Install PM2

```bash
sudo npm install -g pm2
```

### 6. Set Up Directory Structure

```bash
sudo mkdir -p /var/www/coveredamerican.com/audio
sudo mkdir -p /var/www/coveredamerican.com/audio/{uploads,processed,transcripts,temp,logs}
sudo chown -R $USER:$USER /var/www/coveredamerican.com/audio
chmod -R 755 /var/www/coveredamerican.com/audio
```

### 7. Clone the Repository

```bash
cd /var/www/coveredamerican.com/audio
git clone https://github.com/hypermarketllc/Call-Info-Remover.git .
```

### 8. Install Application Dependencies

```bash
npm install --production
```

### 9. Create .env File

```bash
cat > .env << EOF
NODE_ENV=production
PORT=8531
DEEPGRAM_API_KEY=your_api_key_here
EOF
chmod 600 .env
```

### 10. Create PM2 Configuration

```bash
cat > ecosystem.config.js << EOF
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
      PORT: 8531
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
EOF
```

### 11. Configure Nginx

Create a new Nginx configuration file:

```bash
sudo nano /etc/nginx/sites-available/coveredamerican.com
```

Add the following configuration:

```nginx
# HTTP server - redirects to HTTPS
server {
    listen 80;
    server_name coveredamerican.com www.coveredamerican.com;
    
    # Redirect all HTTP traffic to HTTPS
    return 301 https://$host$request_uri;
}

# HTTPS server
server {
    listen 443 ssl;
    server_name coveredamerican.com www.coveredamerican.com;
    
    # SSL configuration will be added by Certbot
    
    # Audio redaction application
    location /audio/ {
        proxy_pass http://localhost:8531/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Increase timeouts for large file uploads
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        # Increase max body size for large file uploads (100MB)
        client_max_body_size 100M;
    }
    
    # For root path, redirect to /audio
    location = / {
        return 301 https://$host/audio;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/coveredamerican.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 12. Set Up SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d coveredamerican.com -d www.coveredamerican.com
```

### 13. Start the Application

```bash
cd /var/www/coveredamerican.com/audio
pm2 start ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER
```

### 14. Configure Firewall

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Troubleshooting

### Application Won't Start

Check the application logs:

```bash
pm2 logs call-info-remover
```

### Nginx Configuration Issues

Check the Nginx error logs:

```bash
sudo tail -f /var/log/nginx/error.log
```

Verify the Nginx configuration:

```bash
sudo nginx -t
```

### SSL Certificate Issues

If Let's Encrypt fails to obtain a certificate, try running Certbot manually:

```bash
sudo certbot --nginx -d coveredamerican.com -d www.coveredamerican.com
```

### Permission Issues

Check directory permissions:

```bash
ls -la /var/www/coveredamerican.com/audio/
```

Fix permissions if needed:

```bash
sudo chown -R $USER:$USER /var/www/coveredamerican.com/audio/
chmod -R 755 /var/www/coveredamerican.com/audio/
```

## Updating the Application

To update the application to a newer version:

```bash
cd /var/www/coveredamerican.com/audio
git pull
npm install --production
pm2 restart call-info-remover
