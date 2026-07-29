import { describe, it, expect } from 'vitest';
import {
  RESTORABLE_STATUSES,
  classifyByStatus,
  detectRetiredMarkers,
  composeEditorNote,
  reconcile,
} from '../lib/segment-edit-reattach-rules.js';

describe('classifyByStatus', () => {
  it('restores live editorial work', () => {
    expect(classifyByStatus('approved')).toBe('restore');
    expect(classifyByStatus('pending')).toBe('restore');
    expect(classifyByStatus('discuss')).toBe('restore');
  });

  it('never resurrects a rejected edit', () => {
    expect(classifyByStatus('rejected')).toBe('skip-status');
  });

  it('never restores superseded history', () => {
    expect(classifyByStatus('superseded')).toBe('skip-status');
  });

  it('treats an unknown status as skip, not restore', () => {
    expect(classifyByStatus('banana')).toBe('skip-status');
  });

  it('exposes exactly the three restorable statuses', () => {
    expect([...RESTORABLE_STATUSES].sort()).toEqual(['approved', 'discuss', 'pending']);
  });
});

describe('detectRetiredMarkers', () => {
  it('finds curly emphasis', () => {
    expect(detectRetiredMarkers('a {{i}}b{{/i}} c')).toEqual(['curly-emphasis']);
  });

  it('finds curly term and footnote', () => {
    expect(detectRetiredMarkers('{{term}}mól{{/term}}')).toEqual(['curly-term-fn']);
  });

  it('finds markdown shapes', () => {
    expect(detectRetiredMarkers('H~2~O')).toEqual(['markdown']);
  });

  it('returns every class present, in stable order', () => {
    expect(detectRetiredMarkers('{{i}}x{{/i}} {{fn}}y{{/fn}} ^z^')).toEqual([
      'curly-emphasis',
      'curly-term-fn',
      'markdown',
    ]);
  });

  it('does not flag current bracket markers', () => {
    expect(detectRetiredMarkers('[[i:hratt]] [[term:mól|term-42]] [[sub:2]]')).toEqual([]);
  });

  it('returns empty for plain prose', () => {
    expect(detectRetiredMarkers('Venjulegur íslenskur texti.')).toEqual([]);
  });
});

describe('composeEditorNote', () => {
  it('leads with the retired-marker flags', () => {
    const note = composeEditorNote({ flags: ['curly-emphasis'], oldMt: 'gamalt' });
    expect(note).toMatch(/^⚠️ ENDURFLUTT/);
    expect(note).toContain('curly-emphasis');
  });

  it('carries the old MT text so the editor can compare', () => {
    expect(composeEditorNote({ flags: [], oldMt: 'gamla vélþýðingin' })).toContain(
      'gamla vélþýðingin'
    );
  });

  it('preserves an existing editor note', () => {
    const note = composeEditorNote({ flags: [], oldMt: 'x', editorNote: 'upprunaleg athugasemd' });
    expect(note).toContain('upprunaleg athugasemd');
  });

  it('preserves a reviewer note from a discuss row', () => {
    const note = composeEditorNote({ flags: [], oldMt: 'x', reviewerNote: 'spurning yfirlesara' });
    expect(note).toContain('spurning yfirlesara');
  });
});

describe('reconcile', () => {
  it('accepts a run whose buckets sum to the snapshot total', () => {
    const r = reconcile({ total: 10, restored: 6, converged: 1, skippedByStatus: 2, unmatched: 1 });
    expect(r.ok).toBe(true);
  });

  it('rejects a run that loses rows, and names the gap', () => {
    const r = reconcile({ total: 10, restored: 6, converged: 0, skippedByStatus: 0, unmatched: 1 });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('3');
  });
});
