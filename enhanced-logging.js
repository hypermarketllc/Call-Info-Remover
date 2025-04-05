/**
 * Enhanced Logging Module for Call Info Remover
 * Provides detailed logging for all stages of the audio processing pipeline
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

// Configure log directory
const LOG_DIR = 'detailed_logs';
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

// Log file paths
const LOG_FILES = {
  UPLOAD: path.join(LOG_DIR, 'upload.log'),
  TRANSCRIPTION: path.join(LOG_DIR, 'transcription.log'),
  REDACTION: path.join(LOG_DIR, 'redaction.log'),
  DATABASE: path.join(LOG_DIR, 'database.log'),
  DOWNLOAD: path.join(LOG_DIR, 'download.log'),
  ERROR: path.join(LOG_DIR, 'error.log'),
  ALL: path.join(LOG_DIR, 'all.log')
};

// Create log files if they don't exist
Object.values(LOG_FILES).forEach(file => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, '');
  }
});

// Log levels
const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS'
};

/**
 * Write log to file and console
 * @param {string} level - Log level
 * @param {string} category - Log category
 * @param {string} message - Log message
 * @param {Object} details - Additional details
 * @param {string} logFile - Specific log file to write to
 */
function writeLog(level, category, message, details = null, logFile = null) {
  const timestamp = new Date().toISOString();
  
  // Format details for better readability
  let formattedDetails = '';
  if (details) {
    if (typeof details === 'object') {
      // Handle Buffer objects specially
      if (Buffer.isBuffer(details)) {
        formattedDetails = `Buffer of length ${details.length}`;
      } else if (details instanceof Error) {
        formattedDetails = `\n  Error: ${details.message}\n  Stack: ${details.stack}`;
      } else {
        // For regular objects, use util.inspect for better formatting
        formattedDetails = '\n' + util.inspect(details, { 
          depth: 4, 
          colors: false, 
          maxArrayLength: 10,
          maxStringLength: 100
        });
      }
    } else {
      formattedDetails = details.toString();
    }
  }
  
  // Create log entry
  const logEntry = `[${timestamp}] [${level}] [${category}] ${message}${formattedDetails ? ' ' + formattedDetails : ''}\n`;
  
  // Write to console
  const consoleMethod = level === LOG_LEVELS.ERROR ? 'error' : 'log';
  console[consoleMethod](`[${level}][${category}] ${message}`);
  
  // Write to specific log file if provided
  if (logFile) {
    fs.appendFileSync(logFile, logEntry);
  }
  
  // Always write to the ALL log file
  fs.appendFileSync(LOG_FILES.ALL, logEntry);
  
  // Write to ERROR log if it's an error
  if (level === LOG_LEVELS.ERROR) {
    fs.appendFileSync(LOG_FILES.ERROR, logEntry);
  }
  
  return { timestamp, level, category, message, details };
}

// Create logger functions for each stage of the pipeline
const logger = {
  upload: {
    debug: (message, details) => writeLog(LOG_LEVELS.DEBUG, 'upload', message, details, LOG_FILES.UPLOAD),
    info: (message, details) => writeLog(LOG_LEVELS.INFO, 'upload', message, details, LOG_FILES.UPLOAD),
    warning: (message, details) => writeLog(LOG_LEVELS.WARNING, 'upload', message, details, LOG_FILES.UPLOAD),
    error: (message, details) => writeLog(LOG_LEVELS.ERROR, 'upload', message, details, LOG_FILES.UPLOAD),
    success: (message, details) => writeLog(LOG_LEVELS.SUCCESS, 'upload', message, details, LOG_FILES.UPLOAD)
  },
  transcription: {
    debug: (message, details) => writeLog(LOG_LEVELS.DEBUG, 'transcription', message, details, LOG_FILES.TRANSCRIPTION),
    info: (message, details) => writeLog(LOG_LEVELS.INFO, 'transcription', message, details, LOG_FILES.TRANSCRIPTION),
    warning: (message, details) => writeLog(LOG_LEVELS.WARNING, 'transcription', message, details, LOG_FILES.TRANSCRIPTION),
    error: (message, details) => writeLog(LOG_LEVELS.ERROR, 'transcription', message, details, LOG_FILES.TRANSCRIPTION),
    success: (message, details) => writeLog(LOG_LEVELS.SUCCESS, 'transcription', message, details, LOG_FILES.TRANSCRIPTION)
  },
  redaction: {
    debug: (message, details) => writeLog(LOG_LEVELS.DEBUG, 'redaction', message, details, LOG_FILES.REDACTION),
    info: (message, details) => writeLog(LOG_LEVELS.INFO, 'redaction', message, details, LOG_FILES.REDACTION),
    warning: (message, details) => writeLog(LOG_LEVELS.WARNING, 'redaction', message, details, LOG_FILES.REDACTION),
    error: (message, details) => writeLog(LOG_LEVELS.ERROR, 'redaction', message, details, LOG_FILES.REDACTION),
    success: (message, details) => writeLog(LOG_LEVELS.SUCCESS, 'redaction', message, details, LOG_FILES.REDACTION)
  },
  database: {
    debug: (message, details) => writeLog(LOG_LEVELS.DEBUG, 'database', message, details, LOG_FILES.DATABASE),
    info: (message, details) => writeLog(LOG_LEVELS.INFO, 'database', message, details, LOG_FILES.DATABASE),
    warning: (message, details) => writeLog(LOG_LEVELS.WARNING, 'database', message, details, LOG_FILES.DATABASE),
    error: (message, details) => writeLog(LOG_LEVELS.ERROR, 'database', message, details, LOG_FILES.DATABASE),
    success: (message, details) => writeLog(LOG_LEVELS.SUCCESS, 'database', message, details, LOG_FILES.DATABASE)
  },
  download: {
    debug: (message, details) => writeLog(LOG_LEVELS.DEBUG, 'download', message, details, LOG_FILES.DOWNLOAD),
    info: (message, details) => writeLog(LOG_LEVELS.INFO, 'download', message, details, LOG_FILES.DOWNLOAD),
    warning: (message, details) => writeLog(LOG_LEVELS.WARNING, 'download', message, details, LOG_FILES.DOWNLOAD),
    error: (message, details) => writeLog(LOG_LEVELS.ERROR, 'download', message, details, LOG_FILES.DOWNLOAD),
    success: (message, details) => writeLog(LOG_LEVELS.SUCCESS, 'download', message, details, LOG_FILES.DOWNLOAD)
  },
  system: {
    debug: (message, details) => writeLog(LOG_LEVELS.DEBUG, 'system', message, details),
    info: (message, details) => writeLog(LOG_LEVELS.INFO, 'system', message, details),
    warning: (message, details) => writeLog(LOG_LEVELS.WARNING, 'system', message, details),
    error: (message, details) => writeLog(LOG_LEVELS.ERROR, 'system', message, details),
    success: (message, details) => writeLog(LOG_LEVELS.SUCCESS, 'system', message, details)
  }
};

// Helper function to log database queries
logger.logQuery = function(query, params) {
  const sanitizedParams = params ? [...params].map(p => 
    Buffer.isBuffer(p) ? `<Buffer of length ${p.length}>` : p
  ) : [];
  
  logger.database.debug('Executing query', { 
    query, 
    params: sanitizedParams
  });
};

// Helper function to log database results
logger.logQueryResult = function(result, queryName) {
  logger.database.debug(`Query result for ${queryName}`, {
    rowCount: result.rowCount,
    rows: result.rows ? result.rows.length : 0,
    firstRow: result.rows && result.rows.length > 0 ? 
      Object.keys(result.rows[0]).reduce((acc, key) => {
        // Don't log binary data in detail
        if (Buffer.isBuffer(result.rows[0][key])) {
          acc[key] = `<Buffer of length ${result.rows[0][key].length}>`;
        } else {
          acc[key] = result.rows[0][key];
        }
        return acc;
      }, {}) : null
  });
};

// Helper to log file operations
logger.logFileOperation = function(operation, filePath, success, details) {
  const category = path.dirname(filePath).includes('upload') ? 'upload' : 
                  path.dirname(filePath).includes('processed') ? 'redaction' : 'system';
  
  if (success) {
    logger[category].debug(`File ${operation} successful: ${filePath}`, details);
  } else {
    logger[category].error(`File ${operation} failed: ${filePath}`, details);
  }
};

// Export the logger
module.exports = logger;