// Simple script to validate the syntax of a JavaScript file
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2] || './server.js';

try {
  // Read the file
  console.log(`Reading file: ${filePath}`);
  const fileContent = fs.readFileSync(filePath, 'utf8');
  
  // Try to parse the file (this will throw an error if there's a syntax error)
  console.log('Validating syntax...');
  new Function(fileContent);
  
  console.log('✅ Syntax is valid! No errors found.');
} catch (error) {
  console.error('❌ Syntax error detected:');
  console.error(error.message);
  
  // If we have a line number, show the problematic line
  if (error.lineNumber) {
    const lines = fileContent.split('\n');
    const line = lines[error.lineNumber - 1];
    console.error(`Line ${error.lineNumber}: ${line}`);
  }
  
  process.exit(1);
}