/**
 * G1.7 step 1, Task 5: `server/scripts/study-freeze.js check` (spec §6.3, §6.6).
 * Two failures, two responses: "input changed" (a file differs) and "served text changed, inputs
 * unchanged" (loader code moved a hash: re-cut). The books root is a temp directory; git facts
 * are injected.
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync, unlinkSync, copyFileSync } from 'fs';
import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const work = mkdtempSync(path.join(tmpdir(), 'study-freeze-check-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const segmentParser = require('../services/segmentParser');
const { writeModule } = require('./helpers/servedFixture');
const { mtLockPathFor, writeFreezeLock } = require('../../tools/lib/mt-lock.cjs');
const { STUDY_BOOKS } = require('../lib/researchScope');

const BOOK = STUDY_BOOKS[0];
const TAG = `freeze-${BOOK}-2026-12-01`;
const TAG2 = `freeze-${BOOK}-2026-12-15`;
const UNITS = [
  { chapterDir: 'ch01', moduleId: 'm96001' },
  { chapterDir: 'ch01', moduleId: 'm96002' },
  { chapterDir: 'appendices', moduleId: 'm96003' },
];
const GIT = Object.freeze({
  baseCommit: 'a'.repeat(40),
  layer1LastCommit: 'b'.repeat(40),
  handRepairs: [],
  shallow: false,
  dirtyPaths: [],
  layer1sFiles: [],
});
const ids = (u) => [`${u.moduleId}:para:a`, `${u.moduleId}:para:b`];

let realBooksDir;
let root;
let out;
let io;
let study;

const bookPath = (...p) => path.join(root, BOOK, ...p);
const mtPath = (u) => bookPath('02-mt-output', u.chapterDir, `${u.moduleId}-segments.is.md`);
const text = () => out.join('\n');
const cut = (tag = TAG, ...extra) =>
  study.main(['manifest', '--write', '--tag', tag, ...extra], io, { git: GIT });
const manifestDir = (tag = TAG) => bookPath('freeze', tag);
/** Write segments.jsonl and re-hash it into freeze.json, so only the edited lines differ. */
const rewriteSegments = (jsonl, tag = TAG) => {
  writeFileSync(path.join(manifestDir(tag), 'segments.jsonl'), jsonl);
  const headerPath = path.join(manifestDir(tag), 'freeze.json');
  const header = JSON.parse(readFileSync(headerPath, 'utf8'));
  header.segmentsSha256 = require('crypto').createHash('sha256').update(jsonl).digest('hex');
  writeFileSync(headerPath, `${JSON.stringify(header, null, 2)}\n`);
};
// A corrupt file starts with this, and JSON.parse's message quotes the input: output that
// contains it has printed the file's content.
const LEAK = 'zqx-leak';
const COMPARED = (units, segments, faithful) =>
  `compared: ${units} unit(s) by English and MT file hash, ${segments} segment(s) by served ` +
  `hash; ${faithful} unit(s) served from faithful, their segments not compared`;

beforeAll(() => {
  realBooksDir = segmentParser.BOOKS_DIR;
  study = require('../scripts/study-freeze');
});

beforeEach(() => {
  root = path.join(work, `books-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  segmentParser._setTestBooksDir(root);
  for (const u of UNITS) {
    writeModule(root, {
      book: BOOK,
      chapterDir: u.chapterDir,
      moduleId: u.moduleId,
      en: ids(u).map((id, i) => [id, `English ${u.moduleId} ${i}.`]),
      mt: ids(u).map((id, i) => [id, `Íslenska ${u.moduleId} ${i}.`]),
    });
  }
  study.writeMarkers(study.planMarkers({ book: BOOK }));
  out = [];
  io = { log: (l) => out.push(String(l)), error: (l) => out.push(String(l)) };
});

afterAll(() => {
  segmentParser._setTestBooksDir(realBooksDir);
  rmSync(work, { recursive: true, force: true });
});

describe('check with a manifest', () => {
  beforeEach(() => {
    expect(cut()).toBe(0);
    out.length = 0;
  });

  it('PASS on an unchanged tree; markers 3/3', () => {
    expect(study.main(['check'], io)).toBe(0);
    expect(text()).toContain('STUDY FREEZE CHECK: PASS');
    expect(text()).toContain('markers: 3/3');
  });

  it('PASS prints what it compared: 3 units, 6 segments, 0 served from faithful', () => {
    expect(study.main(['check'], io)).toBe(0);
    expect(text()).toContain(COMPARED(3, 6, 0));
  });

  it('compareToManifest counts what it compared, on an unchanged tree', () => {
    expect(study.compareToManifest({ book: BOOK, manifestDir: manifestDir() })).toMatchObject({
      unitsCompared: 3,
      segmentsCompared: 6,
      unitsSkippedFaithful: 0,
    });
  });

  it('FAIL also prints what it compared: a changed unit is compared by file, not by segment', () => {
    const u = UNITS[1];
    writeFileSync(mtPath(u), readFileSync(mtPath(u), 'utf8').replace('Íslenska', 'Íslensk'));
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toContain(COMPARED(3, 4, 0));
  });

  it('FAIL for a deleted marker, naming the unit', () => {
    unlinkSync(mtLockPathFor(mtPath(UNITS[1])));
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toMatch(/FAIL[\s\S]*markers absent: 1: ch01\/m96002/);
    expect(text()).not.toContain('re-cut route');
  });

  it('FAIL for a foreign marker; its body is never printed (T5)', () => {
    writeFileSync(
      mtLockPathFor(mtPath(UNITS[0])),
      '{"lockedAt":"2099-01-01T00:00:00.000Z","firstEditId":424242}'
    );
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toContain('markers foreign: 1: ch01/m96001');
    expect(/2099|424242/.test(text())).toBe(false);
  });

  it('FAIL input changed: an MT file changed, naming the unit and no served verdict', () => {
    const u = UNITS[1];
    writeFileSync(mtPath(u), readFileSync(mtPath(u), 'utf8').replace('Íslenska', 'Íslensk'));
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toContain('input changed: 1 unit(s): ch01/m96002');
    expect(text()).not.toContain('served text changed');
    expect(text()).toContain('re-cut route');
    expect(text()).toContain("[USER]'s decision (spec §6.6)");
    expect(text()).toContain(`--supersedes ${TAG}`);
    expect(text()).toContain('otherwise fix or revert the change that moved the hash');
  });

  it('FAIL input changed: an English file changed', () => {
    const p = bookPath('02-for-mt', 'ch01', 'm96001-segments.en.md');
    writeFileSync(p, readFileSync(p, 'utf8').replace('English', 'Englisch'));
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toContain('input changed: 1 unit(s): ch01/m96001');
  });

  it('FAIL served text changed, inputs unchanged: one manifest is_sha256 altered (T9)', () => {
    const file = path.join(manifestDir(), 'segments.jsonl');
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const altered = JSON.parse(lines[2]);
    altered.is_sha256 = '0'.repeat(64);
    lines[2] = JSON.stringify(altered);
    const jsonl = `${lines.join('\n')}\n`;
    writeFileSync(file, jsonl);
    const header = JSON.parse(readFileSync(path.join(manifestDir(), 'freeze.json'), 'utf8'));
    header.segmentsSha256 = require('crypto').createHash('sha256').update(jsonl).digest('hex');
    writeFileSync(path.join(manifestDir(), 'freeze.json'), `${JSON.stringify(header, null, 2)}\n`);
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toContain(
      `served text changed, inputs unchanged: 1 segment(s): ch01/m96002#${altered.segment_id}#0`
    );
    expect(text()).toContain('re-cut route');
    expect(text()).toContain("[USER]'s decision (spec §6.6)");
    expect(text()).toContain(`--supersedes ${TAG}`);
    expect(text()).toContain('otherwise fix or revert the change that moved the hash');
    expect(text()).not.toContain('input changed');
  });

  it('a segment present in the manifest only is a servedChanged entry', () => {
    const file = path.join(manifestDir(), 'segments.jsonl');
    const jsonl = `${readFileSync(file, 'utf8')}${JSON.stringify({
      chapter: 1,
      module_id: 'm96001',
      segment_id: 'm96001:para:gone',
      occurrence: 0,
      en_sha256: 'x',
      is_sha256: 'y',
      layer: 'mt-output',
    })}\n`;
    writeFileSync(file, jsonl);
    const header = JSON.parse(readFileSync(path.join(manifestDir(), 'freeze.json'), 'utf8'));
    header.segmentsSha256 = require('crypto').createHash('sha256').update(jsonl).digest('hex');
    writeFileSync(path.join(manifestDir(), 'freeze.json'), `${JSON.stringify(header, null, 2)}\n`);
    const r = study.compareToManifest({ book: BOOK, manifestDir: manifestDir() });
    expect([r.pass, r.servedChanged]).toEqual([
      false,
      [{ unit: 'ch01/m96001', segmentId: 'm96001:para:gone', occurrence: 0 }],
    ]);
  });

  it('a manifest whose segments.jsonl no longer matches its header hash is a FAIL, not a throw', () => {
    writeFileSync(path.join(manifestDir(), 'segments.jsonl'), 'tampered\n');
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toContain('manifest unreadable');
  });

  it('an unreadable manifest still prints the marker summary first', () => {
    writeFileSync(path.join(manifestDir(), 'segments.jsonl'), 'tampered\n');
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toMatch(/FAIL\nmarkers: 3\/3 units hold the freeze marker\nmanifest unreadable/);
  });

  it.each([
    ['not JSON', `${LEAK}{`],
    ['JSON null', 'null'],
  ])(
    'a current manifest whose freeze.json is %s is a named FAIL: the path, never its content',
    (_, body) => {
      writeFileSync(path.join(manifestDir(), 'freeze.json'), body);
      expect(study.main(['check'], io)).toBe(1);
      expect(text()).toContain('STUDY FREEZE CHECK: FAIL');
      expect(text()).toContain('markers: 3/3');
      expect(text()).toContain(`manifest unreadable: ${BOOK}/freeze/${TAG}/freeze.json`);
      expect(text()).not.toContain(LEAK);
    }
  );

  it('--manifest naming a manifest whose freeze.json is not JSON: a named FAIL, never its content', () => {
    writeFileSync(path.join(manifestDir(), 'freeze.json'), `${LEAK}{`);
    expect(study.main(['check', '--manifest', manifestDir()], io)).toBe(1);
    expect(text()).toContain(`manifest unreadable: ${TAG}: `);
    expect(text()).toContain(path.join(manifestDir(), 'freeze.json'));
    expect(text()).not.toContain(LEAK);
  });

  it('a segments.jsonl line that is not JSON (hash re-computed) is a named FAIL, never its content', () => {
    rewriteSegments(`${LEAK}\n`);
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toContain('manifest unreadable');
    expect(text()).toContain('segments.jsonl line 1');
    expect(text()).not.toContain(LEAK);
  });

  it('a unit added since the cut FAILs check and names the re-cut route', () => {
    writeModule(root, {
      book: BOOK,
      chapterDir: 'ch01',
      moduleId: 'm96009',
      en: [['m96009:p:a', 'x']],
      mt: [['m96009:p:a', 'y']],
    });
    study.writeMarkers(study.planMarkers({ book: BOOK }));
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toContain('units added: 1: ch01/m96009');
    expect(text()).toContain('re-cut route');
  });

  it('a unit removed since the cut FAILs check and names the re-cut route', () => {
    const u = UNITS[2];
    rmSync(bookPath('02-for-mt', u.chapterDir, `${u.moduleId}-segments.en.md`));
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toContain('units missing: 1: appendices/m96003');
    expect(text()).toContain('re-cut route');
  });

  it('a unit added or removed since the cut is a unit-set change', () => {
    writeModule(root, {
      book: BOOK,
      chapterDir: 'ch01',
      moduleId: 'm96009',
      en: [['m96009:p:a', 'x']],
      mt: [['m96009:p:a', 'y']],
    });
    study.writeMarkers(study.planMarkers({ book: BOOK }));
    expect(study.compareToManifest({ book: BOOK, manifestDir: manifestDir() })).toMatchObject({
      pass: false,
      unitSetChanged: { missing: [], extra: ['ch01/m96009'] },
    });
  });

  it('a unit moved to faithful is reported, not a failure', () => {
    const u = UNITS[0];
    const faithful = bookPath(
      '03-faithful-translation',
      u.chapterDir,
      `${u.moduleId}-segments.is.md`
    );
    mkdirSync(path.dirname(faithful), { recursive: true });
    writeFileSync(faithful, readFileSync(mtPath(u), 'utf8').replace('Íslenska', 'Íslensk'));
    expect(study.main(['check'], io)).toBe(0);
    expect(text()).toContain('moved to faithful (not a failure): 1: ch01/m96001');
    expect(text()).toContain(COMPARED(3, 4, 1));
    expect(study.compareToManifest({ book: BOOK, manifestDir: manifestDir() })).toMatchObject({
      unitsCompared: 3,
      segmentsCompared: 4,
      unitsSkippedFaithful: 1,
    });
  });

  it('control: a moved-to-faithful unit still fails when its MT file changed', () => {
    const u = UNITS[0];
    const faithful = bookPath(
      '03-faithful-translation',
      u.chapterDir,
      `${u.moduleId}-segments.is.md`
    );
    mkdirSync(path.dirname(faithful), { recursive: true });
    copyFileSync(mtPath(u), faithful);
    writeFileSync(mtPath(u), readFileSync(mtPath(u), 'utf8').replace('Íslenska', 'Íslensk'));
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toContain('input changed: 1 unit(s): ch01/m96001');
  });

  it('--manifest names a manifest directory explicitly', () => {
    expect(study.main(['check', '--manifest', manifestDir()], io)).toBe(0);
  });
});

describe('supersedes', () => {
  it('a second manifest naming the first makes the first ignored', () => {
    expect(cut()).toBe(0);
    expect(cut(TAG2, '--supersedes', TAG)).toBe(0);
    // damage the OLD manifest: if check still read it, it would fail
    writeFileSync(path.join(manifestDir(TAG), 'segments.jsonl'), 'tampered\n');
    out.length = 0;
    expect(study.main(['check'], io)).toBe(0);
    expect(text()).toContain(`manifest: ${TAG2}`);
  });

  it('two current manifests: AMBIGUOUS is a FAIL', () => {
    for (const t of [TAG, TAG2]) {
      const built = study.buildManifest({ book: BOOK, tag: t, git: GIT });
      study.writeManifest({ book: BOOK, tag: t, ...built });
    }
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toContain('no single current manifest');
    expect(text()).toMatch(/FAIL\nmarkers: 3\/3 units hold the freeze marker\nno single current/);
  });
});

describe('check without a manifest', () => {
  it('verifies markers only and says so; 0 when all markers are freeze', () => {
    expect(study.main(['check'], io)).toBe(0);
    expect(text()).toContain('no manifest yet: verified markers only');
  });
  it('still FAILs on an absent marker', () => {
    unlinkSync(mtLockPathFor(mtPath(UNITS[2])));
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toContain('markers absent: 1: appendices/m96003');
  });
  it('FAILs on a book with no study units: 0/0 is never a PASS', () => {
    rmSync(bookPath('02-for-mt'), { recursive: true, force: true });
    mkdirSync(bookPath('02-for-mt'));
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toContain('STUDY FREEZE CHECK: FAIL');
    expect(text()).toContain('markers: 0/0');
    expect(text()).toContain('no study units');
  });
  it('FAILs, named, when the book has no 02-for-mt at all', () => {
    rmSync(bookPath('02-for-mt'), { recursive: true, force: true });
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toContain('STUDY FREEZE CHECK: FAIL');
    expect(text()).toContain(`no study units: ${BOOK}/02-for-mt does not exist`);
  });
  it('FAILs on a study unit with no MT output, even when it holds the freeze marker', () => {
    writeModule(root, { book: BOOK, chapterDir: 'ch01', moduleId: 'm96004', en: [['p', 'x']] });
    writeFreezeLock(bookPath('02-mt-output', 'ch01', 'm96004-segments.is.md'));
    expect(study.main(['check'], io)).toBe(1);
    expect(text()).toContain('markers: 4/4');
    expect(text()).toContain('no MT output: 1 unit(s): ch01/m96004');
  });
});

describe('checkMarkers', () => {
  it('counts freeze, absent and foreign units by id', () => {
    unlinkSync(mtLockPathFor(mtPath(UNITS[0])));
    writeFileSync(mtLockPathFor(mtPath(UNITS[1])), '{"lockedAt":"x"}');
    expect(study.checkMarkers({ book: BOOK })).toEqual({
      total: 3,
      freeze: 1,
      absent: ['ch01/m96001'],
      foreign: ['ch01/m96002'],
      noMt: [],
    });
  });
  it('names the units with no MT output', () => {
    unlinkSync(mtPath(UNITS[2]));
    expect(study.checkMarkers({ book: BOOK }).noMt).toEqual(['appendices/m96003']);
  });
});
