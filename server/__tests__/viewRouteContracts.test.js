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
  });
});
