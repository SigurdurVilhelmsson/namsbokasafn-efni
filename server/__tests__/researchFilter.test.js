import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'research-filter-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
afterAll(() => rmSync(work, { recursive: true, force: true }));

const freshMigratedDb = require('./helpers/freshMigratedDb');
const { sha256Text } = require('../lib/servedText');
const { canonicalJson } = require('../lib/canonicalJson');
const vocab = require('../lib/researchVocabulary');
const {
  BEFORE_FIELD_CLASSES,
  DETAIL_TEXT_KEYS,
  freeText,
  filterContent,
  filterBefore,
  filterDetail,
  buildItemRows,
} = require('../lib/researchFilter');

// The editing columns of PR1 Task 3 (restated: researchBoundary.test.js keeps its own copy file-local).
const SEGMENT_EDITS_COLUMNS = [
  'id',
  'book',
  'chapter',
  'module_id',
  'segment_id',
  'original_content',
  'edited_content',
  'category',
  'editor_note',
  'status',
  'editor_id',
  'editor_username',
  'reviewer_id',
  'reviewer_username',
  'reviewer_note',
  'created_at',
  'reviewed_at',
  'applied_at',
  'review_id',
  'served_version_id',
  'occurrence',
  'origin',
  'displayed_edit_id',
  'displayed_edit_sha256',
];
const SEGMENT_ACCEPTANCES_COLUMNS = [
  'id',
  'book',
  'chapter',
  'module_id',
  'segment_id',
  'accepted_content',
  'accepted_by',
  'accepted_by_username',
  'accepted_at',
  'status',
  'superseded_at',
  'superseded_reason',
  'applied_at',
  'served_version_id',
  'occurrence',
];

describe("the vocabularies are the spec's, exactly", () => {
  it('has the exact values and is frozen', () => {
    expect(vocab.EVENT_TYPES).toEqual([
      'module-opened',
      'edit-save',
      'edit-resave',
      'edit-withdraw',
      'edit-delete',
      'edit-approve',
      'edit-reject',
      'edit-discuss',
      'edit-unapprove',
      'edit-return-to-pending',
      'edit-comment',
      'module-submit',
      'review-complete',
      'apply',
      'restore',
      'propagation',
      'mt-accept',
      'mt-accept-revoke',
      'suggestion-reject',
      'suggestion-left-open',
      'write-refused',
    ]);
    expect(vocab.EDITING_KINDS).toEqual([
      'segment_edit',
      'segment_acceptance',
      'suggestion_rejection',
      'suggestion_left_open',
    ]);
    expect(vocab.ITEM_TYPES).toEqual([
      'repetition-insert',
      'term-insert',
      'markup-wrap',
      'ai-suggestion',
      'rule-suggestion',
      'draft-restore',
    ]);
    expect(vocab.ITEM_CLAIMS).toEqual(['validated', 'unverified', 'mismatch']);
    expect(vocab.ITEM_OUTCOME_BY_EVENT).toEqual({
      'edit-save': 'applied',
      'edit-resave': 'applied',
      'suggestion-reject': 'rejected',
      'suggestion-left-open': 'left-open',
    });
    expect(vocab.LOSS_ERROR_CLASSES).toEqual([
      'unavailable',
      'busy',
      'constraint',
      'consent-unknown',
      'other',
    ]);
  });

  it('every array and the outcome map are frozen', () => {
    for (const k of [
      'EVENT_TYPES',
      'EDITING_KINDS',
      'ITEM_TYPES',
      'ITEM_CLAIMS',
      'LOSS_ERROR_CLASSES',
    ]) {
      expect(Object.isFrozen(vocab[k])).toBe(true);
    }
    expect(Object.isFrozen(vocab.ITEM_OUTCOME_BY_EVENT)).toBe(true);
  });
});

describe('freeText', () => {
  it('reduces to code-point length and hash; empty and null to null', () => {
    expect(freeText('Sjá Jón 🙂')).toEqual({ length: 9, sha256: sha256Text('Sjá Jón 🙂') });
    expect(freeText('')).toBeNull();
    expect(freeText(null)).toBeNull();
    expect(freeText(undefined)).toBeNull();
  });
});

describe('filterContent (spec §5.9: no free text)', () => {
  it('hashes the note and keeps text and category', () => {
    const out = filterContent({ text: 'Ný þýðing', note: 'Sjá Jón 🙂', category: 'terminology' });
    expect(JSON.parse(out)).toEqual({
      category: 'terminology',
      note: { length: 9, sha256: sha256Text('Sjá Jón 🙂') },
      text: 'Ný þýðing',
    });
    expect(out).not.toContain('Jón');
    expect(out).toContain('Ný þýðing');
  });

  it('treats comment likewise, empty and null as null, and null content as null', () => {
    expect(JSON.parse(filterContent({ comment: 'Sjá Jón' })).comment).toEqual({
      length: 7,
      sha256: sha256Text('Sjá Jón'),
    });
    expect(JSON.parse(filterContent({ note: '' })).note).toBeNull();
    expect(JSON.parse(filterContent({ note: null })).note).toBeNull();
    expect(filterContent(null)).toBeNull();
  });

  it('throws on an unknown key', () => {
    expect(() => filterContent({ text: 'x', editorNote: 'y' })).toThrow(TypeError);
  });

  it('decision 65: a text another editor holds as a live edit is stored as textSha256', () => {
    const c = { text: 'Ný þýðing', category: 'terminology' };
    const out = filterContent(c, { withheld: new Set(['Ný þýðing']) });
    expect(JSON.parse(out)).toEqual({
      category: 'terminology',
      textSha256: sha256Text('Ný þýðing'),
    });
    expect(out).not.toContain('Ný þýðing');
    expect(JSON.parse(filterContent(c, { withheld: new Set(['Ný þýðing ']) })).text).toBe(
      'Ný þýðing'
    );
    expect(JSON.parse(filterContent(c)).text).toBe('Ný þýðing');
  });

  it('a caller-sent textSha256 throws (only record withholds)', () => {
    expect(() => filterContent({ textSha256: 'a'.repeat(64) })).toThrow(TypeError);
  });
});

describe('filterBefore: the field table (spec §5.9) and decisions 9–10', () => {
  const R = {
    id: 1,
    book: 'efnafraedi',
    chapter: 3,
    module_id: 'm1',
    segment_id: 'para:a',
    original_content: 'MT',
    edited_content: 'Texti höfundar',
    category: 'terminology',
    editor_note: 'athugasemd',
    status: 'approved',
    editor_id: 'p-author',
    editor_username: 'höfundur',
    reviewer_id: 'p-rev',
    reviewer_username: 'rýnir',
    reviewer_note: 'rýni',
    created_at: '2026-11-01 10:00:00',
    reviewed_at: '2026-11-02 11:00:00',
    applied_at: '2026-11-02 12:00:00',
    review_id: 4,
    served_version_id: 7,
    occurrence: 0,
    origin: 'editor-save',
    displayed_edit_id: 9,
    displayed_edit_sha256: 'd'.repeat(64),
  };
  const parse = (s) => JSON.parse(s);

  it('the author as actor keeps their text and their own time; identity is never stored', () => {
    const out = parse(filterBefore({ table: 'segment_edits', row: R }, 'p-author'));
    expect(out).toEqual([
      {
        table: 'segment_edits',
        row: {
          id: 1,
          book: 'efnafraedi',
          chapter: 3,
          module_id: 'm1',
          segment_id: 'para:a',
          category: 'terminology',
          status: 'approved',
          served_version_id: 7,
          occurrence: 0,
          origin: 'editor-save',
          displayed_edit_id: 9,
          displayed_edit_sha256: 'd'.repeat(64),
          edited_content: 'Texti höfundar',
          editor_note: { length: 10, sha256: sha256Text('athugasemd') },
          reviewer_note: { length: 4, sha256: sha256Text('rýni') },
          created_at: '2026-11-01 10:00:00',
          applied: true,
        },
      },
    ]);
    const row = out[0].row;
    for (const k of [
      'editor_id',
      'editor_username',
      'reviewer_id',
      'reviewer_username',
      'reviewed_at',
      'applied_at',
      'original_content',
      'review_id',
    ]) {
      expect(row).not.toHaveProperty(k);
    }
  });

  it('a reviewer as actor gets the text as a hash and keeps only their own time', () => {
    const row = parse(filterBefore({ table: 'segment_edits', row: R }, 'p-rev'))[0].row;
    expect(row.edited_content_sha256).toBe(sha256Text('Texti höfundar'));
    expect(row).not.toHaveProperty('edited_content');
    expect(row.reviewed_at).toBe('2026-11-02 11:00:00');
    expect(row).not.toHaveProperty('created_at');
  });

  it('a third person keeps neither time', () => {
    const s = filterBefore({ table: 'segment_edits', row: R }, 'p-other');
    const row = parse(s)[0].row;
    expect(row).not.toHaveProperty('created_at');
    expect(row).not.toHaveProperty('reviewed_at');
    for (const bad of ['p-author', 'p-rev', 'Texti höfundar', 'athugasemd', 'MT']) {
      expect(s).not.toContain(bad);
    }
  });

  it('ids compare as strings, as acceptanceService does', () => {
    const row = parse(
      filterBefore({ table: 'segment_edits', row: { ...R, editor_id: 42 } }, '42')
    )[0].row;
    expect(row.edited_content).toBe('Texti höfundar');
  });

  it('a string actor compared with a numeric id and a numeric actor with a string id', () => {
    const row = parse(
      filterBefore({ table: 'segment_edits', row: { ...R, editor_id: '42' } }, 42)
    )[0].row;
    expect(row.edited_content).toBe('Texti höfundar');
  });

  it('displayed_edit_sha256 is kept only as 64 lowercase hex, else null (final review I1)', () => {
    const shown = (v) =>
      parse(
        filterBefore({ table: 'segment_edits', row: { ...R, displayed_edit_sha256: v } }, 'p-rev')
      )[0].row.displayed_edit_sha256;
    expect(shown('d'.repeat(64))).toBe('d'.repeat(64));
    expect(shown(null)).toBeNull();
    expect(shown('RAW-SENTINEL texti')).toBeNull();
    expect(shown('D'.repeat(64))).toBeNull();
    expect(shown('d'.repeat(63))).toBeNull();
    expect(shown(42)).toBeNull();
  });

  it("decision 65: the author's own text that another editor holds live is stored as its hash", () => {
    const row = parse(
      filterBefore({ table: 'segment_edits', row: R }, 'p-author', {
        withheld: new Set(['Texti höfundar']),
      })
    )[0].row;
    expect(row.edited_content_sha256).toBe(sha256Text('Texti höfundar'));
    expect(row).not.toHaveProperty('edited_content');
    expect(row.created_at).toBe('2026-11-01 10:00:00');
  });

  it('an acceptance row', () => {
    const A = {
      id: 5,
      book: 'efnafraedi',
      chapter: 3,
      module_id: 'm1',
      segment_id: 'para:a',
      accepted_content: 'MT',
      accepted_by: 'p-acc',
      accepted_by_username: 'sam',
      accepted_at: '2026-11-01 09:00:00',
      status: 'superseded',
      superseded_at: '2026-11-01 09:30:00',
      superseded_reason: 'edit',
      applied_at: null,
      served_version_id: 7,
      occurrence: 0,
    };
    const base = {
      id: 5,
      book: 'efnafraedi',
      chapter: 3,
      module_id: 'm1',
      segment_id: 'para:a',
      status: 'superseded',
      superseded_reason: 'edit',
      served_version_id: 7,
      occurrence: 0,
      applied: false,
    };
    expect(parse(filterBefore({ table: 'segment_acceptances', row: A }, 'p-acc'))[0].row).toEqual({
      ...base,
      accepted_at: '2026-11-01 09:00:00',
    });
    expect(parse(filterBefore({ table: 'segment_acceptances', row: A }, 'p-other'))[0].row).toEqual(
      base
    );
  });

  it('an array stays an array, a single entry becomes one; unknown column dropped; unknown table throws', () => {
    const one = { table: 'segment_edits', row: { ...R, mystery: 'x' } };
    const two = { table: 'segment_acceptances', row: { id: 2, mystery: 'y' } };
    const arr = parse(filterBefore([one, two], 'p-author'));
    expect(arr).toHaveLength(2);
    expect(arr[1]).toEqual({ table: 'segment_acceptances', row: { id: 2 } });
    expect(filterBefore([one, two], 'p-author')).not.toContain('mystery');
    expect(parse(filterBefore(one, 'p-author'))).toHaveLength(1);
    expect(() => filterBefore({ table: 'users', row: { id: 1 } }, 'p')).toThrow(TypeError);
    expect(filterBefore(null, 'p')).toBeNull();
  });

  it('the classification keys equal the columns restated from PR1 Task 3', () => {
    expect(Object.keys(BEFORE_FIELD_CLASSES.segment_edits).sort()).toEqual(
      [...SEGMENT_EDITS_COLUMNS].sort()
    );
    expect(Object.keys(BEFORE_FIELD_CLASSES.segment_acceptances).sort()).toEqual(
      [...SEGMENT_ACCEPTANCES_COLUMNS].sort()
    );
  });

  it('every column of both tables is classified (drift guard)', () => {
    const { db } = freshMigratedDb();
    const unclassified = (table) =>
      db
        .pragma(`table_info(${table})`)
        .map((c) => c.name)
        .filter((n) => !(n in BEFORE_FIELD_CLASSES[table]))
        .sort();
    for (const table of Object.keys(BEFORE_FIELD_CLASSES)) {
      const have = db
        .pragma(`table_info(${table})`)
        .map((c) => c.name)
        .sort();
      expect(have).toEqual(Object.keys(BEFORE_FIELD_CLASSES[table]).sort());
    }
    db.exec('ALTER TABLE segment_edits ADD COLUMN planted_col TEXT');
    expect(unclassified('segment_edits')).toEqual(['planted_col']);
  });
});

describe("filterDetail (decision 54's previewText; decision 65)", () => {
  it('DETAIL_TEXT_KEYS is the one place a detail carries a text, frozen', () => {
    expect(DETAIL_TEXT_KEYS).toEqual({ propagation: ['previewText'] });
    expect(Object.isFrozen(DETAIL_TEXT_KEYS)).toBe(true);
    expect(Object.isFrozen(DETAIL_TEXT_KEYS.propagation)).toBe(true);
  });

  const d = { previewText: 'X', previewSha256: sha256Text('X'), previewSource: 'own-edit' };
  it('drops a withheld previewText and keeps the hash beside it', () => {
    expect(JSON.parse(filterDetail('propagation', d, { withheld: new Set(['X']) }))).toEqual({
      previewSha256: sha256Text('X'),
      previewSource: 'own-edit',
    });
  });

  it('keeps it otherwise', () => {
    expect(
      JSON.parse(filterDetail('propagation', d, { withheld: new Set(['Y']) })).previewText
    ).toBe('X');
    expect(
      JSON.parse(filterDetail('edit-save', { previewText: 'X' }, { withheld: new Set(['X']) }))
        .previewText
    ).toBe('X');
    expect(filterDetail('apply', null)).toBeNull();
    expect(filterDetail('propagation', d)).toBe(canonicalJson(d));
  });
});

describe('buildItemRows (spec §5.10)', () => {
  it('builds the rows of a save', () => {
    const rows = buildItemRows('edit-save', [
      {
        itemType: 'repetition-insert',
        source: 'tm',
        clientTimeMs: 5.7,
        detail: { text: 'Heill texti', sha256: 'e'.repeat(64) },
        claim: 'validated',
      },
      {
        itemType: 'draft-restore',
        source: null,
        clientTimeMs: 9,
        detail: { legacy: true, text: 'gamalt' },
        claim: 'unverified',
      },
    ]);
    const nulls = {
      op_id: null,
      occurrence: null,
      category: null,
      run_id: null,
      group_action_id: null,
      ruling_id: null,
      rule_id: null,
    };
    expect(rows).toEqual([
      {
        ordinal: 0,
        item_type: 'repetition-insert',
        outcome: 'applied',
        source: 'tm',
        ...nulls,
        client_time_ms: 5,
        claim: 'validated',
        detail_json: `{"sha256":"${'e'.repeat(64)}","text":"Heill texti"}`,
      },
      {
        ordinal: 1,
        item_type: 'draft-restore',
        outcome: 'applied',
        source: null,
        ...nulls,
        client_time_ms: 9,
        claim: 'unverified',
        detail_json: '{"legacy":true,"text":"gamalt"}',
      },
    ]);
  });

  it('accepts clientTimeMs null and a detail of { marker: null }', () => {
    const [row] = buildItemRows('edit-save', [
      {
        itemType: 'markup-wrap',
        source: null,
        clientTimeMs: null,
        detail: { marker: null },
        claim: 'unverified',
      },
    ]);
    expect(row.client_time_ms).toBeNull();
    expect(row.detail_json).toBe('{"marker":null}');
  });

  it('fills the columns of a suggestion-reject item', () => {
    const [row] = buildItemRows('suggestion-reject', [
      {
        itemType: 'rule-suggestion',
        source: null,
        clientTimeMs: 1,
        detail: null,
        claim: 'unverified',
        opId: 't.op1',
        occurrence: 0,
        category: 'term',
        runId: null,
        groupActionId: 'g1',
        ruleId: 'r7',
      },
    ]);
    expect(row).toMatchObject({
      outcome: 'rejected',
      op_id: 't.op1',
      occurrence: 0,
      category: 'term',
      run_id: null,
      group_action_id: 'g1',
      ruling_id: null,
      rule_id: 'r7',
      detail_json: null,
    });
  });

  const ok = {
    itemType: 'term-insert',
    source: null,
    clientTimeMs: 1,
    detail: null,
    claim: 'validated',
  };
  it('throws on items outside the rules', () => {
    expect(() => buildItemRows('mt-accept', [ok])).toThrow(TypeError);
    expect(() => buildItemRows('edit-save', [{ ...ok, itemType: 'paste' }])).toThrow(TypeError);
    expect(() => buildItemRows('edit-save', [{ ...ok, claim: 'trusted' }])).toThrow(TypeError);
    const noClaim = { ...ok };
    delete noClaim.claim;
    expect(() => buildItemRows('edit-save', [noClaim])).toThrow(TypeError);
    expect(() => buildItemRows('edit-save', [{ ...ok, author: 'x' }])).toThrow(TypeError);
  });

  it('returns [] for null and []', () => {
    expect(buildItemRows('edit-save', null)).toEqual([]);
    expect(buildItemRows('edit-save', [])).toEqual([]);
  });
});
