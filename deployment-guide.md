# Call Info Remover - Deployment Guide

This guide provides detailed instructions for deploying the Call Info Remover application on a Linux server, specifically for the domain coveredamerican.com/audio.

## System Requirements

- Ubuntu 20.04 LTS or newer (or similar Linux distribution)
- Node.js 16.x or newer
- SoX audio processing tool with MP3 support
- FFmpeg for audio processing
- Nginx for reverse proxy
- 2GB RAM minimum (4GB recommended)
- 20GB disk space minimum

## Installation Steps

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

Verify installation:

```bash
node -v  # Should show v16.x.x or newer
npm -v   # Should show 8.x.x or newer
```

### 3. Install SoX and Audio Dependencies

SoX is the primary tool used for audio manipulation:

```bash
sudo apt install -y sox libsox-fmt-all ffmpeg
```

Verify installations:

```bash
sox --version
ffmpeg -version
```

### 4. Set Up Project Directory

```bash
sudo mkdir -p /var/www/coveredamerican.com/audio
sudo chown -R $USER:$USER /var/www/coveredamerican.com/audio
cd /var/www/coveredamerican.com/audio
```

### 5. Clone or Copy Application Files

If using Git:

```bash
git clone https://github.com/hypermarketllc/Call-Info-Remover .
```

Or copy files manually to the directory.

### 6. Install Application Dependencies

```bash
npm install --production
```

### 7. Create Configuration File

Create a `.env` file with your configuration:

```bash
nano .env
```

Add the following content (adjust values as needed):

```
NODE_ENV=production
PORT=8531
DEEPGRAM_API_KEY=your_api_key_here
```

### 8. Set Up Directory Permissions

```bash
# Create required directories if they don't exist
mkdir -p uploads processed transcripts temp logs

# Set correct permissions
chmod -R 755 /var/www/coveredamerican.com/audio
```

### 9. Install PM2 for Process Management

```bash
sudo npm install -g pm2
```

### 10. Create PM2 Configuration

Create a file named `ecosystem.config.js`:

```bash
nano ecosystem.config.js
```

Add the following content:

```javascript
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
```

### 11. Set Up Nginx as Reverse Proxy

Install Nginx:

```bash
sudo apt install -y nginx
```

Create a new Nginx configuration file:

```bash
sudo nano /etc/nginx/sites-available/coveredamerican.com
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name coveredamerican.com www.coveredamerican.com;

    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name coveredamerican.com www.coveredamerican.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/coveredamerican.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/coveredamerican.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_stapling on;
    ssl_stapling_verify on;

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

    # Other locations for the main site...
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/coveredamerican.com /etc/nginx/sites-enabled/
sudo nginx -t  # Test the configuration
sudo systemctl restart nginx
```

### 12. Set Up SSL with Let's Encrypt

Install Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Obtain SSL certificate:

```bash
sudo certbot --nginx -d coveredamerican.com -d www.coveredamerican.com
```

### 13. Start the Application

```bash
cd /var/www/coveredamerican.com/audio
pm2 start ecosystem.config.js
```

### 14. Set Up PM2 to Start on Boot

```bash
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER
```

## Maintenance and Operations

### Checking Application Status

```bash
pm2 status
pm2 logs call-info-remover
```

### Restarting the Application

```bash
pm2 restart call-info-remover
```

### Updating the Application

```bash
cd /var/www/coveredamerican.com/audio
git pull  # If using Git
npm install --production
pm2 restart call-info-remover
```

### Backup and Restore

#### Backup

```bash
# Create backup directory
mkdir -p /var/backups/call-info-remover

# Backup processed files, transcripts, and database
tar -czf /var/backups/call-info-remover/files_$(date +%Y%m%d).tar.gz uploads/ processed/ transcripts/
```

#### Restore

```bash
# Restore from backup
tar -xzf /var/backups/call-info-remover/files_YYYYMMDD.tar.gz -C /var/www/coveredamerican.com/audio/
```

## Cloudflare Integration

The application uses a two-step upload process to work around Cloudflare's timeout limitations:

1. **Step 1: Quick Upload**
   - The initial upload request completes quickly (under 100 seconds)
   - The server returns a job ID immediately after receiving the file
   - This prevents Cloudflare 524 timeout errors for large files

2. **Step 2: Background Processing**
   - Processing continues in the background after the response is sent
   - The frontend polls a status endpoint to track progress
   - Users see real-time updates on processing stages

### Cloudflare Settings

If you're using Cloudflare with this application:

- No special Cloudflare settings are required for the free plan
- The application is designed to work within Cloudflare's default timeout limits
- For even larger files, consider upgrading to Cloudflare Pro for adjustable timeouts

## Troubleshooting

### Common Issues

1. **Application won't start**
   - Check logs: `pm2 logs call-info-remover`
   - Verify Node.js version: `node -v`
   - Check for missing dependencies: `npm install`

2. **Audio processing fails**
   - Verify SoX installation: `sox --version`
   - Verify FFmpeg installation: `ffmpeg -version`
   - Check disk space: `df -h`

3. **Nginx proxy issues**
   - Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
   - Verify Nginx configuration: `sudo nginx -t`
   - Restart Nginx: `sudo systemctl restart nginx`

4. **Permission issues**
   - Check directory permissions: `ls -la /var/www/coveredamerican.com/audio/`
   - Fix permissions if needed: `sudo chown -R $USER:$USER /var/www/coveredamerican.com/audio/`

5. **Cloudflare timeout errors (524)**
   - If you still see 524 errors, check that the two-step upload process is working correctly
   - Verify the status endpoint is accessible: `curl http://localhost:8531/api/status/[job-id]`
   - Check server logs for any issues with the background processing

## Security Considerations

1. **API Key Protection**
   - Store the Deepgram API key in the `.env` file
   - Ensure the `.env` file has restricted permissions: `chmod 600 .env`

2. **File Upload Security**
   - The application already restricts uploads to audio files
   - Nginx is configured with a 100MB upload limit

3. **Regular Updates**
   - Keep the server updated: `sudo apt update && sudo apt upgrade -y`
   - Keep Node.js dependencies updated: `npm audit fix`

4. **Firewall Configuration**
   - Allow only necessary ports: 22 (SSH), 80 (HTTP), 443 (HTTPS)
   - Configure UFW:
     ```bash
     sudo ufw allow 22
     sudo ufw allow 80
     sudo ufw allow 443
     sudo ufw enable
     ```

## Monitoring

Consider setting up monitoring for the application:

1. **PM2 Monitoring**
   ```bash
   pm2 monit
   ```

2. **System Monitoring**
   ```bash
   sudo apt install -y htop
   htop
   ```

3. **Disk Usage Monitoring**
   ```bash
   sudo apt install -y ncdu
   ncdu /var/www/coveredamerican.com/audio
   ```

## Conclusion

Your Call Info Remover application should now be successfully deployed at coveredamerican.com/audio. The application is configured to run on port 8531 and is accessible through the Nginx reverse proxy.
