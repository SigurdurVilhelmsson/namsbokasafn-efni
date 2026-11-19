/**
 * study-freeze (G1.7, step 1): the freeze of the study book's MT layer.
 * Spec: docs/superpowers/specs/2026-11-19-g17-freeze-and-mt-lock-design.md (§6.3, §6.4, §6.6,
 * anti-goals §4).
 *
 * Run it as a FILE (`node server/scripts/study-freeze.js <command> ...`), from any directory. A
 * piped run (`node - <command> < study-freeze.js`) works with server/scripts/ as the working
 * directory: Node resolves a stdin script's relative requires from the working directory, so from
 * the repository root it stops at the first require (MODULE_NOT_FOUND) and runs nothing. Both were
 * run once with `check` on 2026-11-19.
 *
 * Subcommands:
 *   markers [--write]   write the content-free freeze marker to every study unit (dry run without
 *                       --write). Refuses the whole run, writing nothing, when any unit already
 *                       holds a marker that is not the freeze marker (it may hold a person's
 *                       first-save time) or has no MT file. Output names units and counts only,
 *                       never a marker body.
 *   manifest [--write --tag freeze-<book>-YYYY-MM-DD [--supersedes <tag>]]
 *                       the frozen base (§6.4): one line per served segment occurrence, hashed by
 *                       the served-version code, plus a header. The dry run (no --write) prints the
 *                       counts, the sha256 segments.jsonl would have and every refusal. --write
 *                       writes books/<book>/freeze/<tag>/{segments.jsonl,freeze.json} and refuses,
 *                       writing nothing, on any refusal (not-frozen, duplicated-id, no-layer,
 *                       shallow-clone, dirty-input; bad-input, a revision record, layer-1s file,
 *                       glossary or freeze.json that is not valid JSON, named by path only; an
 *                       existing tag directory; a --supersedes that is not the current manifest;
 *                       a current manifest the new one does not supersede).
 *   check [--manifest <dir>]
 *                       read-only: every unit's marker is the freeze marker, and the tree still
 *                       matches the current manifest (or --manifest's). Two failures call for
 *                       different responses: "input changed" (a unit's English or MT file differs)
 *                       and "served text changed, inputs unchanged" (the files match, so loader
 *                       code moved a hash: re-cut, spec §6.6). Exit 0 only on PASS, which needs
 *                       at least one study unit and an MT file for every unit; it prints how many
 *                       units and segments it compared. Without a manifest it verifies markers
 *                       only and says so.
 *
 * Flags: --book <slug> (a study book; default the only one), --write, --tag <name>,
 * --supersedes <tag>, --manifest <dir>. Any other flag is a usage error.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const segmentParser = require('../services/segmentParser');
const servedVersions = require('../services/servedVersions');
const { listStudyUnits } = require('../lib/studyUnits');
const { STUDY_BOOKS } = require('../lib/researchScope');
const {
  FREEZE_LOCK_BODY,
  freezeLockState,
  writeFreezeLock,
} = require('../../tools/lib/mt-lock.cjs');

const REPO_ROOT = path.join(__dirname, '..', '..');
const COMMANDS = ['markers', 'manifest', 'check'];
const VALUE_FLAGS = {
  '--book': 'book',
  '--tag': 'tag',
  '--supersedes': 'supersedes',
  '--manifest': 'manifest',
};
/** The book's input directories (spec §6.3): a manifest is cut only when git sees them clean. */
const INPUT_DIRS = [
  '02-for-mt',
  '02-mt-output',
  '02-mt-selected',
  '02-mt-revised',
  '03-faithful-translation',
  'glossary',
];
const GLOSSARY = 'glossary/glossary-unified.json';
const MAX_LISTED = 20;

function usage(message) {
  return Object.assign(new Error(message), { code: 'USAGE' });
}
const coded = (code, message) => Object.assign(new Error(message), { code });
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const bookDir = (book) => path.join(segmentParser.BOOKS_DIR, book);
/** sha256 of a file's raw bytes, or null when the file does not exist. */
const fileSha = (p) => (fs.existsSync(p) ? sha256(fs.readFileSync(p)) : null);
const headerBytes = (header) => `${JSON.stringify(header, null, 2)}\n`;
const listed = (items) =>
  items.slice(0, MAX_LISTED).join(', ') +
  (items.length > MAX_LISTED ? `, … (+${items.length - MAX_LISTED} more)` : '');

/**
 * @param {string[]} argv the arguments after the script path
 * @returns {{command: string, book: string, write: boolean, tag: string|null,
 *   supersedes: string|null, manifest: string|null}}
 */
function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command)) {
    throw usage(`unknown or missing command (expected one of ${COMMANDS.join(', ')})`);
  }
  const args = { command, book: null, write: false, tag: null, supersedes: null, manifest: null };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === '--write') args.write = true;
    else if (VALUE_FLAGS[flag]) {
      const value = rest[++i];
      if (value === undefined || value.startsWith('--')) throw usage(`${flag} needs a value`);
      args[VALUE_FLAGS[flag]] = value;
    } else throw usage(`unknown argument: ${flag}`);
  }
  if (args.book === null) {
    if (STUDY_BOOKS.length !== 1) throw usage('--book is required');
    args.book = STUDY_BOOKS[0];
  } else if (!STUDY_BOOKS.includes(args.book)) {
    throw usage(`--book must be a study book (${STUDY_BOOKS.join(', ')})`);
  }
  return args;
}

// ── markers ──────────────────────────────────────────────────────────────────────────────────

/**
 * Classify every study unit's marker. Reads only; names units, never marker bodies.
 * @param {{book: string}} args
 */
function planMarkers({ book }) {
  const units = listStudyUnits({ book, booksDir: segmentParser.BOOKS_DIR }).map((u) => ({
    ...u,
    state: freezeLockState(u.mtOutput),
    hasMt: fs.existsSync(u.mtOutput),
  }));
  const refusals = [];
  for (const u of units) {
    if (u.state === 'foreign') refusals.push({ unit: u.unit, reason: 'foreign-marker' });
    if (!u.hasMt) refusals.push({ unit: u.unit, reason: 'no-mt-file' });
  }
  return { units, refusals };
}

/** Write the freeze marker to every unit. Throws code REFUSED, before any write, on a refusal. */
function writeMarkers(plan) {
  if (plan.refusals.length > 0) {
    throw Object.assign(new Error('refused: nothing written'), { code: 'REFUSED' });
  }
  let written = 0;
  let already = 0;
  for (const u of plan.units) {
    if (writeFreezeLock(u.mtOutput) === 'written') written++;
    else already++;
  }
  return { written, already, total: plan.units.length };
}

// ── manifest ─────────────────────────────────────────────────────────────────────────────────

/**
 * The git facts the header records and the preconditions read. CLI only: tests inject a `git`
 * object instead. Runs git in the repository root derived from __dirname, never process.cwd().
 *
 * `handRepairs` follows spec §6.4, "each commit whose SUBJECT holds HAND REPAIR": `--grep` also
 * matches a body, and one chemistry commit's body says "NO HAND REPAIR WAS NEEDED", so the
 * subject is filtered after the grep. Oldest first.
 *
 * `layer1sFiles` lists the files git tracks under the book's 02-mt-selected, book-relative and
 * sorted: the manifest records those only. A gitignored file (a `*.bak` backup, say) is invisible
 * to the dirty-input check, so recording it would make the manifest depend on local junk.
 *
 * @param {{book: string, repoRoot?: string}} args `repoRoot` (default: this repository) is git's
 *   cwd and the base of the book-relative pathspecs
 * @returns {{baseCommit: string, layer1LastCommit: string,
 *   handRepairs: Array<{commit: string, subject: string}>, shallow: boolean, dirtyPaths: string[],
 *   layer1sFiles: string[]}}
 */
function gitFacts({ book, repoRoot = REPO_ROOT }) {
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    }).trimEnd(); // trimEnd, never trim: a porcelain line starts with a meaningful space
  const lines = (s) => (s === '' ? [] : s.split('\n'));
  // Pathspecs derive from `repoRoot`, never from segmentParser.BOOKS_DIR, so a test repository
  // is read as itself; in production repoRoot is REPO_ROOT and the result is the same.
  const rel = (dir) => `books/${book}/${dir}`;
  const layer1 = rel('02-mt-output');
  return {
    baseCommit: git('rev-parse', 'HEAD'),
    // Layer 1's last commit is the vintage of the MT TEXT: the freeze markers (`*.locked`, which
    // live in 02-mt-output too and carry no text) are excluded, or the marker commit would be it.
    layer1LastCommit: git(
      'log',
      '-1',
      '--format=%H',
      '--',
      layer1,
      `:(exclude,glob)${layer1}/**/*.locked`
    ),
    handRepairs: lines(
      git('log', '--reverse', '--format=%H%x09%s', '--grep=HAND REPAIR', '--', layer1)
    )
      .map((l) => {
        const tab = l.indexOf('\t');
        return { commit: l.slice(0, tab), subject: l.slice(tab + 1) };
      })
      .filter((r) => r.subject.includes('HAND REPAIR')),
    shallow: git('rev-parse', '--is-shallow-repository') === 'true',
    dirtyPaths: lines(git('status', '--porcelain', '--', ...INPUT_DIRS.map(rel))).map((l) =>
      l.slice(3)
    ),
    // -z: NUL-separated and never quoted, so a path is read exactly as git stores it
    layer1sFiles: git('ls-files', '-z', '--', rel('02-mt-selected'))
      .split('\0')
      .filter(Boolean)
      .map((p) => p.slice(`books/${book}/`.length))
      .sort(byString),
  };
}

/**
 * Every study unit as the editor's loader serves it: its marker state and its served-version
 * rows, `versionRowsFor(loadModuleForEditing(...))`. This script computes no served-text hash of
 * its own. A unit with no Icelandic layer has `rows: null`.
 */
function servedBase(book) {
  return listStudyUnits({ book, booksDir: segmentParser.BOOKS_DIR }).map((u) => {
    const marker = freezeLockState(u.mtOutput);
    const key = { book, chapter: u.chapter, moduleId: u.moduleId };
    try {
      const data = segmentParser.loadModuleForEditing(book, u.chapter, u.moduleId);
      const { rows, duplicatedIds } = servedVersions.versionRowsFor(data, key);
      return { ...u, marker, rows, duplicatedIds, isSource: data.isSource };
    } catch (e) {
      if (e.code !== 'NO_LAYER') throw e;
      return { ...u, marker, rows: null, duplicatedIds: [], isSource: null };
    }
  });
}

/**
 * The preconditions of spec §6.3 that the tree and git decide.
 * @param {{book: string, git: object, base?: object[]}} args `base` (internal) lets main check
 *   and build from one read of the tree
 * @returns {Array<{unit?: string, reason: string, paths?: string[]}>}
 */
function manifestRefusals({ book, git, base = servedBase(book) }) {
  const refusals = [];
  for (const u of base) {
    if (u.marker !== 'freeze') refusals.push({ unit: u.unit, reason: 'not-frozen' });
    if (u.rows === null) refusals.push({ unit: u.unit, reason: 'no-layer' });
    else if (u.duplicatedIds.length > 0) refusals.push({ unit: u.unit, reason: 'duplicated-id' });
  }
  if (git.shallow) refusals.push({ reason: 'shallow-clone' });
  if (git.dirtyPaths.length > 0) {
    refusals.push({ reason: 'dirty-input', paths: [...git.dirtyPaths] });
  }
  return refusals;
}

/** The cut date of a well-formed tag `freeze-<book>-YYYY-MM-DD`; throws code USAGE otherwise. */
function cutDateOf(book, tag) {
  const escaped = book.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m =
    typeof tag === 'string'
      ? new RegExp(`^freeze-${escaped}-(\\d{4})-(\\d{2})-(\\d{2})$`).exec(tag)
      : null;
  const [y, mo, d] = m ? m.slice(1).map(Number) : [];
  const day = m ? new Date(Date.UTC(y, mo - 1, d)) : null;
  if (!m || day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) {
    throw usage(`--tag must be freeze-${book}-YYYY-MM-DD (a real date), got ${tag}`);
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Book-relative POSIX paths of every file under books/<book>/<dir>/, sorted; [] when absent. */
function filesUnder(book, dir) {
  const files = [];
  const walk = (rel) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(bookDir(book), rel), { withFileTypes: true });
    } catch (e) {
      if (e.code === 'ENOENT') return;
      throw e;
    }
    for (const e of entries) {
      if (e.isDirectory()) walk(`${rel}/${e.name}`);
      else if (e.isFile()) files.push(`${rel}/${e.name}`);
    }
  };
  walk(dir);
  return files.sort(byString);
}

/**
 * Parse JSON, or throw code BAD_INPUT naming `label` (a path) only: JSON.parse's own message
 * quotes the input, and a corrupt file's content is never printed.
 */
const parseJson = (bytesOrText, label) => {
  try {
    return JSON.parse(bytesOrText.toString('utf8'));
  } catch {
    throw coded('BAD_INPUT', `${label}: not valid JSON`);
  }
};
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const readJson = (book, rel) => {
  const bytes = fs.readFileSync(path.join(bookDir(book), rel));
  return { bytes, json: parseJson(bytes, `${book}/${rel}`) };
};

/**
 * segments.jsonl: one line per served occurrence, units in list order then served order, with
 * the served-version column names in their order; plus the count of lines by layer (sorted).
 */
function composeSegments(base) {
  const lines = base.flatMap((u) =>
    (u.rows || []).map((r) => ({
      chapter: r.chapter,
      module_id: r.moduleId,
      segment_id: r.segmentId,
      occurrence: r.occurrence,
      en_sha256: r.enSha256,
      is_sha256: r.isSha256,
      layer: r.layer,
    }))
  );
  const counts = {};
  for (const l of lines) counts[l.layer] = (counts[l.layer] || 0) + 1;
  return {
    count: lines.length,
    segmentsJsonl: lines.map((l) => `${JSON.stringify(l)}\n`).join(''),
    byLayer: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => byString(a, b))),
  };
}

/**
 * Layer 1s (`02-mt-selected`): every file git tracks there (`tracked`, gitFacts' `layer1sFiles`)
 * that is on disk, with its sha256 and, for a `*-selected.json`, its entry count. A file git does
 * not track is not recorded (see gitFacts). Throws when `tracked` is not a list: injected git
 * facts without it are refused rather than read as "every file on disk".
 * `servedSegments` counts the manifest segments whose served Icelandic is exactly a
 * layer-1s entry's text at the same unit, segment id and occurrence: a value test, so it does not
 * depend on which file the loader read. The loader reads only the faithful or the MT file, so
 * today this is 0 (spec §3). Blind spot: the loader's own normalisation (unescaping, term-marker
 * repair) could make served text differ from an entry it came from, which this would not count.
 */
function layer1sRecord(book, base, tracked) {
  if (!Array.isArray(tracked)) {
    throw new Error('git facts carry no layer1sFiles list (the tracked 02-mt-selected files)');
  }
  const isTracked = new Set(tracked);
  const files = filesUnder(book, '02-mt-selected').filter((rel) => isTracked.has(rel));
  let servedSegments = 0;
  const records = files.map((rel) => {
    if (!rel.endsWith('-selected.json')) {
      return {
        path: rel,
        sha256: sha256(fs.readFileSync(path.join(bookDir(book), rel))),
        entries: null,
      };
    }
    const { bytes, json } = readJson(book, rel);
    const selected = json && typeof json === 'object' ? json : {};
    const entries = Array.isArray(selected.entries) ? selected.entries : [];
    const chapterDir = rel.split('/')[1];
    const unit = base.find((u) => u.chapterDir === chapterDir && u.moduleId === selected.module);
    for (const e of entries) {
      const row =
        unit && unit.rows
          ? unit.rows.find((r) => r.segmentId === e.segmentId && r.occurrence === e.occurrence)
          : null;
      if (row && row.isText === e.text) servedSegments++;
    }
    return { path: rel, sha256: sha256(bytes), entries: entries.length };
  });
  return { dir: '02-mt-selected', files: records, servedSegments };
}

/** Distinct `{path, sha256}` references, sorted by path (then sha256). */
function distinctRefs(refs) {
  const seen = new Map();
  for (const r of refs) {
    if (r && typeof r === 'object')
      seen.set(`${r.path}\t${r.sha256}`, { path: r.path, sha256: r.sha256 });
  }
  return [...seen.values()].sort(
    (a, b) => byString(a.path, b.path) || byString(a.sha256, b.sha256)
  );
}
const distinct = (values) =>
  [...new Set(values.filter((v) => typeof v === 'string'))].sort(byString);

/** Layer 2 (`02-mt-revised`): the revision records, what they name, and one hash over them. */
function layer2Record(book) {
  const records = filesUnder(book, '02-mt-revised')
    .filter((rel) => rel.endsWith('-revision.json'))
    .map((rel) => {
      const { bytes, json } = readJson(book, rel);
      return { rel, sha: sha256(bytes), record: json && typeof json === 'object' ? json : {} };
    });
  return {
    dir: '02-mt-revised',
    revisionRecords: records.length,
    rulingSets: distinctRefs(records.map((r) => r.record.rulingSet)),
    prompts: distinctRefs(records.map((r) => r.record.prompt)),
    models: distinct(records.map((r) => r.record.model)),
    runIds: distinct(
      records.flatMap((r) => (Array.isArray(r.record.runIds) ? r.record.runIds : []))
    ),
    // a tab between path and hash, never a NUL byte (CLAUDE.md § NUL bytes)
    revisionRecordsSha256: sha256(records.map((r) => `${r.rel}\t${r.sha}\n`).join('')),
  };
}

/** Layer 3 (`03-faithful-translation`): the faithful files and the review-status sidecars. */
function layer3Record(book) {
  const files = filesUnder(book, '03-faithful-translation');
  return {
    dir: '03-faithful-translation',
    faithfulFiles: files.filter((rel) => rel.endsWith('-segments.is.md')).length,
    reviewStatusSidecars: files.filter((rel) => rel.endsWith('-review-status.json')).length,
  };
}

function glossaryRecord(book) {
  if (!fs.existsSync(path.join(bookDir(book), GLOSSARY))) {
    return { path: GLOSSARY, sha256: null, producer: null, terms: 0 };
  }
  const { bytes, json } = readJson(book, GLOSSARY);
  const g = json && typeof json === 'object' ? json : {};
  return {
    path: GLOSSARY,
    sha256: sha256(bytes),
    producer: typeof g.producer === 'string' ? g.producer : null,
    terms: Array.isArray(g.terms) ? g.terms.length : 0,
  };
}

/**
 * The records the header reads from layer files and the glossary. Throws code BAD_INPUT, naming
 * the path, when one of those JSON files does not parse; `runManifest` calls it on a dry run too,
 * so a corrupt input is a named refusal before the cut, not only at it.
 */
function layerRecords(book, base, git) {
  return {
    layer1s: layer1sRecord(book, base, git.layer1sFiles),
    layer2: layer2Record(book),
    layer3: layer3Record(book),
    glossary: glossaryRecord(book),
  };
}

/**
 * The manifest of spec §6.4: the header (freeze.json) and segments.jsonl, built from the tree,
 * the tag and the injected git facts. Holds no time except the tag's cut date.
 * @param {{book: string, tag: string, supersedes?: string|null, git: object, base?: object[],
 *   records?: object}} args `base` and `records` (internal) let main build from one read
 * @returns {{header: object, segmentsJsonl: string}}
 */
function buildManifest({ book, tag, supersedes = null, git, base = servedBase(book), records }) {
  const cutDate = cutDateOf(book, tag);
  const layerless = base.find((u) => u.rows === null);
  if (layerless) throw coded('NO_LAYER', `${layerless.unit} has no Icelandic layer`);
  const recs = records || layerRecords(book, base, git);
  const { count, segmentsJsonl, byLayer } = composeSegments(base);
  const header = {
    schema: 'study-freeze/1',
    book,
    tag,
    cutDate,
    baseCommit: git.baseCommit,
    supersedes,
    segmentsSha256: sha256(segmentsJsonl),
    counts: { units: base.length, segments: count, byLayer },
    units: base.map((u) => ({
      chapter: u.chapter,
      chapterDir: u.chapterDir,
      moduleId: u.moduleId,
      enSha256: fileSha(u.enSource),
      mtSha256: fileSha(u.mtOutput),
      faithfulSha256: fileSha(segmentParser.getModulePaths(book, u.chapter, u.moduleId).faithful),
      changesSha256: fileSha(
        path.join(bookDir(book), '02-mt-revised', u.chapterDir, `${u.moduleId}-changes.jsonl`)
      ),
      segments: u.rows.length,
      marker: u.marker,
    })),
    layers: {
      layer1: {
        dir: '02-mt-output',
        lastCommit: git.layer1LastCommit,
        handRepairs: git.handRepairs.map(({ commit, subject }) => ({ commit, subject })),
      },
      layer1s: recs.layer1s,
      layer2: recs.layer2,
      layer3: recs.layer3,
    },
    glossary: recs.glossary,
    markers: {
      count: base.filter((u) => u.marker === 'freeze').length,
      bodySha256: sha256(FREEZE_LOCK_BODY),
    },
  };
  return { header, segmentsJsonl };
}

/**
 * Write books/<book>/freeze/<tag>/: segments.jsonl, then freeze.json. Refuses (code REFUSED),
 * writing nothing, when that directory exists.
 *
 * Both files are written into a temp directory, `books/<book>/.freeze-tmp-<tag>-XXXXXX`, which
 * is then renamed to freeze/<tag>/, so a failed write leaves no freeze/<tag>/ (which would block
 * the re-run as manifest-exists). The temp sits OUTSIDE freeze/, where neither `currentManifest`
 * nor the guard test's listing looks, and outside the input directories the dirty-input check
 * reads. On any failure it is removed, and so is freeze/ if this call created it and it is empty.
 * @returns {string} the directory
 */
function writeManifest({ book, tag, header, segmentsJsonl }) {
  cutDateOf(book, tag); // the tag reaches a path: never join one that is not well-formed
  const parent = path.join(bookDir(book), 'freeze');
  const dir = path.join(parent, tag);
  const exists = () => coded('REFUSED', `${book}/freeze/${tag}/ exists; nothing written`);
  // rename(2) replaces an existing EMPTY directory, so existence is checked first; a non-empty
  // one that appears after this check fails the rename (ENOTEMPTY or EEXIST) and is refused.
  if (fs.existsSync(dir)) throw exists();
  const tmp = fs.mkdtempSync(path.join(bookDir(book), `.freeze-tmp-${tag}-`));
  let createdParent;
  try {
    fs.writeFileSync(path.join(tmp, 'segments.jsonl'), segmentsJsonl, { flag: 'wx' });
    fs.writeFileSync(path.join(tmp, 'freeze.json'), headerBytes(header), { flag: 'wx' });
    createdParent = fs.mkdirSync(parent, { recursive: true }); // undefined when it existed
    fs.renameSync(tmp, dir);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (createdParent) {
      try {
        fs.rmdirSync(createdParent); // only an empty directory; otherwise leave it
      } catch {
        // not empty: it holds something this call did not write
      }
    }
    if (e.code === 'EEXIST' || e.code === 'ENOTEMPTY') throw exists();
    throw e;
  }
  return dir;
}

/**
 * The current manifest (spec §6.6): the one under books/<book>/freeze/ whose tag no other
 * manifest's `supersedes` names. A directory without freeze.json is not a manifest. Null when
 * there is none; throws code AMBIGUOUS when there is not exactly one current manifest, and code
 * BAD_INPUT (naming the path) when a freeze.json is not a JSON object.
 * @returns {{dir: string, header: object} | null}
 */
function currentManifest({ book }) {
  const parent = path.join(bookDir(book), 'freeze');
  let entries;
  try {
    entries = fs.readdirSync(parent, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  const manifests = entries
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(parent, e.name, 'freeze.json')))
    .map((e) => e.name)
    .sort(byString)
    .map((name) => {
      const rel = `freeze/${name}/freeze.json`;
      const { json } = readJson(book, rel);
      if (!isObject(json)) throw coded('BAD_INPUT', `${book}/${rel}: not a manifest header`);
      return { dir: path.join(parent, name), header: json };
    });
  if (manifests.length === 0) return null;
  const superseded = new Set(manifests.map((m) => m.header.supersedes).filter(Boolean));
  const current = manifests.filter((m) => !superseded.has(m.header.tag));
  if (current.length !== 1) {
    throw coded(
      'AMBIGUOUS',
      current.length === 0
        ? 'no current manifest: every manifest is superseded'
        : `more than one current manifest: ${current.map((m) => m.header.tag).join(', ')}`
    );
  }
  return current[0];
}

/**
 * The refusals a write decides from the freeze directory (main only): an existing tag directory,
 * a --supersedes that is not the current manifest, and a current manifest the new one does not
 * supersede (two current manifests would leave `check` with no manifest to compare against).
 */
function cutRefusals({ book, tag, supersedes }) {
  const refusals = [];
  if (tag !== null && fs.existsSync(path.join(bookDir(book), 'freeze', tag))) {
    refusals.push({ reason: 'manifest-exists', detail: `${book}/freeze/${tag}/` });
  }
  let current;
  try {
    current = currentManifest({ book });
  } catch (e) {
    if (e.code === 'AMBIGUOUS')
      return [...refusals, { reason: 'ambiguous-manifests', detail: e.message }];
    if (e.code === 'BAD_INPUT') return [...refusals, { reason: 'bad-input', detail: e.message }];
    throw e;
  }
  const currentTag = current ? current.header.tag : null;
  if (supersedes !== null && supersedes !== currentTag) {
    refusals.push({
      reason: 'supersedes-not-current',
      detail: currentTag ? `the current manifest is ${currentTag}` : 'there is no manifest',
    });
  } else if (supersedes === null && currentTag !== null) {
    refusals.push({
      reason: 'current-exists',
      detail: `${currentTag} is current; a re-cut passes --supersedes ${currentTag}`,
    });
  }
  return refusals;
}

function printRefusals(refusals, io) {
  const byReason = new Map();
  for (const r of refusals.filter((x) => x.unit)) {
    byReason.set(r.reason, [...(byReason.get(r.reason) || []), r.unit]);
  }
  for (const [reason, units] of byReason) {
    io.error(`refused: ${reason}: ${units.length} unit(s): ${listed(units)}`);
  }
  for (const r of refusals.filter((x) => !x.unit)) {
    if (r.paths) io.error(`refused: ${r.reason}: ${r.paths.length} path(s): ${listed(r.paths)}`);
    else io.error(`refused: ${r.reason}${r.detail ? ` (${r.detail})` : ''}`);
  }
}

function runManifest(args, io, deps) {
  const { book, tag, supersedes } = args;
  if (args.manifest !== null) throw usage('--manifest applies to check only');
  if (args.write && tag === null) throw usage(`--write needs --tag freeze-${book}-YYYY-MM-DD`);
  if (tag !== null) cutDateOf(book, tag);
  let git;
  try {
    git = deps.git || gitFacts({ book });
  } catch (e) {
    io.error(`refused: git facts unavailable (${String(e.message).split('\n')[0]})`);
    io.error('nothing written');
    return 1;
  }
  const base = servedBase(book);
  const refusals = [...manifestRefusals({ book, git, base }), ...cutRefusals(args)];
  let records = null;
  try {
    records = layerRecords(book, base, git);
  } catch (e) {
    if (e.code !== 'BAD_INPUT') throw e;
    refusals.push({ reason: 'bad-input', detail: e.message });
  }
  let built = null;
  if (!base.some((u) => u.rows === null)) {
    const { count, segmentsJsonl, byLayer } = composeSegments(base);
    const layers = Object.entries(byLayer).map(([k, n]) => `${k} ${n}`);
    io.log(`${base.length} units, ${count} segments (${layers.join(', ') || 'none'})`);
    io.log(`segments.jsonl sha256 ${sha256(segmentsJsonl)}`);
    if (tag !== null && records)
      built = buildManifest({ book, tag, supersedes, git, base, records });
    if (built) io.log(`freeze.json sha256 ${sha256(headerBytes(built.header))}`);
    io.log(
      `layer 1: last commit ${git.layer1LastCommit}, ${git.handRepairs.length} hand repair(s)`
    );
  }
  if (refusals.length > 0) {
    printRefusals(refusals, io);
    io.error('nothing written');
    return 1;
  }
  if (!args.write) {
    io.log(`dry run: nothing written (pass --write --tag freeze-${book}-YYYY-MM-DD to write)`);
    return 0;
  }
  try {
    writeManifest({ book, tag, ...built });
  } catch (e) {
    if (e.code !== 'REFUSED') throw e;
    io.error(`refused: ${e.message}`);
    return 1;
  }
  io.log(`written ${book}/freeze/${tag}/ (segments.jsonl, freeze.json)`);
  return 0;
}

// ── check ────────────────────────────────────────────────────────────────────────────────────

/**
 * Count the study units' markers by state, and name the units with no MT output (a state
 * `markers` refuses). Reuses planMarkers' classification; names units only.
 * @param {{book: string}} args
 * @returns {{total: number, freeze: number, absent: string[], foreign: string[], noMt: string[]}}
 */
function checkMarkers({ book }) {
  const { units } = planMarkers({ book });
  const named = (state) => units.filter((u) => u.state === state).map((u) => u.unit);
  return {
    total: units.length,
    freeze: units.filter((u) => u.state === 'freeze').length,
    absent: named('absent'),
    foreign: named('foreign'),
    noMt: units.filter((u) => !u.hasMt).map((u) => u.unit),
  };
}

/**
 * Compare the tree with a manifest (spec §6.3). File hashes (English, MT) for every unit; segment
 * lines, keyed on (segment_id, occurrence) and compared on en_sha256 and is_sha256 (`layer` is
 * not compared), only for units still served from a non-faithful layer. A segment difference in a
 * unit whose files changed is explained by `inputChanged`; in a unit whose files match it is
 * `servedChanged` ("served text changed, inputs unchanged": loader code moved a hash).
 *
 * It also counts what it compared, so a PASS can show it compared something: `unitsCompared`
 * (units in both the manifest and the tree, whose file hashes were compared), `segmentsCompared`
 * (segment keys compared, in units still served from a non-faithful layer whose files match) and
 * `unitsSkippedFaithful` (units served from a faithful file, whose segments are not compared).
 * A manifest file that does not parse, or a header that is not one, throws code BAD_INPUT naming
 * the path, never the content.
 * @param {{book: string, manifestDir: string, base?: object[]}} args
 */
function compareToManifest({ book, manifestDir, base = servedBase(book) }) {
  const headerPath = path.join(manifestDir, 'freeze.json');
  const header = parseJson(fs.readFileSync(headerPath), headerPath);
  if (
    !isObject(header) ||
    typeof header.segmentsSha256 !== 'string' ||
    !Array.isArray(header.units) ||
    !header.units.every(isObject)
  ) {
    throw coded('BAD_INPUT', `${headerPath}: not a manifest header`);
  }
  const segmentsPath = path.join(manifestDir, 'segments.jsonl');
  const segmentBytes = fs.readFileSync(segmentsPath);
  if (sha256(segmentBytes) !== header.segmentsSha256) {
    throw coded('BAD_INPUT', `${manifestDir}: segments.jsonl does not match its header's hash`);
  }
  const unitId = (u) => `${u.chapterDir}/${u.moduleId}`;
  const linesByUnit = new Map();
  segmentBytes
    .toString('utf8')
    .split('\n')
    .forEach((l, i) => {
      if (l === '') return;
      const label = `${segmentsPath} line ${i + 1}`;
      const line = parseJson(l, label);
      if (!isObject(line)) throw coded('BAD_INPUT', `${label}: not a segment line`);
      const k = `${line.chapter}/${line.module_id}`;
      linesByUnit.set(k, [...(linesByUnit.get(k) || []), line]);
    });
  const frozen = new Map(header.units.map((u) => [unitId(u), u]));
  const current = new Map(base.map((u) => [unitId(u), u]));
  const result = {
    pass: true,
    unitsCompared: 0,
    segmentsCompared: 0,
    unitsSkippedFaithful: 0,
    unitSetChanged: {
      missing: [...frozen.keys()].filter((k) => !current.has(k)).sort(byString),
      extra: [...current.keys()].filter((k) => !frozen.has(k)).sort(byString),
    },
    inputChanged: [],
    servedChanged: [],
    movedToFaithful: [],
  };
  for (const [id, was] of frozen) {
    const now = current.get(id);
    if (!now) continue;
    result.unitsCompared++;
    const filesChanged =
      fileSha(now.enSource) !== was.enSha256 || fileSha(now.mtOutput) !== was.mtSha256;
    if (filesChanged) result.inputChanged.push(id);
    if (now.isSource === 'faithful') {
      result.movedToFaithful.push(id);
      result.unitsSkippedFaithful++;
      continue;
    }
    if (filesChanged) continue;
    const key = (segmentId, occurrence) => JSON.stringify([segmentId, occurrence]);
    const had = new Map(
      (linesByUnit.get(`${was.chapter}/${was.moduleId}`) || []).map((l) => [
        key(l.segment_id, l.occurrence),
        l,
      ])
    );
    const has = new Map((now.rows || []).map((r) => [key(r.segmentId, r.occurrence), r]));
    const keys = new Set([...had.keys(), ...has.keys()]);
    result.segmentsCompared += keys.size;
    for (const k of keys) {
      const a = had.get(k);
      const b = has.get(k);
      if (!a || !b || a.en_sha256 !== b.enSha256 || a.is_sha256 !== b.isSha256) {
        const [segmentId, occurrence] = JSON.parse(k);
        result.servedChanged.push({ unit: id, segmentId, occurrence });
      }
    }
  }
  result.pass =
    result.unitSetChanged.missing.length === 0 &&
    result.unitSetChanged.extra.length === 0 &&
    result.inputChanged.length === 0 &&
    result.servedChanged.length === 0;
  return result;
}

function runCheck(args, io) {
  if (args.write || args.tag !== null || args.supersedes !== null) {
    throw usage('--write, --tag and --supersedes do not apply to check');
  }
  const { book } = args;
  let markers;
  try {
    markers = checkMarkers({ book });
  } catch (e) {
    if (e.code !== 'ENOENT') throw e; // listStudyUnits: the book has no 02-for-mt directory
    io.error('STUDY FREEZE CHECK: FAIL');
    io.error(`no study units: ${book}/02-for-mt does not exist`);
    return 1;
  }
  const lines = [`markers: ${markers.freeze}/${markers.total} units hold the freeze marker`];
  if (markers.total === 0) lines.push(`no study units: ${book}/02-for-mt lists none`);
  if (markers.absent.length > 0) {
    lines.push(`markers absent: ${markers.absent.length}: ${listed(markers.absent)}`);
  }
  if (markers.foreign.length > 0) {
    lines.push(`markers foreign: ${markers.foreign.length}: ${listed(markers.foreign)}`);
  }
  if (markers.noMt.length > 0) {
    lines.push(`no MT output: ${markers.noMt.length} unit(s): ${listed(markers.noMt)}`);
  }
  let pass =
    markers.total > 0 &&
    markers.absent.length === 0 &&
    markers.foreign.length === 0 &&
    markers.noMt.length === 0;
  // A FAIL that stops early still prints the marker summary first.
  const failWith = (reason) => {
    io.error('STUDY FREEZE CHECK: FAIL');
    for (const l of [...lines, reason]) io.error(l);
    return 1;
  };
  let manifest;
  try {
    manifest = args.manifest ? { dir: path.resolve(args.manifest) } : currentManifest({ book });
  } catch (e) {
    if (e.code === 'AMBIGUOUS') return failWith(`no single current manifest: ${e.message}`);
    if (e.code === 'BAD_INPUT') return failWith(`manifest unreadable: ${e.message}`);
    throw e;
  }
  const bad = [];
  if (manifest === null) {
    lines.push('no manifest yet: verified markers only');
  } else {
    let r;
    try {
      r = compareToManifest({ book, manifestDir: manifest.dir });
    } catch (e) {
      if (e.code !== 'BAD_INPUT' && e.code !== 'ENOENT') throw e;
      return failWith(`manifest unreadable: ${path.basename(manifest.dir)}: ${e.message}`);
    }
    lines.push(`manifest: ${path.basename(manifest.dir)}`);
    lines.push(
      `compared: ${r.unitsCompared} unit(s) by English and MT file hash, ${r.segmentsCompared} ` +
        `segment(s) by served hash; ${r.unitsSkippedFaithful} unit(s) served from faithful, ` +
        'their segments not compared'
    );
    const { missing, extra } = r.unitSetChanged;
    if (missing.length > 0) bad.push(`units missing: ${missing.length}: ${listed(missing)}`);
    if (extra.length > 0) bad.push(`units added: ${extra.length}: ${listed(extra)}`);
    if (r.inputChanged.length > 0) {
      bad.push(`input changed: ${r.inputChanged.length} unit(s): ${listed(r.inputChanged)}`);
    }
    if (r.servedChanged.length > 0) {
      const keys = r.servedChanged.map((s) => `${s.unit}#${s.segmentId}#${s.occurrence}`);
      bad.push(`served text changed, inputs unchanged: ${keys.length} segment(s): ${listed(keys)}`);
    }
    if (bad.length > 0) {
      const current = manifest.header ? manifest.header.tag : path.basename(manifest.dir);
      bad.push(
        "re-cut route: if the change is deliberate, record it with a re-cut, which is the project lead's decision " +
          `(spec §6.6): manifest --write --tag freeze-${book}-<YYYY-MM-DD> --supersedes ${current}`,
        'otherwise fix or revert the change that moved the hash'
      );
    }
    if (r.movedToFaithful.length > 0) {
      lines.push(
        `moved to faithful (not a failure): ${r.movedToFaithful.length}: ${listed(r.movedToFaithful)}`
      );
    }
    pass = pass && r.pass;
  }
  const log = pass ? io.log : io.error;
  log(`STUDY FREEZE CHECK: ${pass ? 'PASS' : 'FAIL'}`);
  for (const l of [...lines, ...bad]) log(l);
  return pass ? 0 : 1;
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────

function runMarkers(args, io) {
  const plan = planMarkers(args);
  if (plan.refusals.length > 0) {
    for (const r of plan.refusals) io.error(`refused: ${r.unit} (${r.reason})`);
    if (plan.refusals.some((r) => r.reason === 'foreign-marker')) {
      io.error(
        "a foreign marker may hold a person's first-save time: do not open, print or delete it; " +
          "what to do with it is the project lead's call (spec §7)"
      );
    }
    io.error('nothing written');
    return 1;
  }
  if (!args.write) {
    const absent = plan.units.filter((u) => u.state === 'absent').length;
    io.log(`dry run: ${absent} of ${plan.units.length} units to lock (pass --write to write)`);
    return 0;
  }
  const r = writeMarkers(plan);
  io.log(`written ${r.written}, already ${r.already}, total ${r.total}`);
  return 0;
}

/**
 * @param {string[]} argv
 * @param {{log: Function, error: Function}} io
 * @param {{git?: object}} deps tests inject `git` (the shape gitFacts returns); the CLI reads git
 * @returns {number} 0 on success, 1 on a refusal, a failure or a usage error
 */
function main(argv, io = { log: console.log, error: console.error }, deps = {}) {
  try {
    const args = parseArgs(argv);
    if (args.command === 'markers') return runMarkers(args, io);
    if (args.command === 'manifest') return runManifest(args, io, deps);
    return runCheck(args, io);
  } catch (e) {
    if (e.code !== 'USAGE') throw e;
    io.error(`usage error: ${e.message}`);
    return 1;
  }
}

// A file run sets require.main; a stdin run (`node -`) does not, and must still execute.
const runDirectly = require.main === module || (module.id === '[stdin]' && process.argv[1] === '-');
if (runDirectly) {
  process.exitCode = 1; // a failure default: a run that dies before main() returns is never 0
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  parseArgs,
  planMarkers,
  writeMarkers,
  gitFacts,
  manifestRefusals,
  buildManifest,
  writeManifest,
  currentManifest,
  checkMarkers,
  compareToManifest,
  main,
};
