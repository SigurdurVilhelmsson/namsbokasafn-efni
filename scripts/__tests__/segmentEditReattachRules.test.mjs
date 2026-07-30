import { describe, it, expect } from 'vitest';
import {
  RESTORABLE_STATUSES,
  classifyByStatus,
  detectRetiredMarkers,
  composeEditorNote,
  reconcile,
  findDuplicateRestoreKeys,
  decideExitCode,
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

describe('findDuplicateRestoreKeys', () => {
  const row = (over) => ({
    book: 'testbook',
    module_id: 'm001',
    segment_id: 'm001:para:fs-id1',
    editor_id: 'u1',
    ...over,
  });

  it('flags two restorable rows that share one editor+segment key', () => {
    const dupes = findDuplicateRestoreKeys([row({ status: 'approved' }), row({ status: 'pending' })]);
    expect(dupes).toHaveLength(1);
  });

  it('reports how many rows collided, so the operator knows the size of the problem', () => {
    const dupes = findDuplicateRestoreKeys([row({}), row({}), row({})]);
    expect(dupes[0].count).toBe(3);
  });

  it('names the colliding key, so the operator can find it in the snapshot', () => {
    const dupes = findDuplicateRestoreKeys([row({}), row({})]);
    expect(dupes[0].key).toBe('testbook/m001/m001:para:fs-id1/u1');
  });

  it('returns empty when every key is unique', () => {
    const dupes = findDuplicateRestoreKeys([
      row({ segment_id: 'm001:para:fs-id1' }),
      row({ segment_id: 'm001:para:fs-id2' }),
    ]);
    expect(dupes).toEqual([]);
  });

  it('does NOT flag one segment edited by two different editors — the pending index keys on editor_id too, so those rows coexist', () => {
    const dupes = findDuplicateRestoreKeys([row({ editor_id: 'u1' }), row({ editor_id: 'u2' })]);
    expect(dupes).toEqual([]);
  });

  it('does NOT flag the same segment id under two different modules', () => {
    const dupes = findDuplicateRestoreKeys([row({ module_id: 'm001' }), row({ module_id: 'm002' })]);
    expect(dupes).toEqual([]);
  });
});

describe('decideExitCode', () => {
  // The runbook treats these as gates, not information ("two of them mean stop
  // and one does not"), so the mapping is pinned here rather than traced.
  const clean = {
    missingModules: [],
    duplicateKeys: [],
    unmatched: [],
    reconciliation: { ok: true },
  };

  it('exits 0 when everything matched and reconciled', () => {
    expect(decideExitCode(clean)).toBe(0);
  });

  it('exits 1 for unmatched rows — expected, and the operator continues by hand', () => {
    expect(decideExitCode({ ...clean, unmatched: [{}] })).toBe(1);
  });

  it('exits 2 when a module is absent from the new extraction', () => {
    expect(decideExitCode({ ...clean, missingModules: ['m001'] })).toBe(2);
  });

  it('exits 3 when the buckets do not reconcile', () => {
    expect(decideExitCode({ ...clean, reconciliation: { ok: false } })).toBe(3);
  });

  it('exits 4 when one key carries more than one restorable row', () => {
    expect(decideExitCode({ ...clean, duplicateKeys: [{ key: 'k', count: 2 }] })).toBe(4);
  });

  it('reports a missing module ahead of a failed reconciliation — a missing module CAUSES the gap', () => {
    expect(
      decideExitCode({ ...clean, missingModules: ['m001'], reconciliation: { ok: false } })
    ).toBe(2);
  });

  it('reports a colliding key ahead of unmatched rows — unmatched is survivable, a collision is not', () => {
    expect(decideExitCode({ ...clean, duplicateKeys: [{ key: 'k', count: 2 }], unmatched: [{}] })).toBe(4);
  });
});
