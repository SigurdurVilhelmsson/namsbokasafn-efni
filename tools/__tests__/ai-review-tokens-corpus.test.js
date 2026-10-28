/**
 * The tokenizer against the whole committed chemistry corpus, read-only.
 *
 * The independent instrument is `countBracketMarkersAll` from tools/api-translate.js, which
 * tallies `[[type:` openers by regex and knows nothing about nesting or literal brackets.
 * If the depth-aware tokenizer drops, merges or invents a marker anywhere (`]]]`, `]]]]`,
 * `[[[i:`, markers inside a footnote payload), a per-type count disagrees.
 *
 * Unit files are named, never globbed loosely: only `<stem>-segments.<lang>.md` with
 * stem m\d+ or chapter-metadata. The split `-segments(b|c|d)` files are a dead mustache
 * vintage and are never read.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tokenize, markerTokens } from '../ai-review/tokens.js';
import { countBracketMarkersAll, KNOWN_BRACKET_TYPES } from '../api-translate.js';

const require = createRequire(import.meta.url);
const { parseSegmentRecords } = require('../lib/seg-markers.cjs');

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOK = path.join(REPO, 'books', 'efnafraedi-2e');
const UNIT_RE = /^(m\d+|chapter-metadata)-segments\.(en|is)\.md$/;
const CHAPTER_RE = /^(ch\d\d|appendices)$/;

function unitFiles(tree) {
  const root = path.join(BOOK, tree);
  return fs
    .readdirSync(root)
    .filter((d) => CHAPTER_RE.test(d))
    .flatMap((d) =>
      fs
        .readdirSync(path.join(root, d))
        .filter((f) => UNIT_RE.test(f))
        .map((f) => path.join(root, d, f))
    );
}

const bodies = ['02-mt-output', '02-for-mt'].flatMap((tree) =>
  unitFiles(tree).flatMap((file) =>
    parseSegmentRecords(fs.readFileSync(file, 'utf8')).map((r) => ({
      where: `${path.relative(BOOK, file)} ${r.segmentId}`,
      text: r.content,
    }))
  )
);

/** Per-type counts of what the tokenizer found, in countBracketMarkersAll's shape. */
function tokenizerCounts(text) {
  const counts = Object.fromEntries([...KNOWN_BRACKET_TYPES].map((t) => [t, 0]));
  for (const tok of markerTokens(text)) {
    const m = /^\[\[([^:|\]]+):/.exec(tok);
    if (m && m[1] in counts) counts[m[1]]++;
  }
  return counts;
}

describe('tokenizer over the committed chemistry corpus', () => {
  it('reads a non-trivial corpus (positive control: the instrument has something to see)', () => {
    const markers = bodies.reduce((n, b) => n + markerTokens(b.text).length, 0);
    expect({ segments: bodies.length > 20000, markers: markers > 20000 }).toEqual({
      segments: true,
      markers: true,
    });
  });

  it('reassembles every segment body byte for byte', () => {
    const bad = bodies
      .filter(
        (b) =>
          tokenize(b.text)
            .nodes.map((n) => n.text)
            .join('') !== b.text
      )
      .map((b) => b.where);
    expect(bad).toEqual([]);
  });

  it('agrees with countBracketMarkersAll on every typed marker in every segment', () => {
    const bad = bodies
      .filter((b) => {
        const a = tokenizerCounts(b.text);
        const r = countBracketMarkersAll(b.text);
        return [...KNOWN_BRACKET_TYPES].some((t) => (a[t] || 0) !== (r[t] || 0));
      })
      .map((b) => b.where);
    expect(bad).toEqual([]);
  });

  it('agrees with a plain regex on the bare [[BR]] and [[SPACE]] markers', () => {
    const bad = bodies
      .filter((b) => {
        const toks = markerTokens(b.text);
        return ['[[BR]]', '[[SPACE]]'].some(
          (bare) => toks.filter((t) => t === bare).length !== b.text.split(bare).length - 1
        );
      })
      .map((b) => b.where);
    expect(bad).toEqual([]);
  });

  it('finds exactly one malformed segment: an MT-invented marker whose lemma has a space', () => {
    // Measured 2026-10-26. The MT wrapped a glossary word as `[[test tube:tilraunaglas]]`;
    // a type token with whitespace is not an opener (as in unwrapInventedMarkers, so the
    // unwrap step left it too), and its `]]` closes nothing. The gate refuses every
    // operation on such a segment (segment-malformed) rather than guess at the markup.
    // A new entry here is a new markup defect in a committed tree, not noise.
    const bad = bodies
      .filter((b) => tokenize(b.text).problems.length > 0)
      .map(
        (b) =>
          `${b.where}: ${tokenize(b.text)
            .problems.map((p) => p.code)
            .join(',')}`
      );
    expect(bad).toEqual([
      '02-mt-output/ch18/m68832-segments.is.md m68832:alt:fs-idm121503472-alt: stray-closer',
    ]);
  });
});
