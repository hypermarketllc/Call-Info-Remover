/**
 * Complete Installation Script for Call Info Remover Fixes
 * 
 * This script:
 * 1. Fixes the real-time updates issue (processed files show immediately)
 * 2. Creates backups of all modified files
 * 3. Restarts the server (if PM2 is available)
 * 
 * Usage: node install-all-fixes.js
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

console.log('=== Call Info Remover - Complete Fix Installation ===');

// Create timestamp for backups
const timestamp = Date.now();

// Function to create a backup of a file
function createBackup(filePath) {
  const backupPath = `${filePath}.backup-${timestamp}`;
  try {
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath);
      console.log(`✅ Created backup: ${backupPath}`);
      return true;
    } else {
      console.error(`❌ File not found: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error creating backup of ${filePath}:`, error.message);
    return false;
  }
}

// Function to apply the real-time updates fix
function applyRealTimeUpdatesFix() {
  console.log('\n=== Applying Real-time Updates Fix ===');
  
  // Path to the app.js file
  const appJsPath = path.join(__dirname, 'public', 'app.js');
  
  // Create a backup of the original file
  if (!createBackup(appJsPath)) {
    return false;
  }
  
  try {
    console.log('Reading app.js file...');
    const appJs = fs.readFileSync(appJsPath, 'utf8');
    
    console.log('Applying fixes...');
    
    // Fix 1: Update pollJobStatus function to refresh recordings list after each file is processed
    let modifiedAppJs = appJs.replace(
      /if\s*\(data\.status\s*===\s*'completed'\)\s*\{\s*\/\/\s*Processing\s*complete\s*clearInterval\s*\(\s*pollInterval\s*\)\s*;\s*successCount\+\+\s*;\s*console\.log\s*\(\s*`File\s*\$\{\s*fileIndex\s*\+\s*1\s*\}\s*processed\s*successfully:\s*`,\s*data\.result\s*\)\s*;\s*\/\/\s*Process\s*next\s*file\s*currentFileIndex\+\+\s*;\s*processNextFile\s*\(\s*\)\s*;\s*\}/g,
      `if (data.status === 'completed') {
                                // Processing complete
                                clearInterval(pollInterval);
                                successCount++;
                                console.log(\`File \${fileIndex + 1} processed successfully:\`, data.result);
                                
                                // Update the recordings list immediately when a file is processed
                                fetchRecordings();
                                
                                // Process next file
                                currentFileIndex++;
                                processNextFile();
                            }`
    );
    
    // Fix 2: Remove redundant fetchRecordings call at the end of batch processing
    modifiedAppJs = modifiedAppJs.replace(
      /setTimeout\s*\(\s*\(\s*\)\s*=>\s*\{\s*\/\/\s*Reset\s*form\s*clearBtn\.click\s*\(\s*\)\s*;\s*uploadProgress\.classList\.add\s*\(\s*'hidden'\s*\)\s*;\s*\/\/\s*Refresh\s*recordings\s*list\s*fetchRecordings\s*\(\s*\)\s*;/g,
      `setTimeout(() => {
                    // Reset form
                    clearBtn.click();
                    uploadProgress.classList.add('hidden');
                    
                    // No need to refresh recordings list here as it's already updated for each file
                    // that was successfully processed`
    );
    
    // Fix 3: Enhance fetchRecordings function with better logging
    modifiedAppJs = modifiedAppJs.replace(
      /function\s*fetchRecordings\s*\(\s*\)\s*\{\s*fetch\s*\(\s*'\/api\/calls'\s*\)/g,
      `function fetchRecordings() {
        console.log('Fetching recordings list...');
        fetch('/api/calls')`
    );
    
    modifiedAppJs = modifiedAppJs.replace(
      /\.then\s*\(\s*recordings\s*=>\s*\{\s*if\s*\(\s*recordings\s*&&\s*recordings\.length\s*>\s*0\s*\)\s*\{/g,
      `.then(recordings => {
                console.log(\`Received \${recordings ? recordings.length : 0} recordings\`);
                if (recordings && recordings.length > 0) {`
    );
    
    // Write the modified file
    console.log('Writing modified app.js file...');
    fs.writeFileSync(appJsPath, modifiedAppJs);
    
    console.log('✅ Real-time updates fix applied successfully!');
    return true;
  } catch (error) {
    console.error('❌ Error applying real-time updates fix:', error.message);
    return false;
  }
}

// Function to restart the server using PM2
function restartServer() {
  console.log('\n=== Restarting Server ===');
  
  exec('pm2 restart call-info-remover', (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Error restarting server:', error.message);
      console.error('Please restart your server manually.');
      return;
    }
    
    console.log('✅ Server restarted successfully!');
    console.log('\nChecking server logs...');
    
    // Check server logs
    exec('pm2 logs call-info-remover --lines 10 --nostream', (logError, logStdout, logStderr) => {
      if (logError) {
        console.error('❌ Error checking server logs:', logError.message);
        return;
      }
      
      console.log('\nServer logs:');
      console.log(logStdout);
      
      console.log('\n=== Installation Complete ===');
      console.log('Your Call Info Remover application has been updated with the following fixes:');
      console.log('1. Real-time updates for processed recordings');
      console.log('\nPlease test the application by uploading multiple files and verify that');
      console.log('each file appears in the recordings list as soon as it is processed.');
    });
  });
}

// Main execution
console.log('Starting installation...');

// Apply real-time updates fix
const realTimeUpdatesSuccess = applyRealTimeUpdatesFix();

if (realTimeUpdatesSuccess) {
  // Try to restart the server
  restartServer();
} else {
  console.error('\n❌ Installation failed. Please check the errors above and try again.');
}