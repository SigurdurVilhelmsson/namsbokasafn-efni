// server/__tests__/editorialBackupPolicy.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  SERVER_DELETE_AFTER_DAYS,
  CAP_ALARM_AFTER_DAYS,
  MAX_COPIES_PER_24H,
  FRESH_WINDOW_MS,
  readListing,
  expiredPaths,
  recentCopies,
  hasFreshCopy,
  summarize,
} = require('../lib/editorialBackupPolicy');

const NOW = Date.parse('2027-12-01T00:00:00Z');
const ago = (days) => new Date(NOW - days * 86400000).toISOString();
const item = (Path, days, Size = 100) => ({ Path, Size, ModTime: ago(days), IsDir: false });
const text = (...items) => JSON.stringify(items);
const HOUR_DAYS = 1 / 24;

describe('editorialBackupPolicy', () => {
  it('reads an rclone lsjson listing, marking zero-size items as delete markers', () => {
    const r = readListing(text(item('a', 1), item('b-v2027', 2, 0)), NOW);
    expect(r).toEqual([
      { path: 'a', ageMs: 86400000, marker: false },
      { path: 'b-v2027', ageMs: 172800000, marker: true },
    ]);
  });
  it.each(['', 'not json', '{}', JSON.stringify([{ Path: 'a', Size: 1 }])])(
    'refuses a listing it cannot read: %j',
    (t) => expect(() => readListing(t, NOW)).toThrow('listing-invalid')
  );
  it('expires data versions older than 356 days, never a younger one or a marker', () => {
    const items = readListing(
      text(item('old', 356.01), item('edge', 355.99), item('mk', 400, 0)),
      NOW
    );
    expect(expiredPaths(items)).toEqual(['old']);
  });
  it('a future ModTime is never expired and counts as recent', () => {
    const items = readListing(text(item('future', -0.5)), NOW);
    expect(expiredPaths(items)).toEqual([]);
    expect(recentCopies(items)).toBe(1);
  });
  it('counts copies from the last 24 hours, markers excluded', () => {
    const items = readListing(
      text(item('a', 0.1), item('b', 0.9), item('c', 1.1), item('m', 0.2, 0)),
      NOW
    );
    expect(recentCopies(items)).toBe(2);
  });
  it('summarize: ok with the new copy seen and nothing over 358 days', () => {
    const s = summarize(readListing(text(item('a', 0), item('b', 357.9), item('m', 500, 0)), NOW), {
      uploadedSeen: true,
    });
    expect(s).toEqual({
      ok: true,
      reasons: [],
      oldest_age_days: 357,
      newest_age_days: 0,
      data_versions: 2,
      delete_markers: 1,
      uploaded_seen: true,
    });
  });
  it('summarize: fails closed on an empty listing, an unseen upload, and a copy over 358 days', () => {
    // An empty listing holds no fresh copy either; health reports only the first reason
    expect(summarize([], { uploadedSeen: true }).reasons).toEqual([
      'listing-empty',
      'no-fresh-copy',
    ]);
    const items = readListing(text(item('a', 0), item('old', 358.01)), NOW);
    expect(summarize(items, { uploadedSeen: false }).reasons).toEqual([
      'uploaded-not-seen',
      'over-cap',
    ]);
  });
  it('summarize: a listing of delete markers only is empty of copies', () => {
    const s = summarize(readListing(text(item('m1', 0, 0), item('m2', 1, 0)), NOW), {
      uploadedSeen: true,
    });
    expect(s.reasons[0]).toBe('listing-empty');
    expect(s.ok).toBe(false);
  });
  it('summarize: no data version within an hour of now is no-fresh-copy (the clock or the bucket is off)', () => {
    const items = readListing(text(item('two-hours', 2 * HOUR_DAYS), item('b', 5)), NOW);
    expect(summarize(items, { uploadedSeen: true }).reasons).toEqual(['no-fresh-copy']);
  });
  it('summarize: a copy that looks two hours in the future is not fresh either', () => {
    const items = readListing(text(item('future', -2 * HOUR_DAYS)), NOW);
    expect(summarize(items, { uploadedSeen: true }).reasons).toEqual(['no-fresh-copy']);
  });
  it('summarize: reasons come in the order listing-empty, uploaded-not-seen, no-fresh-copy, over-cap', () => {
    // listing-empty and over-cap cannot both hold (one needs no data version, the other an old one): two listings
    const items = readListing(text(item('old', 400), item('b', 3)), NOW);
    expect(summarize(items, { uploadedSeen: false }).reasons).toEqual([
      'uploaded-not-seen',
      'no-fresh-copy',
      'over-cap',
    ]);
    expect(summarize([], { uploadedSeen: false }).reasons).toEqual([
      'listing-empty',
      'uploaded-not-seen',
      'no-fresh-copy',
    ]);
  });
  it('hasFreshCopy: a data version within an hour either side of now, never a marker', () => {
    const at = (days, size) => hasFreshCopy(readListing(text(item('x', days, size)), NOW));
    expect([at(0.99 * HOUR_DAYS), at(-0.99 * HOUR_DAYS)]).toEqual([true, true]);
    expect([at(1.01 * HOUR_DAYS), at(-1.01 * HOUR_DAYS), at(0, 0)]).toEqual([false, false, false]);
  });
  it('pins the spec values', () => {
    expect([SERVER_DELETE_AFTER_DAYS, CAP_ALARM_AFTER_DAYS, MAX_COPIES_PER_24H]).toEqual([
      356, 358, 8,
    ]);
  });
  it('pins the fresh-copy window at one hour', () => {
    expect(FRESH_WINDOW_MS).toBe(60 * 60 * 1000);
  });
});
