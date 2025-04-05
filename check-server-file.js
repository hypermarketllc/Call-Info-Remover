// Comprehensive script to check server.js file and environment
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2] || './server.js';

console.log('=== SERVER.JS FILE CHECK ===');
console.log(`Node.js version: ${process.version}`);
console.log(`Working directory: ${process.cwd()}`);
console.log(`Checking file: ${filePath}`);

try {
  // Read the file
  const fileContent = fs.readFileSync(filePath, 'utf8');
  console.log(`File size: ${fileContent.length} bytes`);
  
  // Check syntax
  console.log('\nValidating syntax...');
  try {
    new Function(fileContent);
    console.log('✅ Syntax is valid! No errors found.');
  } catch (syntaxError) {
    console.error('❌ Syntax error detected:');
    console.error(syntaxError.message);
  }
  
  // Show content around line 748 (the problematic line from the error)
  const lines = fileContent.split('\n');
  console.log('\n=== CONTENT AROUND LINE 748 ===');
  const startLine = Math.max(1, 748 - 5);
  const endLine = Math.min(lines.length, 748 + 5);
  
  for (let i = startLine; i <= endLine; i++) {
    const lineContent = lines[i - 1] || '';
    const marker = i === 748 ? '>>> ' : '    ';
    console.log(`${marker}${i}: ${lineContent}`);
  }
  
  // Check for any other closing brackets that might be problematic
  console.log('\n=== CHECKING FOR PROBLEMATIC PATTERNS ===');
  const problematicPattern = /^\s*\}\);?\s*$/;
  let foundProblematic = false;
  
  for (let i = 740; i < 760 && i < lines.length; i++) {
    const line = lines[i];
    if (problematicPattern.test(line)) {
      console.log(`Potential problematic pattern at line ${i + 1}: "${line}"`);
      foundProblematic = true;
    }
  }
  
  if (!foundProblematic) {
    console.log('No obvious problematic patterns found in this region.');
  }
  
  // Suggestion for deployment
  console.log('\n=== DEPLOYMENT SUGGESTIONS ===');
  console.log('1. Make sure the file is properly transferred to the server');
  console.log('2. Check if the server is using the correct file path');
  console.log('3. Verify the Node.js version on the server matches your local version');
  console.log('4. Try creating a minimal test file on the server to isolate the issue');
  
} catch (error) {
  console.error('Error reading or processing the file:');
  console.error(error.message);
}