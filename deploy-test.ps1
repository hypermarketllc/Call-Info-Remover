# PowerShell script to deploy and test the minimal test file on the server
# Usage: .\deploy-test.ps1 -Server "username@server-ip" -Directory "/path/to/server/directory"

param (
    [Parameter(Mandatory=$true)]
    [string]$Server,
    
    [Parameter(Mandatory=$true)]
    [string]$Directory
)

Write-Host "=== DEPLOYING TEST FILE TO SERVER ===" -ForegroundColor Cyan
Write-Host "Server: $Server"
Write-Host "Directory: $Directory"

# Upload the test file
Write-Host "Uploading test-server-syntax.js..." -ForegroundColor Yellow
scp test-server-syntax.js ${Server}:${Directory}/

# Create a validation script on the server
Write-Host "Creating validation script on server..." -ForegroundColor Yellow
$validationScript = @'
// Script to validate syntax on the server
const fs = require('fs');
const path = require('path');

console.log('=== SERVER ENVIRONMENT CHECK ===');
console.log(`Node.js version: ${process.version}`);
console.log(`Working directory: ${process.cwd()}`);

// Check test file
const testFile = path.join(__dirname, 'test-server-syntax.js');
console.log(`Checking test file: ${testFile}`);

try {
  // Read the file
  const testContent = fs.readFileSync(testFile, 'utf8');
  console.log(`Test file size: ${testContent.length} bytes`);
  
  // Validate syntax
  console.log('Validating test file syntax...');
  try {
    new Function(testContent);
    console.log('✅ Test file syntax is valid!');
  } catch (syntaxError) {
    console.error('❌ Test file syntax error:');
    console.error(syntaxError.message);
  }
  
  // Check server.js
  const serverFile = path.join(__dirname, 'server.js');
  console.log(`\nChecking server.js: ${serverFile}`);
  
  const serverContent = fs.readFileSync(serverFile, 'utf8');
  console.log(`Server.js file size: ${serverContent.length} bytes`);
  
  // Show content around line 748
  const lines = serverContent.split('\n');
  console.log('\n=== CONTENT AROUND LINE 748 IN SERVER.JS ===');
  const startLine = Math.max(1, 748 - 5);
  const endLine = Math.min(lines.length, 748 + 5);
  
  for (let i = startLine; i <= endLine; i++) {
    const lineContent = lines[i - 1] || '';
    const marker = i === 748 ? '>>> ' : '    ';
    console.log(`${marker}${i}: ${lineContent}`);
  }
  
  // Validate server.js syntax
  console.log('\nValidating server.js syntax...');
  try {
    new Function(serverContent);
    console.log('✅ Server.js syntax is valid!');
  } catch (syntaxError) {
    console.error('❌ Server.js syntax error:');
    console.error(syntaxError.message);
    
    // If we have line information, show it
    if (syntaxError.lineNumber) {
      console.error(`Error at line ${syntaxError.lineNumber}`);
    } else if (syntaxError.message.includes('line')) {
      // Try to extract line number from error message
      const match = syntaxError.message.match(/line\s+(\d+)/i);
      if (match && match[1]) {
        const errorLine = parseInt(match[1]);
        console.error(`Error appears to be at line ${errorLine}`);
        
        // Show the problematic line and surrounding context
        const contextStart = Math.max(1, errorLine - 2);
        const contextEnd = Math.min(lines.length, errorLine + 2);
        
        console.error('\n=== ERROR CONTEXT ===');
        for (let i = contextStart; i <= contextEnd; i++) {
          const lineContent = lines[i - 1] || '';
          const marker = i === errorLine ? '>>> ' : '    ';
          console.error(`${marker}${i}: ${lineContent}`);
        }
      }
    }
  }
  
} catch (error) {
  console.error('Error reading or processing files:');
  console.error(error.message);
}
'@

# Escape the validation script for SSH
$escapedScript = $validationScript -replace '"', '\"'

# Create the validation script on the server
ssh $Server "echo `"$escapedScript`" > $Directory/validate-remote.js"

# Run the validation script on the server
Write-Host "Running validation script on server..." -ForegroundColor Yellow
ssh $Server "cd $Directory && node validate-remote.js"

# Try running the test file
Write-Host "Attempting to run the test file on server..." -ForegroundColor Yellow
$job = Start-Job -ScriptBlock {
    param($srv, $dir)
    ssh $srv "cd $dir && node test-server-syntax.js"
} -ArgumentList $Server, $Directory

# Wait for a few seconds to see if it starts
Start-Sleep -Seconds 3
Stop-Job $job

Write-Host "=== DEPLOYMENT AND TESTING COMPLETE ===" -ForegroundColor Green
Write-Host "Check the output above for any syntax errors or issues."
Write-Host "If the test file ran without errors, your server environment should be able to run the fixed server.js file."