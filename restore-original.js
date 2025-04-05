/**
 * Restore Original app.js
 * 
 * This script restores the original app.js file from the backup.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const APP_JS_PATH = path.join(__dirname, 'public', 'app.js');
const BACKUP_DIR = path.join(__dirname, 'public');

console.log('Looking for backup files...');

// Find all backup files
const files = fs.readdirSync(BACKUP_DIR);
const backupFiles = files.filter(file => file.startsWith('app.js.backup-'));

if (backupFiles.length === 0) {
  console.error('No backup files found in the public directory.');
  process.exit(1);
}

// Sort backup files by timestamp (newest first)
backupFiles.sort((a, b) => {
  const timestampA = a.split('-')[1];
  const timestampB = b.split('-')[1];
  return timestampB - timestampA;
});

console.log('Found the following backup files:');
backupFiles.forEach((file, index) => {
  console.log(`${index + 1}. ${file}`);
});

// Use the newest backup file
const newestBackup = path.join(BACKUP_DIR, backupFiles[0]);
console.log(`\nRestoring from newest backup: ${newestBackup}`);

try {
  // Read the backup file
  const backupContent = fs.readFileSync(newestBackup, 'utf8');
  console.log(`Read ${backupContent.length} bytes from backup file`);
  
  // Create a backup of the current app.js file
  const currentBackupPath = path.join(BACKUP_DIR, `app.js.before-restore-${Date.now()}`);
  fs.writeFileSync(currentBackupPath, fs.readFileSync(APP_JS_PATH, 'utf8'));
  console.log(`Created backup of current app.js at ${currentBackupPath}`);
  
  // Restore the original app.js file
  fs.writeFileSync(APP_JS_PATH, backupContent);
  console.log('Successfully restored original app.js file');
  
  console.log('\n✅ Restoration complete!');
  console.log('\nPlease restart your server to apply the changes:');
  console.log('pm2 restart call-info-remover');
} catch (error) {
  console.error(`Error restoring original app.js: ${error.message}`);
  process.exit(1);
}