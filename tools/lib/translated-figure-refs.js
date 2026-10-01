/**
 * Where a figure's translated copy lives, and what still references it (§C140 ㊵, spec D13).
 *
 * ONE corpus and ONE predicate, shared by tools/retire-translated-figure.js (its report and
 * --prune) and the figure-config validator:
 *
 * - THE CORPUS is the WORKING-TREE content of every file git does not ignore under a book's
 *   03-translated/ and 05-publication/ (`git ls-files -co --exclude-standard`). Not a disk walk:
 *   inject leaves gitignored `<module>.cnxml.backup.<ts>` files naming every figure it ever saw,
 *   and they would keep every copy alive (measured: 0 of 754 deletable). Not HEAD: HEAD cannot
 *   see a re-render's uncommitted pages.
 * - Raster, font and other binary files are skipped, and so are THE TRANSLATED COPIES THEMSELVES.
 *   A composed SVG embeds its fonts and rasters and references no other file (measured 2026-10-01:
 *   0 external href/src/url references in 1,471 translated SVGs), and the copies are 821 MB of the
 *   879 MB corpus. Without them a scan takes about 0.4 s. If the composer ever writes an external
 *   reference into a figure, this exclusion must be revisited.
 * - A REFERENCE to a translated file is its stem plus a dot — `<name><suffix>.` — anywhere in a
 *   corpus file. Keyed on the suffix, so the restored English `<name>.jpg` and look-alike names
 *   (`molecreso2`) are never references.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

/** Extensions the reference scan skips: raster, font and archive bytes cannot make a browser fetch a figure. */
export const SKIP_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.tif',
  '.tiff',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.pdf',
  '.zip',
]);

/** True for a translated file name: `<stem><suffix>.<ext>`, the suffix ending the stem. */
export function isTranslatedName(fileName, suffix) {
  const ext = path.extname(fileName);
  return ext !== '' && fileName.slice(0, -ext.length).endsWith(suffix);
}

/** The string whose presence in a corpus file is a reference to `fileName`: its stem plus '.'. */
export function referenceNeedle(fileName) {
  return fileName.slice(0, -path.extname(fileName).length) + '.';
}

/** Run git at `repoRoot`. Injected in tests. @returns {{status:number, stdout:string, stderr:string}} */
export function runGit(repoRoot, args) {
  const r = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf-8', maxBuffer: 1 << 28 });
  return {
    status: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? String(r.error ?? ''),
  };
}

/**
 * Repo-relative paths of every file git does not ignore under `relDirs`, tracked or not.
 * `--literal-pathspecs`: a figure name containing `*` or `[` is a name, not a pattern.
 * @throws {Error} when git fails — an unreadable corpus must never read as an empty one
 */
export function gitVisibleFiles(repoRoot, relDirs, git = runGit) {
  const r = git(repoRoot, [
    '--literal-pathspecs',
    'ls-files',
    '-co',
    '--exclude-standard',
    '-z',
    '--',
    ...relDirs,
  ]);
  if (r.status !== 0) throw new Error(`git ls-files failed in ${repoRoot}: ${r.stderr.trim()}`);
  return [...new Set(r.stdout.split('\0').filter(Boolean))];
}

/**
 * @param {{repoRoot:string, bookRel:string, needles:Set<string>, suffix:string, git?:Function, readFile?:Function}} o
 * @returns {Map<string, string[]>} each needle → the corpus files containing it (repo-relative)
 */
export function findReferences({
  repoRoot,
  bookRel,
  needles,
  suffix,
  git = runGit,
  readFile = fs.readFileSync,
}) {
  const hits = new Map([...needles].map((n) => [n, []]));
  const list = [...needles];
  if (list.length === 0) return hits;
  const maxLen = Math.max(...list.map((n) => n.length));
  const marker = `${suffix}.`;
  const files = gitVisibleFiles(
    repoRoot,
    [`${bookRel}/03-translated`, `${bookRel}/05-publication`],
    git
  );
  for (const rel of files) {
    const base = path.basename(rel);
    if (SKIP_EXTENSIONS.has(path.extname(base).toLowerCase())) continue;
    if (isTranslatedName(base, suffix)) continue;
    let text;
    try {
      text = readFile(path.join(repoRoot, rel), 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') continue; // tracked, deleted from the working tree
      throw err;
    }
    // Every needle ends with the marker, so only the text just before each marker can match.
    const found = new Set();
    for (let i = text.indexOf(marker); i !== -1; i = text.indexOf(marker, i + 1)) {
      const end = i + marker.length;
      const window = text.slice(Math.max(0, end - maxLen), end);
      for (const n of list) if (window.endsWith(n)) found.add(n);
    }
    for (const n of found) hits.get(n).push(rel);
  }
  return hits;
}

const isDir = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory();

/**
 * Every published copy: a translated file directly under
 * `<book>/05-publication/<track>/chapters/<dir>/images/media/`. Found by WALKING — a chapter dir is
 * `NN` or `appendices` there, never `chNN`, and building that path is a known trap.
 * @returns {string[]} sorted repo-relative paths
 */
export function publishedCopies(repoRoot, bookRel, suffix) {
  const pub = path.join(repoRoot, bookRel, '05-publication');
  const out = [];
  if (!isDir(pub)) return out;
  for (const track of fs.readdirSync(pub)) {
    const chapters = path.join(pub, track, 'chapters');
    if (!isDir(chapters)) continue;
    for (const chapter of fs.readdirSync(chapters)) {
      const media = path.join(chapters, chapter, 'images', 'media');
      if (!isDir(media)) continue;
      for (const e of fs.readdirSync(media, { withFileTypes: true })) {
        if (e.isFile() && isTranslatedName(e.name, suffix)) {
          out.push(
            path.join(
              bookRel,
              '05-publication',
              track,
              'chapters',
              chapter,
              'images',
              'media',
              e.name
            )
          );
        }
      }
    }
  }
  return out.sort();
}

/**
 * The subset of `rels` that git tracks and that is unmodified against HEAD — staged or not.
 * Any other git outcome (untracked, ignored, modified, no commits, git missing) leaves a path out:
 * git is the backup a deletion relies on, so nothing git cannot restore is deleted.
 * @returns {Set<string>}
 */
export function cleanTrackedSet(repoRoot, rels, git = runGit) {
  if (rels.length === 0) return new Set();
  const tracked = git(repoRoot, ['--literal-pathspecs', 'ls-files', '-z', '--', ...rels]);
  const dirty = git(repoRoot, [
    '--literal-pathspecs',
    'diff',
    '--name-only',
    '-z',
    'HEAD',
    '--',
    ...rels,
  ]);
  if (tracked.status !== 0 || dirty.status !== 0) return new Set();
  const t = new Set(tracked.stdout.split('\0').filter(Boolean));
  const d = new Set(dirty.stdout.split('\0').filter(Boolean));
  return new Set(rels.filter((r) => t.has(r) && !d.has(r)));
}

/** @returns {{area:string, track:string|null, chapter:string|null}} for a corpus path */
export function locate(rel, bookRel) {
  const parts = path.relative(bookRel, rel).split(path.sep);
  if (parts[0] === '05-publication') {
    return {
      area: parts[0],
      track: parts[1] ?? null,
      chapter: parts[2] === 'chapters' ? (parts[3] ?? null) : null,
    };
  }
  if (parts[0] === '03-translated') {
    return { area: parts[0], track: parts[1] ?? null, chapter: parts.length > 3 ? parts[2] : null };
  }
  return { area: parts[0], track: null, chapter: null };
}

/**
 * The mapping rows, or a refusal. ⚠️ Never `loadImageBasenameMap`: it reads an unreadable file as
 * `[]`, which is right for a renderer and wrong for anything that rewrites the file.
 * @throws {Error} when the file is unreadable, invalid JSON, or not an array of objects
 */
export function readMappingOrRefuse(mappingPath, { allowMissing = false } = {}) {
  let raw;
  try {
    raw = fs.readFileSync(mappingPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT' && allowMissing) return [];
    throw new Error(
      `${mappingPath} cannot be read (${err.code || err.message}); refusing to act on a mapping I cannot see`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `${mappingPath} is not valid JSON (${err.message}); refusing to rewrite it — repair it first`
    );
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some((r) => r === null || typeof r !== 'object' || Array.isArray(r))
  ) {
    throw new Error(
      `${mappingPath} is not an array of objects; refusing to rewrite it — repair it first`
    );
  }
  return parsed;
}

/** File names `<name><suffix>.<ext>` at the TOP of `<bookDir>/media/` (one extension, no subfolders). */
export function topLevelTranslatedCopies(bookDir, name, suffix) {
  const mediaDir = path.join(bookDir, 'media');
  if (!isDir(mediaDir)) return [];
  const prefix = `${name}${suffix}.`;
  return fs
    .readdirSync(mediaDir, { withFileTypes: true })
    .filter(
      (e) => e.isFile() && e.name.startsWith(prefix) && !e.name.slice(prefix.length).includes('.')
    )
    .map((e) => e.name)
    .sort();
}

/** Write through a temp file in the same directory (`*.tmp` is gitignored) and rename over the target. */
export function writeAtomically(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

/** Restore tracked files from HEAD. @throws {Error} when git cannot */
export function restoreFromHead(repoRoot, rels, git = runGit) {
  if (rels.length === 0) return;
  const r = git(repoRoot, [
    '--literal-pathspecs',
    'restore',
    '--source=HEAD',
    '--worktree',
    '--',
    ...rels,
  ]);
  if (r.status !== 0) throw new Error(`git restore failed: ${r.stderr.trim()}`);
}
