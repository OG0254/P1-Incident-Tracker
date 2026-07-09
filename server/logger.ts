import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const APP_LOG_PATH = path.join(LOG_DIR, 'application.log');
const ERR_LOG_PATH = path.join(LOG_DIR, 'errors.log');
const SEC_LOG_PATH = path.join(LOG_DIR, 'security.log');

function formatMessage(level: string, message: string, meta?: any): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` | Meta: ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}\n`;
}

function writeLog(filePath: string, content: string) {
  fs.appendFile(filePath, content, (err) => {
    if (err) {
      console.error(`Failed to write to log file ${filePath}:`, err);
    }
  });
}

export const logger = {
  info: (message: string, meta?: any) => {
    const formatted = formatMessage('INFO', message, meta);
    console.log(`[INFO] ${message}`);
    writeLog(APP_LOG_PATH, formatted);
  },
  
  warn: (message: string, meta?: any) => {
    const formatted = formatMessage('WARN', message, meta);
    console.warn(`[WARN] ${message}`);
    writeLog(APP_LOG_PATH, formatted);
    writeLog(SEC_LOG_PATH, formatted);
  },

  error: (message: string, error?: any, meta?: any) => {
    const errDetails = error instanceof Error ? { message: error.message, stack: error.stack } : error;
    const combinedMeta = { ...meta, error: errDetails };
    const formatted = formatMessage('ERROR', message, combinedMeta);
    console.error(`[ERROR] ${message}`, error);
    writeLog(APP_LOG_PATH, formatted);
    writeLog(ERR_LOG_PATH, formatted);
  },

  security: (message: string, meta?: any) => {
    const formatted = formatMessage('SECURITY', message, meta);
    console.warn(`[SECURITY-AUDIT] ${message}`);
    writeLog(SEC_LOG_PATH, formatted);
    writeLog(APP_LOG_PATH, formatted); // Also copy to general app log
  }
};
