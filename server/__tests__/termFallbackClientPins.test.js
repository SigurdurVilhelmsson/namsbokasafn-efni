/**
 * Item 18 — static source pins for the fallback presentation in the segment
 * editor. No jsdom infra exists for segment-editor.js's DOM code (same
 * rationale as viewRouteContracts.test.js); term-highlight.js carries the
 * behavioral half in termHighlight.test.js. Pins match file bytes — class
 * names and object keys only, no Icelandic literals (campaign lesson).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

describe('term popup fallback presentation (item 18)', () => {
  const editorJs = read('public/js/segment-editor.js');
  const editorHtml = read('views/segment-editor.html');
  const uiStrings = read('public/js/ui-strings.js');

  it('renders the fallback note when the match is fallback', () => {
    expect(editorJs).toMatch(/termInfo\.isFallback/);
    expect(editorJs).toMatch(/term-popup-fallback-note/);
    expect(uiStrings).toMatch(/termPopup:\s*\{/);
    expect(uiStrings).toMatch(/fallbackNote:/);
  });

  it('subject badges are class-based with a fallback modifier', () => {
    expect(editorJs).toMatch(/term-subject-badge\$\{tr\.isFallback \? ' other' : ''\}/);
  });

  it('CSS defines the popup fallback classes', () => {
    expect(editorHtml).toMatch(/\.term-subject-badge\s*\{/);
    expect(editorHtml).toMatch(/\.term-subject-badge\.other\s*\{/);
    expect(editorHtml).toMatch(/\.term-popup-fallback-note\s*\{/);
  });
});
