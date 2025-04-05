# Server.js Syntax Error Diagnostic Tools

This package contains several tools to help diagnose and fix the syntax error in your server.js file.

## The Issue

The server is reporting a syntax error at line 748 of server.js:

```
SyntaxError: Unexpected token ')'
```

We've fixed the local copy of the file by removing an incorrectly placed closing bracket, but you're still seeing the error on the server.

## Diagnostic Tools

### 1. Syntax Validation

The `validate-syntax.js` script checks if your local server.js file has valid syntax:

```bash
node validate-syntax.js server.js
```

### 2. Comprehensive File Check

The `check-server-file.js` script provides more detailed information about your server.js file:

```bash
node check-server-file.js server.js
```

This shows:
- The content around line 748
- Any potentially problematic patterns
- Node.js version information

### 3. Test File

The `test-server-syntax.js` file is a minimal version that mimics the structure around line 748 in your server.js file. You can upload this to your server to test if there's an issue with the Node.js environment.

### 4. Deployment Scripts

Two deployment scripts are provided to help you test on the server:

#### For Linux/Mac:

```bash
chmod +x deploy-test.sh
./deploy-test.sh username@server-ip /path/to/server/directory
```

Example:
```bash
./deploy-test.sh root@104.245.241.185 /var/www/coveredamerican.com/audio
```

#### For Windows:

```powershell
.\deploy-test.ps1 -Server "username@server-ip" -Directory "/path/to/server/directory"
```

Example:
```powershell
.\deploy-test.ps1 -Server "root@104.245.241.185" -Directory "/var/www/coveredamerican.com/audio"
```

## Troubleshooting Steps

1. **Verify the fix was applied**: Make sure the closing bracket at line 748 was removed from your server.js file.

2. **Check file deployment**: Ensure the fixed file was properly uploaded to the server at `/var/www/coveredamerican.com/audio/server.js`.

3. **Check Node.js version**: The server might be using a different version of Node.js than your local environment.

4. **Test with minimal file**: Upload and run the test-server-syntax.js file to see if it encounters the same error.

5. **Check for file permissions**: Make sure the server has the correct permissions to read and execute the server.js file.

6. **Restart the server**: After uploading the fixed file, restart the server using PM2:
   ```bash
   pm2 restart call-info-remover
   ```

7. **Check for other syntax issues**: There might be other syntax issues in the file that are causing problems.

## Manual Fix on Server

If you need to manually fix the file on the server:

```bash
# SSH into your server
ssh root@104.245.241.185

# Navigate to the directory
cd /var/www/coveredamerican.com/audio

# Edit the server.js file
nano server.js

# Go to line 748 (press Ctrl+_ then type 748)
# Remove the closing bracket `});` if it exists
# Save the file (Ctrl+O, then Enter)
# Exit nano (Ctrl+X)

# Restart the server
pm2 restart call-info-remover
```

## Additional Notes

- The error logs show timestamps, so make sure you're looking at recent logs after applying the fix.
- If you're still seeing the same error, it might be from before the fix was applied.
- Check the PM2 logs to see if there are any new errors after restarting the server.