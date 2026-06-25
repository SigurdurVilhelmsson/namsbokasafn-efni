/**
 * teamDigestService — daily reviewer-queue digest for book head-editors
 * (editorial-throughput Unit 5.2).
 *
 * Once a day, for each book with pending module reviews, the book's
 * head-editors get an in-app notification: how many modules are waiting and how
 * long the oldest has waited. No new scheduler dependency — a module-level
 * daily interval (unref'd) plus a delayed first run, mirroring the
 * pipelineService cleanup-job pattern. `sentToday` keeps a server restart from
 * re-sending.
 *
 * The core (`sendReviewDigests`) takes injectable collaborators so it can be
 * tested without a DB.
 */
const segmentEditorService = require('./segmentEditorService');
const userService = require('./userService');
const notifications = require('./notifications');
const log = require('../lib/logger');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compute and send the digests.
 *
 * @param {object} [deps] - test seams
 *   getQueue()        → pending module reviews (rows with .book, .submitted_at)
 *   getHeadEditors(b) → [{ id, role }] head-editors/admins for book b
 *   notify(opts)      → create a notification
 *   alreadySent(uid)  → boolean (already got a digest today)
 *   now()             → epoch ms
 * @returns {Promise<{ books: number, sent: number }>}
 */
async function sendReviewDigests(deps = {}) {
  const getQueue = deps.getQueue || (() => segmentEditorService.getReviewQueue());
  const getHeadEditors =
    deps.getHeadEditors ||
    ((book) =>
      userService.getEditorsForBook(book).filter((u) => ['head-editor', 'admin'].includes(u.role)));
  const notify = deps.notify || ((opts) => notifications.createNotification(opts));
  const alreadySent = deps.alreadySent || ((uid) => notifications.sentToday(uid, 'review_digest'));
  const now = deps.now ? deps.now() : Date.now();

  const reviews = getQueue() || [];

  // Group pending reviews by book, tracking count + oldest submission.
  const byBook = new Map();
  for (const r of reviews) {
    if (!r.book) continue;
    if (!byBook.has(r.book)) byBook.set(r.book, { count: 0, oldest: r.submitted_at });
    const g = byBook.get(r.book);
    g.count++;
    if (r.submitted_at && new Date(r.submitted_at) < new Date(g.oldest)) {
      g.oldest = r.submitted_at;
    }
  }

  let sent = 0;
  for (const [book, g] of byBook) {
    const oldestDays = g.oldest
      ? Math.max(0, Math.floor((now - new Date(g.oldest).getTime()) / DAY_MS))
      : 0;
    const heads = getHeadEditors(book) || [];
    for (const he of heads) {
      try {
        if (await alreadySent(he.id)) continue;
        await notify({
          userId: String(he.id),
          type: 'review_digest',
          title: 'Yfirlestrar bíða',
          message: `${g.count} ${g.count === 1 ? 'eining bíður' : 'einingar bíða'} yfirlestrar í ${book}. Elsta hefur beðið í ${oldestDays} ${oldestDays === 1 ? 'dag' : 'daga'}.`,
          link: `/review-queue?book=${encodeURIComponent(book)}`,
        });
        sent++;
      } catch (err) {
        log.error({ err, book, userId: he.id }, 'Review digest notification failed');
      }
    }
  }

  return { books: byBook.size, sent };
}

/**
 * Start the daily digest scheduler (idempotent-ish; intended to be called once
 * at server boot). Skipped under test runners.
 */
function startScheduler() {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return null;
  // First run shortly after boot, then daily.
  const initial = setTimeout(() => {
    sendReviewDigests().catch((err) => log.error({ err }, 'Initial review digest failed'));
  }, 60 * 1000);
  if (typeof initial.unref === 'function') initial.unref();

  const interval = setInterval(() => {
    sendReviewDigests().catch((err) => log.error({ err }, 'Daily review digest failed'));
  }, DAY_MS);
  if (typeof interval.unref === 'function') interval.unref();

  return { initial, interval };
}

module.exports = { sendReviewDigests, startScheduler };
