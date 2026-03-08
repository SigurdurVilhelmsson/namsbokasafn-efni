import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'node:module';

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

// Lazy-loaded DB connection for audit logging
let _logDb = null;

function getLogDb() {
  if (_logDb) return _logDb;
  try {
    const dbPath = path.resolve('pipeline-output', 'sessions.db');
    if (!fs.existsSync(dbPath)) return null;

    const serverDir = path.resolve('server');
    const require = createRequire(path.join(serverDir, 'index.js'));
    const Database = require('better-sqlite3');
    _logDb = new Database(dbPath);
    return _logDb;
  } catch {
    return null;
  }
}

/**
 * Log a backup event to chapter_generation_log.
 * Best-effort — errors are logged but never thrown.
 *
 * @param {string} bookSlug  - e.g. 'efnafraedi-2e'
 * @param {number|string} chapterNum - Chapter number or 'appendices'
 * @param {string} action   - e.g. 'extract', 'inject', 'render'
 * @param {string} filePath  - The file that was overwritten
 * @param {string} backupPath - The backup file path
 */
export function logBackup(bookSlug, chapterNum, action, filePath, backupPath) {
  try {
    const db = getLogDb();
    if (!db) return;

    const chNum = chapterNum === 'appendices' ? -1 : Number(chapterNum);
    db.prepare(
      `INSERT INTO chapter_generation_log (book_slug, chapter_num, action, user_id, username, details)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      bookSlug,
      chNum,
      `backup:${action}`,
      'system',
      'system',
      JSON.stringify({ file: filePath, backup: backupPath })
    );
  } catch (err) {
    console.error(`Warning: failed to log backup: ${err.message}`);
  }
}
