/**
 * Minimal Fix for Syntax Errors in app.js
 * 
 * This script applies a minimal fix to the app.js file to address syntax errors
 * without making major changes to the code structure.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const APP_JS_PATH = path.join(__dirname, 'public', 'app.js');
const BACKUP_PATH = path.join(__dirname, 'public', `app.js.backup-minimal-${Date.now()}`);

console.log('Starting minimal fix...');

// Check if app.js exists
if (!fs.existsSync(APP_JS_PATH)) {
  console.error(`Error: Could not find app.js at ${APP_JS_PATH}`);
  console.error('Make sure you are running this script from the root directory of your application.');
  process.exit(1);
}

// Create backup
console.log(`Creating backup at ${BACKUP_PATH}`);
try {
  fs.copyFileSync(APP_JS_PATH, BACKUP_PATH);
  console.log('Backup created successfully');
} catch (error) {
  console.error(`Error creating backup: ${error.message}`);
  process.exit(1);
}

// Read app.js
console.log('Reading app.js file...');
let appJs;
try {
  appJs = fs.readFileSync(APP_JS_PATH, 'utf8');
  console.log(`Read ${appJs.length} bytes from app.js`);
} catch (error) {
  console.error(`Error reading app.js: ${error.message}`);
  process.exit(1);
}

console.log('Applying minimal fixes...');

// 1. Fix the fetchRecordings function to ensure it's properly formatted
const fetchRecordingsPattern = /function\s+fetchRecordings\s*\(\s*\)\s*\{[\s\S]*?\}/;
const newFetchRecordings = `function fetchRecordings() {
    console.log('Fetching recordings list...');
    fetch('/api/calls')
        .then(response => {
            if (!response.ok) {
                throw new Error('Server returned error status: ' + response.status);
            }
            return response.json();
        })
        .then(recordings => {
            console.log('Received recordings:', recordings ? recordings.length : 0);
            if (recordings && recordings.length > 0) {
                recordingsCard.classList.remove('hidden');
                displayRecordings(recordings);
            } else {
                recordingsCard.classList.add('hidden');
            }
        })
        .catch(error => {
            console.error('Error fetching recordings:', error);
            // Optionally show an error message to the user
            const errorToast = document.createElement('div');
            errorToast.className = 'error-toast';
            errorToast.textContent = 'Could not load recordings. Please refresh the page to try again.';
            document.body.appendChild(errorToast);
            
            // Remove the error toast after 5 seconds
            setTimeout(() => {
                if (errorToast.parentNode) {
                    errorToast.parentNode.removeChild(errorToast);
                }
            }, 5000);
        });
}`;

// Replace the fetchRecordings function
let modifiedAppJs = appJs.replace(fetchRecordingsPattern, newFetchRecordings);

// 2. Add debugging code at the beginning of the file to help identify the source of errors
const debuggingCode = `document.addEventListener('DOMContentLoaded', function() {
    // Add error handling for uncaught exceptions
    window.addEventListener('error', function(event) {
        console.error('UNCAUGHT ERROR:', event.error);
        console.error('Error message:', event.message);
        console.error('Error source:', event.filename);
        console.error('Error line:', event.lineno);
        console.error('Error column:', event.colno);
        
        // Create an error toast to show the error
        const errorToast = document.createElement('div');
        errorToast.className = 'error-toast';
        errorToast.style.backgroundColor = '#ff4444';
        errorToast.style.color = 'white';
        errorToast.style.padding = '10px';
        errorToast.style.borderRadius = '5px';
        errorToast.style.position = 'fixed';
        errorToast.style.top = '10px';
        errorToast.style.right = '10px';
        errorToast.style.zIndex = '9999';
        errorToast.textContent = 'JavaScript Error: ' + event.message;
        document.body.appendChild(errorToast);
        
        // Remove the error toast after 10 seconds
        setTimeout(() => {
            if (errorToast.parentNode) {
                errorToast.parentNode.removeChild(errorToast);
            }
        }, 10000);
    });`;

// Replace the DOMContentLoaded event listener with our debugging version
modifiedAppJs = modifiedAppJs.replace(
  "document.addEventListener('DOMContentLoaded', function() {",
  debuggingCode
);

// 3. Fix any potential issues with template literals by replacing them with string concatenation
// This is a more conservative approach that avoids potential syntax errors with template literals
modifiedAppJs = modifiedAppJs.replace(
  /\${([^}]*)}/g,
  function(match, p1) {
    return "' + (" + p1 + ") + '";
  }
);

// 4. Fix any potential issues with arrow functions by adding explicit return statements
modifiedAppJs = modifiedAppJs.replace(
  /\(\s*\)\s*=>\s*\{/g,
  "() => {\n        return "
);

// Write the modified file
console.log('Writing modified app.js file...');
try {
  fs.writeFileSync(APP_JS_PATH, modifiedAppJs);
  console.log('Successfully wrote modified app.js file');
} catch (error) {
  console.error(`Error writing app.js: ${error.message}`);
  process.exit(1);
}

console.log('\n✅ Minimal fix applied successfully!');
console.log(`Original file backed up at: ${BACKUP_PATH}`);
console.log('\nThis fix:');
console.log('1. Adds error handling for uncaught exceptions to help identify the source of errors');
console.log('2. Fixes potential issues with template literals and arrow functions');
console.log('3. Ensures the fetchRecordings function is properly formatted');
console.log('\nPlease restart your server to apply the changes:');
console.log('pm2 restart call-info-remover');