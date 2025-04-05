#!/bin/bash

# Script to deploy and test the minimal test file on the server
# Usage: ./deploy-test.sh username@server-ip /path/to/server/directory

# Check if arguments are provided
if [ $# -lt 2 ]; then
  echo "Usage: ./deploy-test.sh username@server-ip /path/to/server/directory"
  echo "Example: ./deploy-test.sh root@104.245.241.185 /var/www/coveredamerican.com/audio"
  exit 1
fi

SERVER=$1
DIRECTORY=$2

echo "=== DEPLOYING TEST FILE TO SERVER ==="
echo "Server: $SERVER"
echo "Directory: $DIRECTORY"

# Upload the test file
echo "Uploading test-server-syntax.js..."
scp test-server-syntax.js $SERVER:$DIRECTORY/

# Create a validation script on the server
echo "Creating validation script on server..."
ssh $SERVER "cat > $DIRECTORY/validate-remote.js << 'EOL'
// Script to validate syntax on the server
const fs = require('fs');
const path = require('path');

console.log('=== SERVER ENVIRONMENT CHECK ===');
console.log(\`Node.js version: \${process.version}\`);
console.log(\`Working directory: \${process.cwd()}\`);

// Check test file
const testFile = path.join(__dirname, 'test-server-syntax.js');
console.log(\`Checking test file: \${testFile}\`);

try {
  // Read the file
  const testContent = fs.readFileSync(testFile, 'utf8');
  console.log(\`Test file size: \${testContent.length} bytes\`);
  
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
  console.log(\`\nChecking server.js: \${serverFile}\`);
  
  const serverContent = fs.readFileSync(serverFile, 'utf8');
  console.log(\`Server.js file size: \${serverContent.length} bytes\`);
  
  // Show content around line 748
  const lines = serverContent.split('\n');
  console.log('\n=== CONTENT AROUND LINE 748 IN SERVER.JS ===');
  const startLine = Math.max(1, 748 - 5);
  const endLine = Math.min(lines.length, 748 + 5);
  
  for (let i = startLine; i <= endLine; i++) {
    const lineContent = lines[i - 1] || '';
    const marker = i === 748 ? '>>> ' : '    ';
    console.log(\`\${marker}\${i}: \${lineContent}\`);
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
      console.error(\`Error at line \${syntaxError.lineNumber}\`);
    } else if (syntaxError.message.includes('line')) {
      // Try to extract line number from error message
      const match = syntaxError.message.match(/line\s+(\d+)/i);
      if (match && match[1]) {
        const errorLine = parseInt(match[1]);
        console.error(\`Error appears to be at line \${errorLine}\`);
        
        // Show the problematic line and surrounding context
        const contextStart = Math.max(1, errorLine - 2);
        const contextEnd = Math.min(lines.length, errorLine + 2);
        
        console.error('\n=== ERROR CONTEXT ===');
        for (let i = contextStart; i <= contextEnd; i++) {
          const lineContent = lines[i - 1] || '';
          const marker = i === errorLine ? '>>> ' : '    ';
          console.error(\`\${marker}\${i}: \${lineContent}\`);
        }
      }
    }
  }
  
} catch (error) {
  console.error('Error reading or processing files:');
  console.error(error.message);
}
EOL"

# Run the validation script on the server
echo "Running validation script on server..."
ssh $SERVER "cd $DIRECTORY && node validate-remote.js"

# Try running the test file
echo "Attempting to run the test file on server..."
ssh $SERVER "cd $DIRECTORY && node test-server-syntax.js" &
PID=$!

# Wait for a few seconds to see if it starts
sleep 3
kill $PID 2>/dev/null

echo "=== DEPLOYMENT AND TESTING COMPLETE ==="
echo "Check the output above for any syntax errors or issues."
echo "If the test file ran without errors, your server environment should be able to run the fixed server.js file."