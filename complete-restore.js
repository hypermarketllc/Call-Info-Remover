/**
 * Complete Restore Script for Call Info Remover
 * 
 * This script:
 * 1. Restores the app.js file to its original state
 * 2. Applies a minimal fix to ensure basic functionality works
 * 
 * Usage: node complete-restore.js
 */

const fs = require('fs');
const path = require('path');

// Configuration
const APP_JS_PATH = path.join(__dirname, 'public', 'app.js');
const BACKUP_DIR = path.join(__dirname, 'public');

console.log('=== COMPLETE RESTORE SCRIPT ===');
console.log('This script will restore your app.js file to a working state.');

// Step 1: Find all backup files
console.log('\nStep 1: Looking for backup files...');
const files = fs.readdirSync(BACKUP_DIR);
const backupFiles = files.filter(file => file.startsWith('app.js.backup-'));

if (backupFiles.length === 0) {
  console.error('❌ No backup files found in the public directory.');
  console.error('Cannot proceed with restoration.');
  process.exit(1);
}

// Sort backup files by timestamp (oldest first)
backupFiles.sort((a, b) => {
  const timestampA = a.split('-')[1];
  const timestampB = b.split('-')[1];
  return timestampA - timestampB;
});

console.log('Found the following backup files:');
backupFiles.forEach((file, index) => {
  console.log(`${index + 1}. ${file}`);
});

// Use the oldest backup file (the one created before any fixes were applied)
const oldestBackup = path.join(BACKUP_DIR, backupFiles[0]);
console.log(`\nStep 2: Restoring from oldest backup: ${oldestBackup}`);

try {
  // Read the backup file
  const backupContent = fs.readFileSync(oldestBackup, 'utf8');
  console.log(`Read ${backupContent.length} bytes from backup file`);
  
  // Create a backup of the current app.js file
  const currentBackupPath = path.join(BACKUP_DIR, `app.js.before-complete-restore-${Date.now()}`);
  fs.writeFileSync(currentBackupPath, fs.readFileSync(APP_JS_PATH, 'utf8'));
  console.log(`Created backup of current app.js at ${currentBackupPath}`);
  
  // Restore the original app.js file
  fs.writeFileSync(APP_JS_PATH, backupContent);
  console.log('✅ Successfully restored original app.js file');
  
  console.log('\nStep 3: Applying minimal fix to ensure functionality...');
  
  // Read the restored app.js file
  let appJs = fs.readFileSync(APP_JS_PATH, 'utf8');
  
  // Apply minimal fixes to ensure functionality
  
  // 1. Fix any potential issues with template literals
  console.log('Fixing template literals...');
  const fixedAppJs = appJs.replace(
    /\${([^}]*)}/g,
    function(match, p1) {
      // Keep simple variable references as template literals
      if (/^[a-zA-Z0-9_]+$/.test(p1.trim())) {
        return match;
      }
      // Convert complex expressions to string concatenation
      return "' + (" + p1 + ") + '";
    }
  );
  
  // Write the fixed app.js file
  fs.writeFileSync(APP_JS_PATH, fixedAppJs);
  console.log('✅ Applied minimal fixes to app.js');
  
  console.log('\n=== RESTORATION COMPLETE ===');
  console.log('Your app.js file has been restored to its original state with minimal fixes.');
  console.log('\nPlease restart your server to apply the changes:');
  console.log('pm2 restart call-info-remover');
  console.log('\nIf you still experience issues, please try clearing your browser cache and cookies.');
} catch (error) {
  console.error(`❌ Error during restoration: ${error.message}`);
  process.exit(1);
}