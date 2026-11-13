#!/usr/bin/env node
/**
 * G1.12 Task 5, an out-of-scope finding (register §C217 ①): the census of notes whose
 * `note-title` segment would come from a title that is not the note's own.
 *
 *   node test-results/g112-duplicate-ids-2026-11-12/note-title-census.mjs
 *
 * `processNote` (tools/cnxml-extract.js) finds a note's title with
 * `note.content.match(/<title>([\s\S]*?)<\/title>/)`: the FIRST attribute-less `<title>` anywhere
 * inside the note, at any depth. A note with no title of its own but a titled paragraph (or list,
 * figure, table) inside it therefore gets a `note-title` segment holding that descendant's title.
 * Task 1's fixtures B and D show it on a nested note; G1.12 does not change it.
 *
 * This counts the shape in every `books/<slug>/01-source/** /*.cnxml` by PARSING (xmldom), per
 * note: the quirk fires when the first attribute-less `<title>` element in document order inside
 * the note is not a direct child of the note. Notes are split by their nearest container ancestor
 * (example, exercise, note, or none). For notes that carry an id, it then checks reach in the
 * COMMITTED `02-for-mt`: does `<module>:note-title:<note id>-title` exist there?
 *
 * It also prints, per book, the notes whose parent is an `<example>` (the shape of Task 1's fixtures)
 * and how many of them have a `<title>` element of their own as a direct child.
 *
 * Read-only. The exit code is 1 until the census is printed.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';

process.exitCode = 1;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOKS = join(REPO_ROOT, 'books');
const CONTAINERS = new Set(['example', 'exercise', 'note']);

const walk = (d, out = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.cnxml')) out.push(p);
  }
  return out;
};
const elementChildren = (n) => [...n.childNodes].filter((c) => c.nodeType === 1);
function firstPlainTitle(note) {
  // document order, any depth; attribute-less, as the regex `<title>` requires
  let found = null;
  (function visit(n) {
    for (const c of elementChildren(n)) {
      if (found) return;
      if (c.localName === 'title' && c.attributes.length === 0) {
        found = c;
        return;
      }
      visit(c);
    }
  })(note);
  return found;
}
function nearestContainer(note) {
  for (let p = note.parentNode; p && p.nodeType === 1; p = p.parentNode) {
    if (CONTAINERS.has(p.localName)) return p.localName;
  }
  return 'none';
}
const norm = (s) =>
  String(s || '')
    .replace(/\s+/g, ' ')
    .trim();

const out = ['G1.12 Task 5: note-title census (processNote first-<title> regex)', ''];
const grand = { files: 0, notes: 0, quirk: 0 };
for (const slug of readdirSync(BOOKS).sort()) {
  const src = join(BOOKS, slug, '01-source');
  if (!existsSync(src) || !statSync(src).isDirectory()) continue;
  const files = walk(src).sort();
  const t = {
    files: files.length,
    notes: 0,
    quirk: 0,
    byContainer: {},
    byTitleParent: {},
    idless: 0,
    inExample: 0,
    inExampleTitled: 0,
  };
  const reach = { checked: 0, segFileMissing: 0, found: 0, notFound: 0, examples: [] };
  for (const f of files) {
    const xml = readFileSync(f, 'utf8');
    const doc = new DOMParser({ onError() {} }).parseFromString(xml, 'text/xml');
    const notes = [...doc.getElementsByTagName('note')];
    const moduleId = f.match(/(m\d+)\.cnxml$/)?.[1];
    const chapterDir = relative(src, dirname(f)).split('/')[0];
    for (const note of notes) {
      t.notes += 1;
      if (note.parentNode && note.parentNode.localName === 'example') {
        t.inExample += 1;
        if (elementChildren(note).some((c) => c.localName === 'title')) t.inExampleTitled += 1;
      }
      const title = firstPlainTitle(note);
      if (!title || title.parentNode === note) continue;
      t.quirk += 1;
      const c = nearestContainer(note);
      t.byContainer[c] = (t.byContainer[c] || 0) + 1;
      const tp = title.parentNode.localName;
      t.byTitleParent[tp] = (t.byTitleParent[tp] || 0) + 1;
      const noteId = note.getAttribute('id');
      if (!noteId) {
        t.idless += 1;
        continue;
      }
      if (!moduleId) continue;
      const segFile = join(BOOKS, slug, '02-for-mt', chapterDir, `${moduleId}-segments.en.md`);
      reach.checked += 1;
      if (!existsSync(segFile)) {
        reach.segFileMissing += 1;
        continue;
      }
      const seg = readFileSync(segFile, 'utf8');
      const marker = `<!-- SEG:${moduleId}:note-title:${noteId}-title -->`;
      const at = seg.indexOf(marker);
      if (at < 0) {
        reach.notFound += 1;
        continue;
      }
      reach.found += 1;
      if (reach.examples.length < 3) {
        const rest = seg.slice(at + marker.length);
        const next = rest.indexOf('<!-- SEG:');
        reach.examples.push(
          `${chapterDir} ${moduleId} ${noteId} (inside ${c}; title of a <${tp}>): ` +
            `segment "${norm(next >= 0 ? rest.slice(0, next) : rest)}" / source title "${norm(title.textContent)}"`
        );
      }
    }
  }
  grand.files += t.files;
  grand.notes += t.notes;
  grand.quirk += t.quirk;
  out.push(
    `${slug}: ${t.files} cnxml files, ${t.notes} notes, ${t.quirk} with a borrowed first <title>`
  );
  out.push(
    `  notes whose parent is an <example>: ${t.inExample}, with a <title> of their own: ${t.inExampleTitled}`
  );
  if (t.quirk) {
    out.push(`  by nearest container: ${JSON.stringify(t.byContainer)}`);
    out.push(`  the borrowed title belongs to: ${JSON.stringify(t.byTitleParent)}`);
    out.push(`  notes without an id (reach not checked): ${t.idless}`);
    out.push(
      `  reach in committed 02-for-mt: ${reach.checked} checked; segment file absent ${reach.segFileMissing}; ` +
        `note-title segment present ${reach.found}; absent ${reach.notFound}`
    );
    for (const e of reach.examples) out.push(`    e.g. ${e}`);
  }
}
out.push(
  '',
  `TOTAL: ${grand.files} files, ${grand.notes} notes, ${grand.quirk} with a borrowed first <title>`
);
process.stdout.write(out.join('\n') + '\n');
process.exitCode = grand.notes > 0 ? 0 : 1; // control: an empty walk is not a census
