/**
 * Tests for teamDigestService.sendReviewDigests (Unit 5.2) — injectable deps,
 * no DB.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const digest = require('../services/teamDigestService');

const NOW = Date.parse('2026-06-13T00:00:00Z');
const twoDaysAgo = '2026-06-11T00:00:00Z';
const oneDayAgo = '2026-06-12T00:00:00Z';

function harness(overrides = {}) {
  const sentNotifications = [];
  const deps = {
    now: () => NOW,
    getQueue: () => [],
    getHeadEditors: () => [],
    alreadySent: () => false,
    notify: (opts) => {
      sentNotifications.push(opts);
      return Promise.resolve({ id: sentNotifications.length });
    },
    ...overrides,
  };
  return { deps, sentNotifications };
}

describe('sendReviewDigests', () => {
  it('notifies a book head-editor when reviews are pending', async () => {
    const { deps, sentNotifications } = harness({
      getQueue: () => [
        { book: 'efnafraedi-2e', submitted_at: twoDaysAgo },
        { book: 'efnafraedi-2e', submitted_at: oneDayAgo },
      ],
      getHeadEditors: () => [{ id: '7', role: 'head-editor' }],
    });
    const res = await digest.sendReviewDigests(deps);
    expect(res).toEqual({ books: 1, sent: 1 });
    expect(sentNotifications).toHaveLength(1);
    const n = sentNotifications[0];
    expect(n.userId).toBe('7');
    expect(n.type).toBe('review_digest');
    expect(n.message).toContain('2'); // 2 modules waiting
    expect(n.message).toContain('í 2 daga'); // oldest = 2 days
    expect(n.link).toContain('book=efnafraedi-2e');
  });

  it('is a no-op when the queue is empty', async () => {
    const { deps, sentNotifications } = harness();
    const res = await digest.sendReviewDigests(deps);
    expect(res).toEqual({ books: 0, sent: 0 });
    expect(sentNotifications).toHaveLength(0);
  });

  it("groups by book and notifies each book's head-editors", async () => {
    const { deps, sentNotifications } = harness({
      getQueue: () => [
        { book: 'efnafraedi-2e', submitted_at: oneDayAgo },
        { book: 'liffraedi-2e', submitted_at: oneDayAgo },
      ],
      getHeadEditors: (book) =>
        book === 'efnafraedi-2e'
          ? [{ id: '7', role: 'head-editor' }]
          : [{ id: '9', role: 'admin' }],
    });
    const res = await digest.sendReviewDigests(deps);
    expect(res.books).toBe(2);
    expect(sentNotifications.map((n) => n.userId).sort()).toEqual(['7', '9']);
  });

  it('skips head-editors who already got a digest today', async () => {
    const { deps, sentNotifications } = harness({
      getQueue: () => [{ book: 'efnafraedi-2e', submitted_at: oneDayAgo }],
      getHeadEditors: () => [
        { id: '7', role: 'head-editor' },
        { id: '8', role: 'head-editor' },
      ],
      alreadySent: (uid) => uid === '7',
    });
    const res = await digest.sendReviewDigests(deps);
    expect(res.sent).toBe(1);
    expect(sentNotifications.map((n) => n.userId)).toEqual(['8']);
  });

  it('ignores reviews with no book', async () => {
    const { deps } = harness({
      getQueue: () => [{ book: null, submitted_at: oneDayAgo }],
      getHeadEditors: () => [{ id: '7', role: 'head-editor' }],
    });
    const res = await digest.sendReviewDigests(deps);
    expect(res).toEqual({ books: 0, sent: 0 });
  });

  it('a failing notify for one editor does not abort the rest', async () => {
    const sent = [];
    const res = await digest.sendReviewDigests({
      now: () => NOW,
      getQueue: () => [{ book: 'b', submitted_at: oneDayAgo }],
      getHeadEditors: () => [
        { id: '1', role: 'head-editor' },
        { id: '2', role: 'head-editor' },
      ],
      alreadySent: () => false,
      notify: (opts) => {
        if (opts.userId === '1') return Promise.reject(new Error('boom'));
        sent.push(opts.userId);
        return Promise.resolve({});
      },
    });
    expect(res.sent).toBe(1);
    expect(sent).toEqual(['2']);
  });
});
