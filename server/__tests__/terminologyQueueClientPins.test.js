/**
 * Item 19 — static byte-pins for the terminology.html queue wiring.
 * Pins match FILE BYTES: the JS status map uses \uXXXX escapes (a literal
 * backslash-u sequence in the file), the dropdown uses HTML entities.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const html = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'views', 'terminology.html'),
  'utf8'
);

describe('terminology.html review-queue wiring (item 19)', () => {
  it('has the queue panel and wiring endpoints', () => {
    expect(html).toContain('id="queue-section"');
    expect(html).toContain('/api/terminology/review-queue/counts');
    expect(html).toContain('/api/terminology/translations/batch-approve');
    expect(html).toContain("'/reject'");
  });

  it('carries the rejected status vocabulary in both dialects', () => {
    // JS map: literal backslash-u escape in the file
    expect(html).toContain("'rejected': 'Hafna\\u00F0'");
    // Dropdown option: HTML entity like its siblings
    expect(html).toContain('<option value="rejected">Hafna&#240;</option>');
  });

  it('the fake limit=1 banner fetch is gone', () => {
    expect(html).not.toContain('review-queue?limit=1');
  });

  it('every queue render site escapes DB-sourced fields', () => {
    // renderQueueRows must reference the escapers (presence pin; behavior is
    // covered by the shared escapeHtml implementation used page-wide)
    const fn = html.slice(
      html.indexOf('function renderQueueRows'),
      html.indexOf('function renderQueueRows') + 2500
    );
    expect(fn).toContain('escapeHtml(it.english)');
    expect(fn).toContain('escapeHtml(it.icelandic)');
  });
});
