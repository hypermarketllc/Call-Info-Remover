# Server Deployment Guide for Real-time Updates Fix

This guide provides the essential commands to deploy the real-time updates fix to your server.

## Quick Reference Commands

```bash
# 1. Transfer the script to your server
scp simple-fix.js root@104-245-241-185:/var/www/coveredamerican.com/audio/

# 2. SSH into your server
ssh root@104-245-241-185

# 3. Navigate to your application directory
cd /var/www/coveredamerican.com/audio

# 4. Create a backup of the original app.js file
cp public/app.js public/app.js.backup-$(date +%s)

# 5. Run the fix script
node simple-fix.js

# 6. Restart your server
pm2 restart call-info-remover

# 7. Check logs to verify successful restart
pm2 logs call-info-remover --lines 20
```

## What This Fix Does

This fix modifies the frontend code to update the recordings list as soon as each file is processed, without waiting for all files in a batch to be processed. The changes are:

1. Added code to update the recordings list immediately when each file is processed
2. Removed redundant update at the end of batch processing
3. Added better logging to help diagnose any issues

## Verifying the Fix

After deploying, upload multiple files and verify that each file appears in the processed recordings list as soon as it's processed, without waiting for all files to complete.

## Reverting if Needed

If you need to revert the changes:

```bash
# Find your backup file
ls -la public/app.js.backup-*

# Restore the backup
cp public/app.js.backup-[timestamp] public/app.js

# Restart the server
pm2 restart call-info-remover