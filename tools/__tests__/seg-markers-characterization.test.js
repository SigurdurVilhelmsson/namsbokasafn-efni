import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSegmentsMap, parseSegmentRecords } from '../lib/seg-markers.cjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── verbatim copies of the OLD parsers (the golden behavior) ──
function oldPatternAFirst(content) {
  // inject / repair-emphasis
  const segments = new Map();
  const pattern = /<!-- SEG:([^\s]+) -->[ \t]*\n?([\s\S]*?)(?=<!-- SEG:|$)/g;
  let m;
  while ((m = pattern.exec(content)) !== null) {
    const id = m[1],
      t = m[2].trim();
    if (!segments.has(id)) segments.set(id, t);
  }
  return segments;
}
function oldPatternALast(content) {
  // module-sections / auto-insert
  const segments = new Map();
  const pattern = /<!-- SEG:([^\s]+) -->[ \t]*\n?([\s\S]*?)(?=<!-- SEG:|$)/g;
  let m;
  while ((m = pattern.exec(content)) !== null) {
    segments.set(m[1], m[2].trim());
  }
  return segments;
}
const OLD_STRICT = /<!--\s*SEG:([\w]+:[\w-]+:[\w-]+)\s*-->/g;
function oldPatternBFirst(content) {
  // generate-tm
  const segments = new Map();
  if (!content) return segments;
  let currentId = null,
    contentStart = 0;
  for (const m of content.matchAll(OLD_STRICT)) {
    if (currentId !== null && !segments.has(currentId))
      segments.set(currentId, content.slice(contentStart, m.index).trim());
    currentId = m[1];
    contentStart = m.index + m[0].length;
  }
  if (currentId !== null && !segments.has(currentId))
    segments.set(currentId, content.slice(contentStart).trim());
  return segments;
}

function allSegmentFiles() {
  const files = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      // item 9/D3: exercises-segments files are OUTSIDE the characterization
      // domain — their seg-ids ({nickname}:{type}:{id}, hyphens in component 1)
      // never matched the legacy OLD_STRICT parser ([\w]+ first component), and
      // no legacy consumer ever read them (they postdate the unification; only
      // the new parser, via exercise-assemble, consumes them). Same exact-name
      // guard as the 6b gate / server listing / scan-residue.
      if (n === 'exercises-segments.en.md' || n === 'exercises-segments.is.md') continue;
      fs.statSync(p).isDirectory()
        ? walk(p)
        : /-segments.*\.md$|\.(en|is)\.md$/.test(n) && files.push(p);
    }
  };
  for (const b of fs.readdirSync(path.join(REPO, 'books'))) {
    const bd = path.join(REPO, 'books', b);
    if (!fs.statSync(bd).isDirectory()) continue;
    for (const sub of ['02-for-mt', '02-mt-output', '03-faithful-translation'])
      walk(path.join(bd, sub));
  }
  return files;
}

const mapEq = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

describe('seg-markers characterization (no-op proof on real corpus)', () => {
  const files = allSegmentFiles();
  it('finds a representative corpus (incl. dup-id files)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('corpus contains at least 1000 markers (guards against vacuous equality passes on empty corpus)', () => {
    let totalMarkers = 0;
    for (const f of files) totalMarkers += parseSegmentsMap(fs.readFileSync(f, 'utf8')).size;
    expect(totalMarkers).toBeGreaterThan(1000);
  });

  it('parseSegmentsMap(first) matches old Pattern-A-first on every file', () => {
    const diffs = files.filter((f) => {
      const c = fs.readFileSync(f, 'utf8');
      return !mapEq(parseSegmentsMap(c), oldPatternAFirst(c));
    });
    expect(diffs).toEqual([]);
  });
  it('parseSegmentsMap(last) matches old Pattern-A-last on every file', () => {
    const diffs = files.filter((f) => {
      const c = fs.readFileSync(f, 'utf8');
      return !mapEq(parseSegmentsMap(c, { duplicates: 'last' }), oldPatternALast(c));
    });
    expect(diffs).toEqual([]);
  });
  it('parseSegmentsMap(first) matches old Pattern-B-first (generate-tm) on every file', () => {
    const diffs = files.filter((f) => {
      const c = fs.readFileSync(f, 'utf8');
      return !mapEq(parseSegmentsMap(c), oldPatternBFirst(c));
    });
    expect(diffs).toEqual([]);
  });
  it('parseSegmentRecords content matches old Pattern-B slice on every file', () => {
    // Pattern-A (lookahead keep-all) coincides with the lib's marker-based strict slice on this
    // corpus: the 54k-marker proof rules out stray non-marker "<!-- SEG:" prefixes, so the strict
    // golden validly characterizes docx-import's old Pattern-A behavior too.
    const diffs = files.filter((f) => {
      const c = fs.readFileSync(f, 'utf8');
      const recs = parseSegmentRecords(c);
      // compare against a fresh slice over the strict regex (segmentParser pre-normalizeWraps behavior)
      const old = [];
      let cur = null,
        start = 0;
      for (const m of c.matchAll(new RegExp(OLD_STRICT.source, 'g'))) {
        if (cur) {
          cur.content = c.slice(start, m.index).trim();
          old.push(cur);
        }
        cur = { segmentId: m[1], content: '' };
        start = m.index + m[0].length;
      }
      if (cur) {
        cur.content = c.slice(start).trim();
        old.push(cur);
      }
      return (
        recs.length !== old.length ||
        recs.some((r, i) => r.segmentId !== old[i].segmentId || r.content !== old[i].content)
      );
    });
    expect(diffs).toEqual([]);
  });
});
