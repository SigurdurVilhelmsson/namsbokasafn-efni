import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Write a file with atomic rename and automatic backup.
 *
 * @param {string} filePath - Absolute or relative path to write
 * @param {string} content - File content
 * @returns {string|null} Backup path, or null if no backup was needed
 */
export function safeWrite(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let backupPath = null;

  // Backup existing file
  if (fs.existsSync(filePath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    backupPath = `${filePath}.backup.${timestamp}`;
    try {
      fs.copyFileSync(filePath, backupPath);
    } catch (err) {
      console.error(`Warning: backup failed for ${filePath}: ${err.message}`);
      backupPath = null;
    }
  }

  // Atomic write: temp file + rename
  const tmpPath = `${filePath}.tmp.${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);

  return backupPath;
}
