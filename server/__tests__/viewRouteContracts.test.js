/**
 * Item 16 PR1 — static view↔route contract pins (Batch F).
 *
 * No jsdom infra exists for the inline view scripts, so these pin the
 * source-level reads against what the routes actually send (same mechanism
 * as clientMessageContracts.test.js). The companion behavioral halves live
 * in the route-harness/service suites; the endpoint shapes are documented
 * in docs/technical/view-route-contracts.md.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const view = (name) => fs.readFileSync(path.join(here, '..', 'views', name), 'utf8');

describe('books.html chapter activity panel (F12)', () => {
  const src = view('books.html');

  it('reads the fields /api/activity actually sends', () => {
    expect(src).toMatch(/getActivityIcon\(a\.type\)/);
    expect(src).toMatch(/escapeHtml\(a\.username \|\| 'Kerfi'\)/);
    expect(src).toMatch(/escapeHtml\(a\.description\)/);
    expect(src).toMatch(/formatTimeAgo\(a\.createdAt\)/);
  });

  it('no longer reads the phantom action-style fields', () => {
    expect(src).not.toMatch(/getActivityIcon\(a\.action\)/);
    expect(src).not.toMatch(/a\.userName\b/);
    expect(src).not.toMatch(/escapeHtml\(a\.details\)/);
    expect(src).not.toMatch(/formatTimeAgo\(a\.timestamp\)/);
  });

  it('both panels share one render function (dedupe)', () => {
    expect(src.match(/function renderActivityRows\(/g)).toHaveLength(1);
    expect(src.match(/renderActivityRows\(activities\)/g).length).toBeGreaterThanOrEqual(2);
  });

  it('icon map keys on live ACTIVITY_TYPES vocabulary', () => {
    expect(src).toMatch(/segment_edit_saved:/);
    expect(src).toMatch(/segment_edit_approved:/);
    expect(src).toMatch(/assign_chapter:/);
    expect(src).not.toMatch(/assignment_created:/);
    expect(src).not.toMatch(/assignment_completed:/);
  });
});

describe('status.html pipeline badges (F11)', () => {
  const src = view('status.html');

  it('converts the top-level stages array instead of reading data.status', () => {
    expect(src).not.toMatch(/data\.status\s*&&\s*data\.status\.stages/);
    expect(src).toMatch(/data\.stages \|\| \[\]/);
  });
});

describe('books.html dead cvLoadStatus removed (F11 rider)', () => {
  it('the object-shaped misread is gone', () => {
    const src = view('books.html');
    expect(src).not.toMatch(/function cvLoadStatus\(/);
    expect(src).not.toMatch(/cvLoadStatus\(/);
  });
});

describe('status.html activity timeline (F27)', () => {
  const src = view('status.html');

  it('renders the server-provided timeAgo, no client date parsing', () => {
    expect(src).toMatch(/a\.timeAgo/);
    expect(src).not.toMatch(/new Date\(a\.created_at \|\| a\.timestamp\)/);
  });
});

describe('my-work.html personal activity feed (F26)', () => {
  const src = view('my-work.html');

  it('timestamp reads the camelCase field parseRow sends', () => {
    expect(src).toMatch(/formatTimeAgo\(a\.createdAt\)/);
    expect(src).not.toMatch(/a\.created_at\b/);
  });
});

describe('my-work.html admin activity feed (F31)', () => {
  const src = view('my-work.html');

  it('icon renders when present (ternary was backwards)', () => {
    expect(src).toMatch(/activity\.icon \|\| '●'/);
    expect(src).not.toMatch(/activity\.icon \? '' :/);
  });

  it('color applied as a CSS class, not an inline hex-alpha style', () => {
    expect(src).not.toMatch(/background:' \+ activity\.color \+ '20/);
    expect(src).toMatch(/admin-activity-icon' \+ \(activity\.color \? ' ' \+/);
    expect(src).toMatch(/\.admin-activity-icon\.success/);
    expect(src).toMatch(/\.admin-activity-icon\.warning/);
    expect(src).toMatch(/\.admin-activity-icon\.info/);
  });
});
