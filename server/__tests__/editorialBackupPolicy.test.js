// server/__tests__/editorialBackupPolicy.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  SERVER_DELETE_AFTER_DAYS,
  CAP_ALARM_AFTER_DAYS,
  MAX_COPIES_PER_24H,
  readListing,
  expiredPaths,
  recentCopies,
  summarize,
} = require('../lib/editorialBackupPolicy');

const NOW = Date.parse('2027-12-01T00:00:00Z');
const ago = (days) => new Date(NOW - days * 86400000).toISOString();
const item = (Path, days, Size = 100) => ({ Path, Size, ModTime: ago(days), IsDir: false });
const text = (...items) => JSON.stringify(items);

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
    expect(summarize([], { uploadedSeen: true }).reasons).toEqual(['listing-empty']);
    const items = readListing(text(item('a', 0), item('old', 358.01)), NOW);
    expect(summarize(items, { uploadedSeen: false }).reasons).toEqual([
      'uploaded-not-seen',
      'over-cap',
    ]);
  });
  it('pins the spec values', () => {
    expect([SERVER_DELETE_AFTER_DAYS, CAP_ALARM_AFTER_DAYS, MAX_COPIES_PER_24H]).toEqual([
      356, 358, 8,
    ]);
  });
});
