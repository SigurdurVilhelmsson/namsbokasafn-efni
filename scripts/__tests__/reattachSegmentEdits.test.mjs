import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tmp, booksDir;

function writeMt(moduleId, chDir, text) {
  const dir = path.join(booksDir, 'testbook', '02-mt-output', chDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${moduleId}-segments.is.md`), text);
}

function snapshotWith(edits) {
  return { schema: 1, takenAt: '2026-07-29T00:00:00Z', book: 'testbook', modules: ['m001'], edits };
}

function edit(over = {}) {
  return {
    id: 1, book: 'testbook', chapter: 1, module_id: 'm001',
    segment_id: 'm001:para:fs-id1', original_content: 'gamalt',
    edited_content: 'leiðrétt', editor_id: 'u1', editor_username: 'Editor',
    status: 'approved', category: null, editor_note: null, reviewer_note: null,
    context: { en: 'English one', mtAtSnapshot: 'gamalt' },
    ...over,
  };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c16-reattach-'));
  booksDir = path.join(tmp, 'books');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('planReattach', () => {
  it('restores an edit whose segment id survives re-extraction', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    const plan = planReattach({ snapshot: snapshotWith([edit()]), booksDir });
    expect(plan.restore).toHaveLength(1);
    expect(plan.restore[0].newMt).toBe('ný vélþýðing');
  });

  it('unescapes MT-introduced backslash escapes before restoring (R4)', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    // \[\[MATH:4\]\] is what the malstadur.is MT service actually escapes to
    // on disk; the editor's view (and thus originalContent) is the unescaped
    // form. A raw comparison here would never converge on an escaped segment.
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný \\[\\[MATH:4\\]\\] vélþýðing\n');
    const plan = planReattach({ snapshot: snapshotWith([edit()]), booksDir });
    expect(plan.restore).toHaveLength(1);
    expect(plan.restore[0].newMt).toBe('ný [[MATH:4]] vélþýðing');
  });

  it('reports an unmatched id instead of guessing', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:DIFFERENT -->\nný vélþýðing\n');
    const plan = planReattach({ snapshot: snapshotWith([edit()]), booksDir });
    expect(plan.restore).toHaveLength(0);
    expect(plan.unmatched).toHaveLength(1);
    expect(plan.unmatched[0].segment_id).toBe('m001:para:fs-id1');
    expect(plan.unmatched[0].context.en).toBe('English one');
  });

  it('never restores a rejected edit', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    const plan = planReattach({ snapshot: snapshotWith([edit({ status: 'rejected' })]), booksDir });
    expect(plan.restore).toHaveLength(0);
    expect(plan.skippedByStatus).toHaveLength(1);
  });

  it('counts an edit the new MT already matches as converged, not lost', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nleiðrétt\n');
    const plan = planReattach({ snapshot: snapshotWith([edit()]), booksDir });
    expect(plan.converged).toHaveLength(1);
    expect(plan.restore).toHaveLength(0);
  });

  it('flags retired markers in the restored text', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný\n');
    const plan = planReattach({
      snapshot: snapshotWith([edit({ edited_content: '{{i}}skáletrað{{/i}}' })]),
      booksDir,
    });
    expect(plan.restore[0].flags).toEqual(['curly-emphasis']);
    expect(plan.restore[0].editorNote).toContain('curly-emphasis');
  });

  it('treats a whole missing module as fatal, not as unmatched rows', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    const plan = planReattach({ snapshot: snapshotWith([edit()]), booksDir });
    expect(plan.missingModules).toEqual(['m001']);
  });

  it('reconciles every snapshot row into exactly one bucket', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný\n');
    const plan = planReattach({
      snapshot: snapshotWith([
        edit(),
        edit({ id: 2, segment_id: 'm001:para:gone', status: 'approved' }),
        edit({ id: 3, status: 'superseded' }),
      ]),
      booksDir,
    });
    expect(plan.reconciliation.ok).toBe(true);
  });
});

// G1.1 (index decision 7, plan decision 16): the study book's edits are written only
// through servedEdit.saveOnServedBase, which records the served base. This script
// matches by id and calls saveSegmentEdit directly, so it refuses that book before
// planning. The book list is read from server/lib/researchScope.js, never restated.
describe('planReattach refuses the study book (index decision 7)', () => {
  it('throws STUDY_BOOK when the snapshot names the study book, naming researchScope.js', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    let caught;
    try {
      planReattach({ snapshot: { ...snapshotWith([edit()]), book: 'efnafraedi-2e' }, booksDir });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('STUDY_BOOK');
    expect(caught.message).toContain('researchScope.js');
  });

  it('throws STUDY_BOOK when one row names the study book in a testbook snapshot', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    let caught;
    try {
      planReattach({ snapshot: snapshotWith([edit({ book: 'efnafraedi-2e' })]), booksDir });
    } catch (err) {
      caught = err;
    }
    expect(caught?.code).toBe('STUDY_BOOK');
    expect(caught.message).toContain('researchScope.js');
  });

  // "First", not merely "somewhere": with no booksDir at all, planning would die on
  // path.join(undefined, …) with a TypeError. A refusal placed after any planning
  // step would surface that TypeError instead of STUDY_BOOK.
  it('refuses before planning: no books directory is read', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    let caught;
    try {
      planReattach({
        snapshot: { ...snapshotWith([edit({ book: 'efnafraedi-2e' })]), book: 'efnafraedi-2e' },
        booksDir: undefined,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught?.code).toBe('STUDY_BOOK');
  });

  it('control, same fixture: the testbook snapshot plans with one restore', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    const plan = planReattach({ snapshot: snapshotWith([edit()]), booksDir });
    expect(plan.restore).toHaveLength(1);
  });
});

// PR1 review C16: a book on server/lib/servedText.js's not-minted list (Organic Chemistry, which
// is not translated: CLAUDE.md § Organic) is refused by every other writer, so this script refuses
// it too, before planning, with its own code. The list is read from servedText.js, never restated.
describe('planReattach refuses a not-minted book (PR1 review C16)', () => {
  it('throws BOOK_NOT_MINTED when the snapshot names organic, naming servedText.js', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    let caught;
    try {
      planReattach({
        snapshot: { ...snapshotWith([edit()]), book: 'lifraen-efnafraedi' },
        booksDir,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('BOOK_NOT_MINTED');
    expect(caught.message).toContain('servedText.js');
  });

  it('throws BOOK_NOT_MINTED when one row names organic in a testbook snapshot', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    let caught;
    try {
      planReattach({ snapshot: snapshotWith([edit({ book: 'lifraen-efnafraedi' })]), booksDir });
    } catch (err) {
      caught = err;
    }
    expect(caught?.code).toBe('BOOK_NOT_MINTED');
    expect(caught.message).toContain('servedText.js');
  });

  // Same "first" witness as the study book's: with no booksDir, any planning step dies on
  // path.join(undefined, …) with a TypeError instead.
  it('refuses before planning: no books directory is read', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    let caught;
    try {
      planReattach({
        snapshot: {
          ...snapshotWith([edit({ book: 'lifraen-efnafraedi' })]),
          book: 'lifraen-efnafraedi',
        },
        booksDir: undefined,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught?.code).toBe('BOOK_NOT_MINTED');
  });

  it('control, same fixture: the testbook snapshot plans with one restore', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný vélþýðing\n');
    const plan = planReattach({ snapshot: snapshotWith([edit()]), booksDir });
    expect(plan.restore).toHaveLength(1);
  });
});

describe('planReattach — colliding keys must be visible in the DRY RUN', () => {
  // The runbook runs the dry run first and the apply second. A dry run that
  // reports success while the apply refuses is a rehearsal that lies, so the
  // plan has to predict the refusal, not just the write path enforce it.
  const colliding = () =>
    snapshotWith([
      edit({ id: 1, status: 'approved', edited_content: 'GÖMUL-SAMÞYKKT' }),
      edit({ id: 2, status: 'pending', edited_content: 'NÝRRI-Í-BIÐ' }),
    ]);

  it('surfaces the colliding key on the plan', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný\n');
    const plan = planReattach({ snapshot: colliding(), booksDir });
    expect(plan.duplicateKeys).toEqual([
      { key: 'testbook/m001/m001:para:fs-id1/u1', count: 2 },
    ]);
  });

  it('still reconciles — a collision is metadata about the rows, not a lost bucket', async () => {
    const { planReattach } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný\n');
    const plan = planReattach({ snapshot: colliding(), booksDir });
    expect(plan.reconciliation.ok).toBe(true);
  });
});

describe('formatReport', () => {
  it('names every unmatched segment id — the report must FIRE, not merely omit a row', async () => {
    const { planReattach, formatReport } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:DIFFERENT -->\nný\n');
    const plan = planReattach({ snapshot: snapshotWith([edit()]), booksDir });
    const report = formatReport(plan);
    expect(report).toContain('m001:para:fs-id1');
    expect(report).toContain('English one');
  });

  it('reports a colliding key as FATAL, so the operator stops before the apply', async () => {
    const { planReattach, formatReport } = await import('../reattach-segment-edits.js');
    writeMt('m001', 'ch01', '<!-- SEG:m001:para:fs-id1 -->\nný\n');
    const plan = planReattach({
      snapshot: snapshotWith([
        edit({ id: 1, status: 'approved' }),
        edit({ id: 2, status: 'pending' }),
      ]),
      booksDir,
    });
    const report = formatReport(plan);
    expect(report).toContain('FATAL');
    expect(report).toContain('testbook/m001/m001:para:fs-id1/u1');
  });
});
