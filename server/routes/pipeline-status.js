/**
 * Pipeline Status Routes
 *
 * API endpoints for chapter pipeline status, stage transitions, and locking.
 *
 * Endpoints:
 *   GET    /api/pipeline-status/:bookSlug/:chapterNum         → stage + history
 *   POST   /api/pipeline-status/:bookSlug/:chapterNum/advance → complete current stage
 *   POST   /api/pipeline-status/:bookSlug/:chapterNum/revert  → admin revert one stage
 *   POST   /api/pipeline-status/:bookSlug/:chapterNum/lock    → acquire lock
 *   DELETE /api/pipeline-status/:bookSlug/:chapterNum/lock    → release lock
 */

const express = require('express');
const router = express.Router();

const pipelineStatus = require('../services/pipelineStatusService');
const chapterLock = require('../lib/chapterLock');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole, ROLES } = require('../middleware/requireRole');
const { VALID_BOOKS } = require('../config');
const { MAX_CHAPTERS } = require('../constants');

// All endpoints require authentication
router.use(requireAuth);

// --- Parameter validation middleware ---

function validateBookChapter(req, res, next) {
  const { bookSlug, chapterNum } = req.params;

  if (!VALID_BOOKS.includes(bookSlug)) {
    return res.status(400).json({ error: 'Ógild bók: ' + bookSlug });
  }

  const num = parseInt(chapterNum, 10);
  if (isNaN(num) || num < -1 || num > MAX_CHAPTERS) {
    return res.status(400).json({ error: 'Ógilt kaflanúmer' });
  }

  req.chapterNum = num;
  req.bookSlug = bookSlug;
  req.lockId = bookSlug + '-' + (num === -1 ? 'appendices' : String(num).padStart(2, '0'));
  next();
}

router.use('/:bookSlug/:chapterNum', validateBookChapter);

// --- Helper: format lock error in Icelandic ---

function lockErrorResponse(lockResult) {
  const expiresAt = new Date(lockResult.expiresAt);
  const now = new Date();
  const diffMin = Math.max(1, Math.round((expiresAt - now) / 60000));
  const timeStr = diffMin >= 60 ? Math.round(diffMin / 60) + ' klst' : diffMin + ' mín';

  return {
    error: 'Læst',
    message:
      'Þessi kafli er opinn hjá ' + lockResult.lockedBy + '. Reyndu aftur eftir ' + timeStr + '.',
    lockedBy: lockResult.lockedBy,
    expiresAt: lockResult.expiresAt,
  };
}

// --- GET /:bookSlug/:chapterNum ---

router.get('/:bookSlug/:chapterNum', (req, res) => {
  try {
    const status = pipelineStatus.getChapterStage(req.bookSlug, req.chapterNum);
    const history = pipelineStatus.getStageHistory(req.bookSlug, req.chapterNum);

    // Check lock status by querying DB directly (read-only, no acquire/release)
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(__dirname, '..', '..', 'pipeline-output', 'sessions.db');
    let lock = null;
    try {
      const db = new Database(dbPath, { readonly: true });
      const row = db
        .prepare(
          "SELECT locked_by, expires_at FROM chapter_locks WHERE chapter_id = ? AND expires_at > datetime('now')"
        )
        .get(req.lockId);
      db.close();
      if (row) {
        lock = { lockedBy: row.locked_by, expiresAt: row.expires_at };
      }
    } catch {
      // Lock table may not exist yet
    }

    res.json({ ...status, history: history.slice(0, 20), lock });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- POST /:bookSlug/:chapterNum/advance ---

router.post('/:bookSlug/:chapterNum/advance', requireRole(ROLES.EDITOR), (req, res) => {
  try {
    // Acquire lock
    const lockResult = chapterLock.acquireLock(req.lockId, req.user.username);
    if (!lockResult.ok) {
      return res.status(409).json(lockErrorResponse(lockResult));
    }

    try {
      // Determine the current stage and advance it
      const { currentStage, publication } = pipelineStatus.getChapterStage(
        req.bookSlug,
        req.chapterNum
      );

      // If all base stages complete, check publication sub-tracks
      if (currentStage === 'publication') {
        const trackMap = {
          mtPreview: 'publication.mtPreview',
          faithful: 'publication.faithful',
          localized: 'publication.localized',
        };

        for (const [track, stageName] of Object.entries(trackMap)) {
          if (publication[track] !== 'complete') {
            const result = pipelineStatus.transitionStage(
              req.bookSlug,
              req.chapterNum,
              stageName,
              'complete',
              req.user.username,
              req.body.note || null
            );
            return res.json({ success: true, ...result });
          }
        }

        return res.status(400).json({ error: 'Allt er þegar lokið' });
      }

      // Complete the current base stage
      const result = pipelineStatus.transitionStage(
        req.bookSlug,
        req.chapterNum,
        currentStage,
        'complete',
        req.user.username,
        req.body.note || null
      );

      res.json({ success: true, ...result });
    } finally {
      // Always release lock after operation
      chapterLock.releaseLock(req.lockId, req.user.username);
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- POST /:bookSlug/:chapterNum/revert ---

router.post('/:bookSlug/:chapterNum/revert', requireRole(ROLES.ADMIN), (req, res) => {
  const note = req.body.note;
  if (!note || note.trim().length < 10) {
    return res.status(400).json({
      error: 'Athugasemd þarf að vera að minnsta kosti 10 stafir',
    });
  }

  try {
    // Acquire lock
    const lockResult = chapterLock.acquireLock(req.lockId, req.user.username);
    if (!lockResult.ok) {
      return res.status(409).json(lockErrorResponse(lockResult));
    }

    try {
      const result = pipelineStatus.revertStage(
        req.bookSlug,
        req.chapterNum,
        req.user.username,
        note
      );
      res.json({ success: true, ...result });
    } finally {
      chapterLock.releaseLock(req.lockId, req.user.username);
    }
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- POST /:bookSlug/:chapterNum/lock ---

router.post('/:bookSlug/:chapterNum/lock', requireRole(ROLES.EDITOR), (req, res) => {
  try {
    const result = chapterLock.acquireLock(req.lockId, req.user.username);
    if (!result.ok) {
      return res.status(409).json(lockErrorResponse(result));
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DELETE /:bookSlug/:chapterNum/lock ---

router.delete('/:bookSlug/:chapterNum/lock', requireRole(ROLES.EDITOR), (req, res) => {
  try {
    const username = req.user.role === 'admin' ? 'admin:' + req.user.username : req.user.username;
    const result = chapterLock.releaseLock(req.lockId, username);
    if (!result.ok) {
      return res.status(403).json({ error: 'Þú átt ekki þessa læsingu' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
