/**
 * saveOnServedBase and its refusals (G1.1; spec §5.6 steps 1–6, §5.7, §5.10, R4; T4's, T5's and
 * T18's service halves; plan Task 13, decisions 5–9, 20 and 39).
 *
 * A real migrated database (SESSIONS_DB_PATH in a temp dir, runAllMigrations), so the foreign key
 * from segment_edits.served_version_id is live, and synthetic modules under a temp books root. The
 * two committed modules with a duplicated id (m68726, m68747) are COPIED into that root, so no
 * write can reach books/: the first-edit MT lock is written beside the temp copy.
 *
 * Every refusal compares the whole edit table and the served-version id list before and after, by
 * value, so a refusal that wrote anything fails. Every negative case has a positive control that
 * writes, so a service that refused everything could not pass.
 */
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_BOOKS = path.resolve(__dirname, '..', '..', 'books');

// Env BEFORE any server require: resolveDbPath() is read at module load.
const work = mkdtempSync(path.join(tmpdir(), 'served-edit-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');

const { sha256Text } = require('../lib/servedText');
const { writeModule } = require('./helpers/servedFixture');

const CHEM = 'efnafraedi-2e';
const ORGANIC = 'lifraen-efnafraedi';
const SEG = (id) => `m91001:para:${id}`;
const KEY = Object.freeze({ book: CHEM, chapter: 1, moduleId: 'm91001' });

const M91001_EN = [
  [SEG('a'), 'EN a'],
  [SEG('b'), 'Some [[MATH:1]] x.'],
  [SEG('c'), 'F [[MATH:2]].'], // degraded: the Icelandic lost the marker
  [SEG('d'), 'EN d'],
  [SEG('d'), 'EN d'],
  [SEG('e'), 'EN e'], // only the step 6 transaction test touches it, so nothing earlier mints it
];
const M91001_MT = [
  [SEG('a'), 'IS a'],
  [SEG('b'), 'Eitthvað [[MATH:1]] x.'],
  [SEG('c'), 'F.'],
  [SEG('d'), 'IS d1'],
  [SEG('d'), 'IS d2'],
  [SEG('e'), 'IS e'],
];

/** Rewrites m91001 from its literal; `isOverrides` replaces one id's Icelandic. */
function writeM91001(isOverrides = {}) {
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: 'm91001',
    en: M91001_EN,
    mt: M91001_MT.map(([id, text]) => [id, isOverrides[id] ?? text]),
  });
}

const KNOWN = [
  {
    chapter: 5,
    chapterDir: 'ch05',
    moduleId: 'm68726',
    segmentId: 'm68726:para:fs-idm94618544',
    markers: ['[[MATH:2]]', '[[MATH:3]]'], // what tells the two raw copies apart, first then last
  },
  {
    chapter: 8,
    chapterDir: 'ch08',
    moduleId: 'm68747',
    segmentId: 'm68747:para:fs-idm99049568',
    markers: ['hnútur sem', 'hnútyfirborð'],
  },
];

let root;
let realBooksDir;
let segmentParser;
let segmentEditor;
let servedVersions;
let servedEdit;
let db;

beforeAll(() => {
  const { runAllMigrations } = require('../services/migrationRunner');
  runAllMigrations();
  segmentParser = require('../services/segmentParser');
  segmentEditor = require('../services/segmentEditorService');
  servedVersions = require('../services/servedVersions');
  servedEdit = require('../services/servedEdit');
  realBooksDir = segmentParser.BOOKS_DIR;
  root = path.join(work, 'books');
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  segmentEditor._setTestBooksDir(root);
  db = segmentEditor.getDb();

  writeM91001();
  writeModule(root, {
    book: CHEM,
    chapterDir: 'ch01',
    moduleId: 'm91002',
    en: [['m91002:para:a', 'EN a']],
  });
  writeModule(root, {
    book: ORGANIC,
    chapterDir: 'ch01',
    moduleId: 'm91004',
    en: [['m91004:para:a', 'EN a']],
    mt: [['m91004:para:a', 'IS a']],
  });
  for (const k of KNOWN) {
    for (const [layer, ext] of [
      ['02-for-mt', 'en'],
      ['02-mt-output', 'is'],
    ]) {
      const rel = path.join(CHEM, layer, k.chapterDir, `${k.moduleId}-segments.${ext}.md`);
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      copyFileSync(path.join(REPO_BOOKS, rel), path.join(root, rel));
    }
  }
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  segmentEditor._setTestBooksDir(realBooksDir);
  segmentEditor.getDb().close();
  segmentEditor._setTestDb(null);
  rmSync(work, { recursive: true, force: true });
});

// Each test starts from the literal module and no edit rows, so no test depends on another's rows.
// Served versions accumulate on purpose: minting is idempotent, and the step 6 test proves its own
// segment was never minted before it.
beforeEach(() => {
  writeM91001();
  db.exec('DELETE FROM segment_acceptances; DELETE FROM segment_edits;');
});

const load = (book = CHEM, chapter = 1, moduleId = 'm91001') =>
  segmentParser.loadModuleForEditing(book, chapter, moduleId);
const served = (segmentId, book, chapter, moduleId) =>
  load(book, chapter, moduleId).segments.find((s) => s.segmentId === segmentId);
const base = (segmentId, book, chapter, moduleId) =>
  sha256Text(served(segmentId, book, chapter, moduleId).is);

/** An editor save on a; `baseSha256` defaults to the hash of the segment's current served text. */
function save(over = {}) {
  const input = {
    ...KEY,
    segmentId: SEG('a'),
    editedContent: 'IS a breytt',
    editorId: 'u1',
    editorUsername: 'E',
    origin: 'editor-save',
    requireEcho: true,
    ...over,
  };
  if (!('baseSha256' in over)) {
    input.baseSha256 = base(input.segmentId, input.book, input.chapter, input.moduleId);
  }
  return servedEdit.saveOnServedBase(input);
}

/** A writer with no client view: no echo, no base hash sent. */
const reattach = (over = {}) =>
  save({ requireEcho: false, origin: 're-attach', baseSha256: undefined, ...over });

function snap() {
  return {
    edits: db.prepare('SELECT * FROM segment_edits ORDER BY id').all(),
    versions: db.prepare('SELECT id FROM served_text_versions ORDER BY id').all(),
  };
}

const editRow = (id) => db.prepare('SELECT * FROM segment_edits WHERE id = ?').get(id);

/** Calls fn, expects the refusal `code`, and that nothing was written; returns the error. */
function refusedWith(fn, code) {
  const before = snap();
  let err = null;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err, `expected a ${code} refusal`).toBeInstanceOf(Error);
  expect(err.code).toBe(code);
  expect(err.message).toBe(servedEdit.REFUSAL_MESSAGES[code]);
  expect(err.refusal.code).toBe(code);
  expect(snap()).toEqual(before);
  return err;
}

const PLACEMENT_REFUSAL = (code) => ({ code, echoedSha256: null, currentSha256: null });

describe('the refusal vocabulary', () => {
  it('every code has a status and a message, and both tables are frozen', () => {
    expect(servedEdit.REFUSAL_STATUS).toEqual({
      BOOK_NOT_MINTED: 409,
      NO_LAYER: 409,
      DUPLICATE_ID: 409,
      BASE_MISSING: 409,
      STALE_BASE: 409,
      STALE_DISPLAYED: 409,
      SEGMENT_NOT_FOUND: 404,
      STRUCTURE_BLOCKED: 400,
    });
    expect(Object.keys(servedEdit.REFUSAL_MESSAGES).sort()).toEqual(
      Object.keys(servedEdit.REFUSAL_STATUS).sort()
    );
    for (const message of Object.values(servedEdit.REFUSAL_MESSAGES)) {
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    }
    expect(Object.isFrozen(servedEdit.REFUSAL_STATUS)).toBe(true);
    expect(Object.isFrozen(servedEdit.REFUSAL_MESSAGES)).toBe(true);
  });

  it('the two kept bodies are today’s, verbatim', () => {
    expect(servedEdit.REFUSAL_MESSAGES.SEGMENT_NOT_FOUND).toBe('segment not found');
    expect(servedEdit.REFUSAL_MESSAGES.STRUCTURE_BLOCKED).toBe(
      'Vistun hafnað: byggingarmerki vantar eða hafa breyst.'
    );
  });
});

describe('steps 1–3, in order (spec §5.6)', () => {
  it('BOOK_NOT_MINTED for organic, with a correct hash, before the load (T18)', () => {
    const organicBase = base('m91004:para:a', ORGANIC, 1, 'm91004');
    const err = refusedWith(
      () =>
        save({
          book: ORGANIC,
          moduleId: 'm91004',
          segmentId: 'm91004:para:a',
          baseSha256: organicBase,
        }),
      'BOOK_NOT_MINTED'
    );
    expect(err.refusal).toEqual(PLACEMENT_REFUSAL('BOOK_NOT_MINTED'));
    expect(db.prepare('SELECT id FROM served_text_versions WHERE book = ?').all(ORGANIC)).toEqual(
      []
    );
  });

  it('control: an organic module that does not exist is still BOOK_NOT_MINTED, not a not-found', () => {
    // The module really is absent: the loader itself throws for it.
    expect(() => load(ORGANIC, 1, 'm99999')).toThrow(/EN source not found/);
    refusedWith(
      () =>
        save({
          book: ORGANIC,
          moduleId: 'm99999',
          segmentId: 'm99999:para:a',
          baseSha256: sha256Text('x'),
        }),
      'BOOK_NOT_MINTED'
    );
  });

  it('NO_LAYER for a module with English only, whatever the segment', () => {
    const err = refusedWith(
      () => save({ moduleId: 'm91002', segmentId: 'm91002:para:a', baseSha256: sha256Text('') }),
      'NO_LAYER'
    );
    expect(err.refusal).toEqual(PLACEMENT_REFUSAL('NO_LAYER'));
    // Step 2 comes before step 3: an id that is not there is still NO_LAYER.
    refusedWith(
      () => save({ moduleId: 'm91002', segmentId: 'm91002:para:zz', baseSha256: sha256Text('') }),
      'NO_LAYER'
    );
  });

  it('SEGMENT_NOT_FOUND for an id not served, and for an occurrence the id does not have', () => {
    const err = refusedWith(
      () => save({ segmentId: SEG('zz'), baseSha256: base(SEG('a')) }),
      'SEGMENT_NOT_FOUND'
    );
    expect(err.message).toBe('segment not found');
    expect(err.refusal).toEqual(PLACEMENT_REFUSAL('SEGMENT_NOT_FOUND'));
    refusedWith(() => save({ occurrence: 1 }), 'SEGMENT_NOT_FOUND');
  });

  it('control: occurrence 0 on a single id places and saves', () => {
    const result = save({ occurrence: 0 });
    expect(result.outcome).toBe('inserted');
    expect(result.occurrence).toBe(0);
  });

  it('DUPLICATE_ID for a duplicated id, on the save and on the re-attach (T5)', () => {
    const err = refusedWith(
      () => save({ segmentId: SEG('d'), baseSha256: base(SEG('d')) }),
      'DUPLICATE_ID'
    );
    expect(err.refusal).toEqual(PLACEMENT_REFUSAL('DUPLICATE_ID'));
    refusedWith(() => reattach({ segmentId: SEG('d') }), 'DUPLICATE_ID');
    // Step 3 comes before step 4: no hash is DUPLICATE_ID, not BASE_MISSING.
    refusedWith(() => save({ segmentId: SEG('d'), baseSha256: undefined }), 'DUPLICATE_ID');
    // And whatever occurrence a caller names.
    refusedWith(
      () => save({ segmentId: SEG('d'), occurrence: 1, baseSha256: base(SEG('d')) }),
      'DUPLICATE_ID'
    );
  });
});

describe('T5, PR1 half: the two known duplicated ids, on copies of the committed modules (R4, spec §5.7)', () => {
  for (const k of KNOWN) {
    describe(`${k.chapterDir}/${k.moduleId}`, () => {
      const at = { book: CHEM, chapter: k.chapter, moduleId: k.moduleId, segmentId: k.segmentId };
      const noRows = () => {
        expect(
          db.prepare('SELECT * FROM segment_edits WHERE segment_id = ?').all(k.segmentId)
        ).toEqual([]);
        expect(
          db.prepare('SELECT * FROM served_text_versions WHERE segment_id = ?').all(k.segmentId)
        ).toEqual([]);
      };

      it('the save is refused DUPLICATE_ID', () => {
        refusedWith(
          () => save({ ...at, baseSha256: base(k.segmentId, CHEM, k.chapter, k.moduleId) }),
          'DUPLICATE_ID'
        );
        noRows();
      });

      it('the re-attach is refused DUPLICATE_ID', () => {
        refusedWith(() => reattach(at), 'DUPLICATE_ID');
        noRows();
      });

      it('both occurrences are served the last copy’s Icelandic, with no base, while the raw copies differ', () => {
        const loaded = load(CHEM, k.chapter, k.moduleId);
        const annotation = servedVersions.annotateServed(loaded, {
          book: CHEM,
          chapter: k.chapter,
          moduleId: k.moduleId,
        });
        expect(annotation.duplicatedIds).toContain(k.segmentId);
        const mine = loaded.segments
          .filter((s) => s.segmentId === k.segmentId)
          .map((s) => ({ occurrence: s.occurrence, hasBase: 'baseSha256' in s, is: s.is }));
        const X = mine[0].is;
        expect(mine).toEqual([
          { occurrence: 0, hasBase: false, is: X },
          { occurrence: 1, hasBase: false, is: X },
        ]);
        expect(annotation.rows.some((r) => r.segmentId === k.segmentId)).toBe(false);

        const raw = segmentParser
          .parseSegments(
            readFileSync(
              path.join(root, CHEM, '02-mt-output', k.chapterDir, `${k.moduleId}-segments.is.md`),
              'utf8'
            )
          )
          .filter((s) => s.segmentId === k.segmentId)
          .map((s) => s.content);
        expect(raw).toHaveLength(2);
        expect(raw[0]).not.toBe(raw[1]);
        const [first, last] = k.markers;
        expect(raw[0]).toContain(first);
        expect(raw[1]).toContain(last);
        // The served text is the LAST copy's, for both occurrences.
        expect(X).toContain(last);
        expect(X).not.toContain(first);
        noRows();
      });
    });
  }

  it('control: a non-duplicated sibling in the same module saves, and its served version exists', () => {
    const sibling = 'm68726:title:auto-1';
    const result = save({
      book: CHEM,
      chapter: 5,
      moduleId: 'm68726',
      segmentId: sibling,
      baseSha256: base(sibling, CHEM, 5, 'm68726'),
    });
    expect(result.outcome).toBe('inserted');
    const versions = db
      .prepare('SELECT id, chapter, is_text FROM served_text_versions WHERE segment_id = ?')
      .all(sibling);
    expect(versions).toEqual([
      { id: result.servedVersionId, chapter: 5, is_text: served(sibling, CHEM, 5, 'm68726').is },
    ]);
  });
});

describe('step 4, requireEcho (spec §5.6; T4 service half)', () => {
  /** u2's row on a, then re-saved, so a pair naming its first text is stale. */
  function staleU2Pair() {
    const first = save({ editorId: 'u2', editorUsername: 'E2', editedContent: 'IS a frá u2' });
    save({ editorId: 'u2', editorUsername: 'E2', editedContent: 'IS a frá u2, aftur' });
    return { displayedEditId: first.editId, displayedEditSha256: sha256Text('IS a frá u2') };
  }

  it('no baseSha256 and a stale displayed pair: BASE_MISSING, checked first', () => {
    const pair = staleU2Pair();
    const err = refusedWith(() => save({ baseSha256: undefined, ...pair }), 'BASE_MISSING');
    expect(err.refusal).toEqual({
      code: 'BASE_MISSING',
      echoedSha256: null,
      currentSha256: base(SEG('a')),
    });
    // An empty or non-string hash counts as absent.
    refusedWith(() => save({ baseSha256: '' }), 'BASE_MISSING');
    refusedWith(() => save({ baseSha256: 42 }), 'BASE_MISSING');
  });

  it('a wrong baseSha256 and a stale displayed pair: STALE_BASE, before the displayed check', () => {
    const pair = staleU2Pair();
    const sent = sha256Text('not the base');
    const err = refusedWith(() => save({ baseSha256: sent, ...pair }), 'STALE_BASE');
    expect(err.refusal).toEqual({
      code: 'STALE_BASE',
      echoedSha256: sent,
      currentSha256: base(SEG('a')),
    });
  });

  it('the base file changed between serve and save: STALE_BASE', () => {
    const loaded = load();
    servedVersions.annotateServed(loaded, KEY);
    const old = loaded.segments.find((s) => s.segmentId === SEG('a')).baseSha256;
    expect(old).toBe(sha256Text('IS a'));
    writeM91001({ [SEG('a')]: 'IS a nýtt' });
    const err = refusedWith(() => save({ baseSha256: old }), 'STALE_BASE');
    expect(err.refusal).toEqual({
      code: 'STALE_BASE',
      echoedSha256: old,
      currentSha256: sha256Text('IS a nýtt'),
    });
  });

  it('the displayed row was deleted (its author withdrew it): STALE_DISPLAYED', () => {
    const gone = save({ editorId: 'u2', editorUsername: 'E2', editedContent: 'IS a frá u2' });
    const w = save({ editorId: 'u2', editorUsername: 'E2', editedContent: served(SEG('a')).is });
    expect(w.outcome).toBe('withdrawn');
    expect(editRow(gone.editId)).toBeUndefined();
    const err = refusedWith(
      () => save({ displayedEditId: gone.editId, displayedEditSha256: sha256Text('IS a frá u2') }),
      'STALE_DISPLAYED'
    );
    expect(err.refusal).toEqual({
      code: 'STALE_DISPLAYED',
      echoedSha256: sha256Text('IS a frá u2'),
      currentSha256: null,
    });
    // A gone row is refused even when the echoed hash is null too: null never equals null here.
    refusedWith(
      () => save({ displayedEditId: gone.editId, displayedEditSha256: null }),
      'STALE_DISPLAYED'
    );
  });

  it('the displayed row is on another segment: STALE_DISPLAYED, even with a matching hash', () => {
    // Legacy direct writes on b (no backstop on that path), so their text can be anything.
    const onB = segmentEditor.saveSegmentEdit({
      ...KEY,
      segmentId: SEG('b'),
      originalContent: served(SEG('b')).is,
      editedContent: 'IS b frá u2',
      editorId: 'u2',
      editorUsername: 'E2',
    });
    const err = refusedWith(
      () =>
        save({ displayedEditId: Number(onB.id), displayedEditSha256: sha256Text('IS b frá u2') }),
      'STALE_DISPLAYED'
    );
    expect(err.refusal).toEqual({
      code: 'STALE_DISPLAYED',
      echoedSha256: sha256Text('IS b frá u2'),
      currentSha256: null,
    });
  });

  it('decision 7 before decision 39: a row on another segment holding exactly the saved text is refused', () => {
    const onB = segmentEditor.saveSegmentEdit({
      ...KEY,
      segmentId: SEG('b'),
      originalContent: served(SEG('b')).is,
      editedContent: 'IS a breytt', // exactly the save's editedContent
      editorId: 'u3',
      editorUsername: 'E3',
    });
    expect(editRow(Number(onB.id)).edited_content).toBe('IS a breytt');
    const err = refusedWith(
      () =>
        save({ displayedEditId: Number(onB.id), displayedEditSha256: sha256Text('IS a breytt') }),
      'STALE_DISPLAYED'
    );
    expect(err.refusal.currentSha256).toBeNull();
  });

  it('editor 2’s row on a was re-saved after the echo, to another text: STALE_DISPLAYED', () => {
    const first = save({ editorId: 'u2', editorUsername: 'E2', editedContent: 'IS a gamalt' });
    const again = save({
      editorId: 'u2',
      editorUsername: 'E2',
      editedContent: 'IS a nýrra',
      displayedEditId: first.editId,
      displayedEditSha256: sha256Text('IS a gamalt'),
    });
    expect(again).toMatchObject({ outcome: 'updated', editId: first.editId });
    const err = refusedWith(
      () => save({ displayedEditId: first.editId, displayedEditSha256: sha256Text('IS a gamalt') }),
      'STALE_DISPLAYED'
    );
    expect(err.refusal).toEqual({
      code: 'STALE_DISPLAYED',
      echoedSha256: sha256Text('IS a gamalt'),
      currentSha256: sha256Text('IS a nýrra'),
    });
    // A set id with a null hash differs too (decision 7).
    refusedWith(
      () => save({ displayedEditId: first.editId, displayedEditSha256: null }),
      'STALE_DISPLAYED'
    );
  });
});

describe('a save that passes (T4 positive controls)', () => {
  it('base displayed: the row stores the server’s base and its served version', () => {
    const segA = served(SEG('a'));
    const result = save();
    expect(result).toEqual({
      outcome: 'inserted',
      editId: expect.any(Number),
      servedVersionId: expect.any(Number),
      occurrence: 0,
      baseSha256: base(SEG('a')),
      layer: 'mt-output',
      editedContentSha256: sha256Text('IS a breytt'),
      displayed: { editId: null, sha256: null },
    });
    const row = editRow(result.editId);
    expect(row.original_content).toBe(segA.is); // the server's base; no caller value exists
    expect(row.edited_content).toBe('IS a breytt');
    expect(row.served_version_id).toBe(result.servedVersionId);
    expect(row.occurrence).toBe(0);
    expect(row.origin).toBe('editor-save');
    expect([row.displayed_edit_id, row.displayed_edit_sha256]).toEqual([null, null]);
    const v = db
      .prepare('SELECT * FROM served_text_versions WHERE id = ?')
      .get(result.servedVersionId);
    expect(v).toMatchObject({
      book: CHEM,
      chapter: 1,
      module_id: 'm91001',
      segment_id: SEG('a'),
      occurrence: 0,
      en_text: 'EN a',
      en_sha256: sha256Text('EN a'),
      is_text: segA.is,
      is_sha256: base(SEG('a')),
      layer: 'mt-output',
    });
  });

  it('another editor’s in-flight edit displayed: the new row stores that pair', () => {
    const text2 = 'IS a frá u2';
    const two = save({ editorId: 'u2', editorUsername: 'E2', editedContent: text2 });
    const result = save({ displayedEditId: two.editId, displayedEditSha256: sha256Text(text2) });
    expect(result.outcome).toBe('inserted');
    expect(result.displayed).toEqual({ editId: two.editId, sha256: sha256Text(text2) });
    const row = editRow(result.editId);
    expect([row.displayed_edit_id, row.displayed_edit_sha256]).toEqual([
      two.editId,
      sha256Text(text2),
    ]);
  });

  it('a withdraw is decided by the server’s base', () => {
    const first = save();
    expect(first.outcome).toBe('inserted');
    const baseText = served(SEG('a')).is;
    const w = save({ editedContent: baseText });
    expect(w).toMatchObject({
      outcome: 'withdrawn',
      editId: first.editId,
      editedContentSha256: null,
    });
    expect(editRow(first.editId)).toBeUndefined();
    const again = save({ editedContent: baseText });
    expect(again).toMatchObject({ outcome: 'unchanged', editId: null, editedContentSha256: null });
    // Step 6 mints even when nothing is written (decision 8), and the mint is idempotent.
    expect(again.servedVersionId).toBe(first.servedVersionId);
  });

  it('a re-save after the base changed moves original_content and the served version', () => {
    const first = save();
    writeM91001({ [SEG('a')]: 'IS a2' });
    const second = save();
    expect(second).toMatchObject({
      outcome: 'updated',
      editId: first.editId,
      baseSha256: sha256Text('IS a2'),
    });
    const row = editRow(first.editId);
    expect(row.original_content).toBe('IS a2');
    expect(row.served_version_id).toBe(second.servedVersionId);
    expect(second.servedVersionId).not.toBe(first.servedVersionId);
  });
});

describe('step 5, the backstop, for every caller (index decision 16)', () => {
  it('a re-attach that drops a marker is STRUCTURE_BLOCKED', () => {
    const stripped = served(SEG('b')).is.replace('[[MATH:1]] ', '');
    expect(stripped).toBe('Eitthvað x.');
    const err = refusedWith(
      () => reattach({ segmentId: SEG('b'), editedContent: stripped }),
      'STRUCTURE_BLOCKED'
    );
    expect(err.message).toBe('Vistun hafnað: byggingarmerki vantar eða hafa breyst.');
    expect(err.violations).toContainEqual(expect.objectContaining({ code: 'math-missing' }));
    expect(err.refusal).toEqual(PLACEMENT_REFUSAL('STRUCTURE_BLOCKED'));
  });

  it('control: the same re-attach keeping the marker is written', () => {
    const result = reattach({ segmentId: SEG('b'), editedContent: 'Eitthvað annað [[MATH:1]] x.' });
    expect(result.outcome).toBe('inserted');
  });

  it('an identity save on the degraded c passes', () => {
    const result = save({ segmentId: SEG('c'), editedContent: served(SEG('c')).is });
    expect(result.outcome).toBe('unchanged');
  });
});

describe('step 6', () => {
  it('a re-attached row carries its served version and origin', () => {
    // A displayed pair is stored only when the echo is required (decision 7).
    const result = reattach({ displayedEditId: 12345, displayedEditSha256: sha256Text('x') });
    expect(result.outcome).toBe('inserted');
    const row = editRow(result.editId);
    expect(row.origin).toBe('re-attach');
    expect(row.served_version_id).not.toBeNull();
    expect(row.served_version_id).toBe(result.servedVersionId);
    expect([row.displayed_edit_id, row.displayed_edit_sha256]).toEqual([null, null]);
    expect(result.displayed).toEqual({ editId: null, sha256: null });
  });

  it('mint and save are one transaction', () => {
    const versionsOfE = () =>
      db.prepare('SELECT id FROM served_text_versions WHERE segment_id = ?').all(SEG('e'));
    expect(versionsOfE()).toEqual([]);
    const before = snap();
    // NOT NULL on editor_id fails inside saveSegmentEdit, after the mint.
    expect(() => save({ segmentId: SEG('e'), editorId: null })).toThrow(/NOT NULL/);
    expect(versionsOfE()).toEqual([]);
    expect(snap().edits).toEqual(before.edits);

    // Positive control, same segment: the mint would have inserted a row.
    const result = save({ segmentId: SEG('e'), editorId: 'u3' });
    expect(result.outcome).toBe('inserted');
    expect(versionsOfE()).toEqual([{ id: result.servedVersionId }]);
    expect(db.prepare('SELECT id FROM segment_edits WHERE segment_id = ?').all(SEG('e'))).toEqual([
      { id: result.editId },
    ]);
  });

  it('an unknown origin is a programming error', () => {
    for (const origin of ['typo', 'note-apply', 'propagated', 'ai-pass', undefined]) {
      const before = snap();
      expect(() => save({ origin })).toThrow(TypeError);
      expect(snap()).toEqual(before);
    }
  });

  it('a non-boolean requireEcho or a non-string editedContent is a programming error', () => {
    const before = snap();
    expect(() => save({ requireEcho: 'yes' })).toThrow(TypeError);
    expect(() => save({ editedContent: 42 })).toThrow(TypeError);
    expect(snap()).toEqual(before);
  });
});

// Last in the file, so it disturbs no other describe's rows on a.
describe('decision 39: a replay whose first attempt landed (spec AMENDED 2026-11-04)', () => {
  let D;
  let first;
  const firstInput = () => ({
    editedContent: 'IS a v2',
    displayedEditId: D,
    displayedEditSha256: sha256Text('IS a v1'),
  });

  beforeEach(() => {
    writeM91001();
    db.prepare('DELETE FROM segment_edits WHERE segment_id = ?').run(SEG('a'));
    const v1 = save({ editedContent: 'IS a v1' });
    expect(v1.outcome).toBe('inserted');
    D = v1.editId;
    first = save(firstInput());
    expect(first).toMatchObject({ outcome: 'updated', editId: D });
  });

  /** The snapshot with D's created_at blanked: a re-save moves it, as today. */
  const exceptCreatedAtOfD = (s) => ({
    ...s,
    edits: s.edits.map((r) => (r.id === D ? { ...r, created_at: '(moves)' } : r)),
  });

  it('the replay passes: the displayed row already holds the text being saved', () => {
    const before = snap();
    const replay = save(firstInput());
    expect(replay.outcome).toBe('updated');
    expect(replay.editId).toBe(D);
    expect(replay.servedVersionId).toBe(first.servedVersionId);
    expect(replay.displayed).toEqual({ editId: D, sha256: sha256Text('IS a v1') });
    const after = snap();
    expect(exceptCreatedAtOfD(after)).toEqual(exceptCreatedAtOfD(before));
    expect(after.versions).toEqual(before.versions);
    expect(editRow(D)).toMatchObject({
      edited_content: 'IS a v2',
      displayed_edit_id: D,
      displayed_edit_sha256: sha256Text('IS a v1'),
    });
  });

  it('control: a displayed row holding a third text is still refused', () => {
    const v3 = save({
      editedContent: 'IS a v3',
      displayedEditId: D,
      displayedEditSha256: sha256Text('IS a v2'),
    });
    expect(v3).toMatchObject({ outcome: 'updated', editId: D });
    const err = refusedWith(() => save(firstInput()), 'STALE_DISPLAYED');
    expect(err.refusal).toEqual({
      code: 'STALE_DISPLAYED',
      echoedSha256: sha256Text('IS a v1'),
      currentSha256: sha256Text('IS a v3'),
    });
  });

  it('the boundary: a replayed withdraw whose first attempt deleted the displayed row is still refused', () => {
    const withdrawInput = {
      editedContent: served(SEG('a')).is,
      displayedEditId: D,
      displayedEditSha256: sha256Text('IS a v2'),
    };
    const w = save(withdrawInput);
    expect(w).toMatchObject({ outcome: 'withdrawn', editId: D });
    expect(editRow(D)).toBeUndefined();
    const err = refusedWith(() => save(withdrawInput), 'STALE_DISPLAYED');
    expect(err.refusal).toEqual({
      code: 'STALE_DISPLAYED',
      echoedSha256: sha256Text('IS a v2'),
      currentSha256: null,
    });
  });
});
