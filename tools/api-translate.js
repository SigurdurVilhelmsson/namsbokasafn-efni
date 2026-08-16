#!/usr/bin/env node

/**
 * api-translate.js — Automated MT via Málstaður API
 *
 * Translates English segment files to Icelandic using the Miðeind Málstaður
 * API. Sends whole module files directly — no protection or splitting needed.
 * Part of the Extract-Inject-Render pipeline.
 *
 * Usage:
 *   node tools/api-translate.js --book <slug> --chapter <num> [--module <id>]
 *   node tools/api-translate.js --book <slug>
 *   node tools/api-translate.js --book <slug> --dry-run
 *
 * Options:
 *   --book <slug>       Book slug (default: efnafraedi-2e)
 *   --chapter <num>     Chapter number (omit for whole book)
 *   --module <id>       Single module ID (requires --chapter)
 *   --force             Overwrite existing output files
 *   --dry-run, -n       Show what would be translated + cost estimate
 *   --no-glossary       Don't send glossary terms with requests
 *   --rate-delay <ms>   Delay between API calls (default: 500)
 *   -v, --verbose       Detailed progress output
 *   -h, --help          Show this help
 *
 * Environment:
 *   MALSTADUR_API_KEY   API key from Miðeind (or set in .env file)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseArgs,
  BOOK_OPTION,
  CHAPTER_OPTION,
  MODULE_OPTION,
  requireBook,
} from './lib/parseArgs.js';
import { createClient, formatGlossary, estimateIsk } from './lib/malstadur-api.js';
import { bookToDomain } from './lib/book-rendering-config.js';
import { writeProvenance } from './lib/provenance.js';
import { buildRunRecord, glossaryContentHash } from './lib/run-record.js';
import { isMtLocked } from './lib/mt-lock.cjs';

// ─── Configuration ──────────────────────────────────────────────────

let BOOKS_DIR = 'books/efnafraedi-2e';

// ─── Unicode Normalization ──────────────────────────────────────────

const SUBSCRIPT_MAP = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
  '₊': '+',
  '₋': '-',
  '₌': '=',
  '₍': '(',
  '₎': ')',
};

const SUPERSCRIPT_MAP = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁺': '+',
  '⁻': '-',
  '⁼': '=',
  '⁽': '(',
  '⁾': ')',
};

const SUB_CHARS = Object.keys(SUBSCRIPT_MAP).join('');
const SUP_CHARS = Object.keys(SUPERSCRIPT_MAP).join('');

const SUB_REGEX = new RegExp(`[${SUB_CHARS}]+`, 'g');
const SUP_REGEX = new RegExp(`[${SUP_CHARS}]+`, 'g');

/**
 * Convert Unicode subscript/superscript characters to ~N~ / ^N^ markdown format.
 * Groups consecutive characters: ₁₂₃ → ~123~
 */
export function normalizeUnicode(text) {
  let result = text.replace(SUB_REGEX, (match) => {
    const converted = [...match].map((ch) => SUBSCRIPT_MAP[ch]).join('');
    return `~${converted}~`;
  });
  result = result.replace(SUP_REGEX, (match) => {
    const converted = [...match].map((ch) => SUPERSCRIPT_MAP[ch]).join('');
    return `^${converted}^`;
  });
  return result;
}

// Match C0 control characters except the three valid in text: tab, LF, CR.
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

/**
 * Fail loud if the MT API response contains C0 control characters.
 *
 * The Málstaður API has been observed corrupting the degree sign (U+00B0) into
 * a NUL byte (sometimes NUL + literal "b0"). NUL and other C0 control chars are
 * invalid in XML 1.0 / HTML and silently corrupt content three pipeline stages
 * downstream (inject → render → publication). Catching it here, at the producer
 * boundary, surfaces the problem at the MT stage instead of in published HTML.
 *
 * @param {string} text - The text to check (an API response chunk).
 * @param {string} label - A module/chunk label for the error message.
 * @returns {string} The same text, unchanged, when it is clean.
 * @throws {Error} When `text` contains any C0 control char other than tab/LF/CR.
 */
export function assertNoControlChars(text, label) {
  const matches = text.match(CONTROL_CHAR_REGEX);
  if (matches) {
    const codes = [...new Set(matches)]
      .map((ch) => `0x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(', ');
    throw new Error(
      `${label}: MT API returned ${matches.length} C0 control char(s) [${codes}]. ` +
        `These are invalid in XML/HTML and corrupt content downstream ` +
        `(e.g. the degree sign U+00B0 has been seen mangled to NUL). ` +
        `Refusing to write corrupted output.`
    );
  }
  return text;
}

// ─── SEG Tag Repair ─────────────────────────────────────────────────

/**
 * Repair SEG tags corrupted by the MT API.
 * The API occasionally inserts hyphens in numeric module IDs
 * (e.g., m68683 → m6-8683).
 */
export function repairSegTags(input, output) {
  // Build set of valid SEG tag IDs from input
  const inputTags = new Set();
  for (const match of input.matchAll(/<!-- SEG:(\S+?) -->/g)) {
    inputTags.add(match[1]);
  }

  // Build a map of suffix → full tag ID for fuzzy matching.
  // The suffix is everything after the module ID (e.g., ":para:fs-idp123")
  const suffixMap = new Map();
  for (const tag of inputTags) {
    const colonIdx = tag.indexOf(':');
    if (colonIdx > 0) {
      const suffix = tag.substring(colonIdx); // e.g., ":para:fs-idp123"
      suffixMap.set(suffix, tag);
    }
  }

  return output.replace(/<!-- SEG:(\S+?) -->/g, (fullMatch, tagId) => {
    if (inputTags.has(tagId)) return fullMatch;

    // Strategy 1: Remove hyphens from module ID (e.g., m6-8683 → m68683)
    const cleaned = tagId.replace(/^(m)([0-9-]+?)(:.*)$/, (_, prefix, digits, rest) => {
      return `${prefix}${digits.replace(/-/g, '')}${rest}`;
    });
    if (inputTags.has(cleaned)) {
      return `<!-- SEG:${cleaned} -->`;
    }

    // Strategy 2: Match by suffix — handles character insertion/mutation in module ID
    // (e.g., m6e68667:para:X → m68667:para:X when :para:X is unique in input)
    // Only applies when the corrupted module ID shares most digits with the original
    const colonIdx = tagId.indexOf(':');
    if (colonIdx > 0) {
      const suffix = tagId.substring(colonIdx);
      const match = suffixMap.get(suffix);
      if (match) {
        const corruptedMod = tagId.substring(0, colonIdx);
        const originalMod = match.substring(0, match.indexOf(':'));
        // Extract digits from both and require ≥80% overlap
        const corruptedDigits = corruptedMod.replace(/\D/g, '');
        const originalDigits = originalMod.replace(/\D/g, '');
        // Require a substring relationship AND ≥80% digit-length overlap, so a
        // coincidental single-digit match (e.g. "6" inside "68667") doesn't
        // mis-repair a tag to an unrelated module (F23).
        const shorter = Math.min(corruptedDigits.length, originalDigits.length);
        const longer = Math.max(corruptedDigits.length, originalDigits.length);
        if (
          originalDigits.length > 0 &&
          (corruptedDigits.includes(originalDigits) || originalDigits.includes(corruptedDigits)) &&
          longer > 0 &&
          shorter / longer >= 0.8
        ) {
          return `<!-- SEG:${match} -->`;
        }
      }
    }

    return fullMatch;
  });
}

// ─── .env Loading ───────────────────────────────────────────────────

/**
 * Parse a .env file into a key-value object.
 * Skips comments (#) and empty lines. Strips surrounding quotes.
 */
export function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

// ─── Module Discovery ───────────────────────────────────────────────

/**
 * Find translatable .en.md module files in a directory.
 * Excludes split files like (b).en.md — those are artifacts of the web UI workflow.
 */
export function discoverModules(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.match(/^m\d+-segments\.en\.md$/))
    .sort();
  return files.map((f) => {
    const moduleId = f.match(/^(m\d+)-/)[1];
    return { moduleId, filename: f, path: path.join(dir, f) };
  });
}

/**
 * Exercise segments (item 9/D3): one optional exercises-segments.en.md per
 * chapter dir, produced by exercise-extract.js. Discovered explicitly —
 * discoverModules' m\d+ regex is load-bearing for module identity and must
 * not loosen.
 */
export function discoverExercisesFile(dir) {
  const filename = 'exercises-segments.en.md';
  const p = path.join(dir, filename);
  if (!fs.existsSync(p)) return null;
  return { moduleId: 'exercises', filename, path: p };
}

// ─── Validation ─────────────────────────────────────────────────────

/**
 * Validate that input and output have the same number of SEG markers.
 * Returns false if the API truncated or corrupted the output.
 */
export function validateMarkers(input, output) {
  const inputCount = (input.match(/<!-- SEG:/g) || []).length;
  const outputCount = (output.match(/<!-- SEG:/g) || []).length;
  return inputCount === outputCount;
}

/**
 * Count SEG markers that are not at the start of a line ("inline" markers).
 *
 * The Málstaður API occasionally eats the newline before a marker, gluing a
 * segment's translated text to the following marker, e.g.
 *   Some title<!-- SEG:…:para:… -->
 * The marker count is unchanged, so validateMarkers() passes — but downstream
 * line-based consumers then drop the preceding segment. This counts how many
 * markers are mis-positioned so the condition can be detected, not just fixed.
 *
 * @param {string} text
 * @returns {number} number of markers preceded by non-newline content
 */
export function countInlineMarkers(text) {
  const matches = text.match(/[^\n][ \t]*<!--\s*SEG:/g) || [];
  return matches.length;
}

/** The inline bracket marker types that ride through the MT API as `[[<type>:…]]`. */
export const BRACKET_MARKER_TYPES = [
  'i',
  'b',
  'sub',
  'sup',
  'u',
  'em',
  'link',
  'xref',
  'docref',
  'term',
  'fn',
  // Opaque/escape markers from the os-embed exercise-field converter (item
  // 9/D3, tools/lib/exercise-html.js) — same bracket dialect, same delta
  // exposure (final review m6, widened).
  'MEDIA',
  'lb',
  'rb',
];

/**
 * Every bracket type our own pipeline can legitimately emit — the set that
 * `unwrapInventedMarkers` must never touch.
 *
 * ⚠️ Deliberately WIDER than `BRACKET_MARKER_TYPES`, which covers only the types
 * `bracketMarkerDelta` tallies. The extras are real markers owned by other
 * files, and a set missing one of them EATS A REAL MARKER:
 *   - `MATH` / `TABLE` / `SPACE` / `BR` — atomic placeholders; authority is the
 *     editor client `server/public/js/marker-highlight.js`, and `TABLE` is
 *     emitted by `cnxml-extract.js` and hard-gated by `cnxml-inject.js`.
 *   - `math` (lowercase) — the glossary-term MathML placeholder, `tools/lib/glossary-term.js`.
 *   - `EQ` — the legacy markdown-pipeline placeholder `validate-chapter.js` gates on.
 * Widening this set is safe (an invented marker goes unrepaired); narrowing it
 * destroys content. `api-translate-invented-markers.test.js` guards the drift.
 */
export const KNOWN_BRACKET_TYPES = new Set([
  ...BRACKET_MARKER_TYPES,
  'MATH',
  'TABLE',
  'SPACE',
  'BR',
  'math',
  'EQ',
]);

/**
 * Remove bracket markers the MT INVENTED around glossary target words.
 *
 * The Málstaður model fuses the structured `glossaries` API field with the
 * bracket syntax it sees in the text and emits `[[<glossary-target>|<inflected
 * form>]]` — lemma as the "type", the correct Icelandic as the payload — or the
 * bare `[[<glossary-target>]]`. The English carries no marker at that position,
 * so **nothing real is lost by unwrapping**: the payload is the translation.
 * Register §C67 class 3.
 *
 * A run is only unwrapped when its type is absent from `KNOWN_BRACKET_TYPES`,
 * which is the entire safety argument — see that constant. The type token must
 * also be whitespace-free (prose in brackets is not a marker) and must not look
 * like a closing token (`[[/x]]`).
 *
 * @param {string} text
 * @returns {{ text: string, unwrapped: Array<{type: string, inner: string}> }}
 *          `unwrapped` makes the count reportable rather than silent.
 */
export function unwrapInventedMarkers(text) {
  const s = String(text ?? '');
  const unwrapped = [];
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (!s.startsWith('[[', i)) {
      out += s[i];
      i++;
      continue;
    }
    // Read the type token: everything up to the first `:`, `|` or closing `]]`.
    let j = i + 2;
    let type = '';
    let sep = null;
    while (j < s.length) {
      if (s[j] === ':' || s[j] === '|') {
        sep = s[j];
        break;
      }
      if (s.startsWith(']]', j)) {
        sep = ']]';
        break;
      }
      // A `[` or `]` inside the token means this `[[` is not the opener — the
      // corpus carries literal square brackets abutting real markers
      // (`[[[i:v]], m/s]`, chemistry unit notation). Whitespace rules out prose.
      if (s[j] === '[' || s[j] === ']' || s[j] === '\n' || /\s/.test(s[j])) break;
      type += s[j];
      j++;
    }
    const bare = type.replace(/^\//, '');
    if (sep === null || type === '' || KNOWN_BRACKET_TYPES.has(bare) || type.startsWith('/')) {
      // Real marker, or not an opener at all. Advance ONE character so the scan
      // re-anchors on an inner `[[` — skipping two would step over the real
      // opener in `[[[i:v]]` and leave it unexamined.
      out += s[i];
      i += 1;
      continue;
    }

    if (sep === ']]') {
      // Bare invented token: the type name IS the intended word.
      unwrapped.push({ type, inner: type });
      out += type;
      i = j + 2;
      continue;
    }

    // Typed invented marker: depth-scan to the matching `]]` so a payload that
    // itself contains markers (`[[sameind|C[[sub:4]]H[[sub:10]]]]`) is not truncated.
    let k = j + 1;
    let depth = 1;
    while (k < s.length && depth > 0) {
      if (s.startsWith('[[', k)) {
        depth++;
        k += 2;
      } else if (s.startsWith(']]', k)) {
        depth--;
        if (depth === 0) break;
        k += 2;
      } else k++;
    }
    if (depth !== 0) {
      out += s[i];
      i += 1;
      continue; // unterminated — leave the text alone
    }
    const inner = s.slice(j + 1, k); // split at the FIRST separator; the tail is opaque
    unwrapped.push({ type, inner });
    out += inner;
    i = k + 2;
  }
  return { text: out, unwrapped };
}

/**
 * Tally each inline bracket marker by its opening token `[[<type>:`. Counting the
 * type-prefixed opener is robust to nesting (`[[i:[[sub:x]]]]`) and to the
 * `|id`/`|class`/`|url` payloads, and never double-counts a closing delimiter.
 * @param {string} text
 * @returns {Record<string, number>}
 */
export function countBracketMarkers(text) {
  const counts = {};
  const s = String(text || '');
  for (const type of BRACKET_MARKER_TYPES) {
    counts[type] = (s.match(new RegExp(`\\[\\[${type}:`, 'g')) || []).length;
  }
  return counts;
}

/**
 * Per-type delta of inline bracket markers, output minus input. Only types whose
 * count changed are present. A negative value is a dropped marker (the ~2.3%-loss
 * class the paired term/fn round-trip does not cover for i/b/sub/sup/u/em/link/xref/
 * docref); a positive value is a spurious API duplication.
 * @param {string} input - the pre-translation text (EN segment chunk/module).
 * @param {string} output - the post-translation text to compare against.
 * @returns {Record<string, number>}
 */
export function bracketMarkerDelta(input, output) {
  const a = countBracketMarkers(input);
  const b = countBracketMarkers(output);
  const delta = {};
  for (const type of BRACKET_MARKER_TYPES) {
    if (a[type] !== b[type]) delta[type] = b[type] - a[type];
  }
  return delta;
}

/** One-line human note for a non-empty bracket delta, or null when clean. */
export function formatBracketDelta(label, delta) {
  const parts = Object.entries(delta).map(([t, n]) => `${t} ${n > 0 ? '+' : ''}${n}`);
  if (parts.length === 0) return null;
  return `${label}: bracket-marker delta (output vs input) — ${parts.join(', ')}`;
}

/**
 * Put every SEG marker back on its own line.
 *
 * Inserts a blank line before any marker that the API glued onto the end of the
 * preceding segment's text. Well-formed markers (already at line start, or at
 * the very start of the file) are left untouched, so this is a no-op for clean
 * output and a precise repair for mangled output.
 *
 * @param {string} text
 * @returns {{ text: string, fixed: number }}
 */
export function normalizeSegMarkers(text) {
  const fixed = countInlineMarkers(text);
  if (fixed === 0) return { text, fixed: 0 };
  const normalized = text.replace(
    /([^\n])[ \t]*(<!--\s*SEG:[^\n]*?-->)/g,
    (_, before, marker) => `${before}\n\n${marker}`
  );
  return { text: normalized, fixed };
}

// ─── B4-D11: paired-bracket MT round-trip for term/footnote translation ───

/** Split a marker's inner content at the last top-level `|` (id separator),
 *  ignoring `|` nested inside `[[ ]]`. Returns { text, id } (id null if none). */
function splitTopLevelId(inner) {
  let depth = 0;
  let idx = -1;
  for (let i = 0; i < inner.length; i++) {
    if (inner.startsWith('[[', i)) {
      depth++;
      i++;
    } else if (inner.startsWith(']]', i)) {
      if (depth > 0) depth--;
      i++;
    } else if (inner[i] === '|' && depth === 0) {
      idx = i;
    }
  }
  if (idx === -1) return { text: inner, id: null };
  return { text: inner.slice(0, idx), id: inner.slice(idx + 1) };
}

/** Rewrite every `[[type:...]]` in `text` to paired `[[type]]...[[/type]]`,
 *  nesting-aware; returns { text, ids } with captured ids (null when absent). */
function rewriteToPaired(text, type) {
  const openTok = `[[${type}:`;
  const ids = [];
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith(openTok, i)) {
      let j = i + openTok.length;
      let depth = 1;
      while (j < text.length && depth > 0) {
        if (text.startsWith('[[', j)) {
          depth++;
          j += 2;
        } else if (text.startsWith(']]', j)) {
          depth--;
          if (depth === 0) break;
          j += 2;
        } else j++;
      }
      const inner = text.slice(i + openTok.length, j);
      const { text: termText, id } = splitTopLevelId(inner);
      ids.push(id);
      out += `[[${type}]]${termText}[[/${type}]]`;
      i = j + 2; // past closing ]]
    } else {
      out += text[i];
      i++;
    }
  }
  return { text: out, ids };
}

const SEG_SPLIT_RE = /(?=<!-- SEG:)/;
const SEG_ID_RE = /<!-- SEG:(\S+?) -->/;

/**
 * Matches a wire-only (colon-less) paired term/fn token, e.g. `[[term]]`,
 * `[[/term]]`, `[[fn]]`, `[[/fn]]`. On-disk form is always id-anchored with a
 * colon (`[[term:text|id]]`), so this can never false-match that form, nor
 * nested inline markers like `[[i:]]`/`[[sub:]]` (Finding A.2 leak guard).
 */
const WIRE_ONLY_PAIRED_TOKEN_RE = /\[\[\/?(?:term|fn)\]\]/;

/**
 * Rewrite id-anchored inline term/footnote markers to PAIRED bracket form for the
 * API leg (B4-D11: the API treats [[term:text|id]] as an opaque token and does not
 * translate inside it; text BETWEEN [[term]]…[[/term]] translates and both delimiters
 * survive). The id never rides the wire; it is re-attached after MT by reattachIds().
 * @param {string} chunkText - a segment-file chunk (one or more whole SEG segments)
 * @returns {{ wireText: string, segments: Array<{segId:string, originalText:string,
 *   termIds:(string|null)[], fnIds:(string|null)[]}> }}
 */
export function stripTermFnToPaired(chunkText) {
  const parts = chunkText.split(SEG_SPLIT_RE).filter((p) => p.length > 0);
  const segments = [];
  let wireText = '';
  for (const part of parts) {
    const m = part.match(SEG_ID_RE);
    if (!m) {
      wireText += part;
      continue;
    } // leading non-SEG text (rare); pass through
    const term = rewriteToPaired(part, 'term');
    const fn = rewriteToPaired(term.text, 'fn');
    segments.push({ segId: m[1], originalText: part, termIds: term.ids, fnIds: fn.ids });
    wireText += fn.text;
  }
  return { wireText, segments };
}

/** Collect paired [[type]]…[[/type]] spans in a segment (term/fn do not self-nest,
 *  so match each open to the next close). Returns [{ start, end, inner }]. */
function collectPaired(segText, type) {
  const openTok = `[[${type}]]`;
  const closeTok = `[[/${type}]]`;
  const spans = [];
  let i = 0;
  while (true) {
    const o = segText.indexOf(openTok, i);
    if (o === -1) break;
    const c = segText.indexOf(closeTok, o + openTok.length);
    if (c === -1) break; // unbalanced → fewer matches → count-guard trips
    spans.push({ start: o, end: c + closeTok.length, inner: segText.slice(o + openTok.length, c) });
    i = c + closeTok.length;
  }
  return spans;
}

/**
 * Count `[[term]]…[[/term]]` / `[[fn]]…[[/fn]]` span pairs that are cross-type
 * nested — one type's span containing the other type's start offset.
 *
 * `stripTermFnToPaired`'s bracket-balancing (`rewriteToPaired`) is generic
 * across marker types, so a `[[term:…]]` whose text sits inside a `[[fn:…]]`
 * (or vice versa) round-trips into nested paired form, e.g.
 * `[[fn]]…[[term]]…[[/term]]…[[/fn]]`. `collectPaired` matches each open to
 * the *next* close per type, so it happily returns spans for both types even
 * when nested — and each type's surviving count can still equal its captured
 * id count, so the plain count-guard below would see no problem and attempt
 * the splice, corrupting output (stale offsets once the inner splice shifts
 * the outer span's length). This check exists to catch that case upstream so
 * it can degrade + record instead (B4-D11 fix).
 *
 * @param {Array<{start:number, end:number}>} termSpans
 * @param {Array<{start:number, end:number}>} fnSpans
 * @returns {number} count of cross-type span pairs that nest
 */
function countCrossTypeNesting(termSpans, fnSpans) {
  let count = 0;
  for (const t of termSpans) {
    for (const f of fnSpans) {
      const nested =
        (f.start >= t.start && f.start < t.end) || (t.start >= f.start && t.start < f.end);
      if (nested) count++;
    }
  }
  return count;
}

/**
 * Re-attach ids to the paired-form MT output, restoring on-disk [[type:text|id]] form.
 * Per-segment/per-type count-guard: if surviving paired markers != captured ids, that
 * segment degrades to its original text and a mismatch is recorded (B4-D11).
 * A segment whose term/fn spans are cross-type nested (see countCrossTypeNesting)
 * degrades the same way, with a `type: 'nested'` mismatch — the splice logic below
 * assumes mutually disjoint spans and would otherwise corrupt output silently.
 * @param {string} wireOutput - MT output (paired form, SEG markers intact)
 * @param {Array} segments - records from stripTermFnToPaired
 * @returns {{ text:string, mismatches:Array<{segId,type,expected,got}> }}
 */
export function reattachIds(wireOutput, segments) {
  const byId = new Map(segments.map((s) => [s.segId, s]));
  const parts = wireOutput.split(SEG_SPLIT_RE).filter((p) => p.length > 0);
  const mismatches = [];
  let out = '';
  for (const part of parts) {
    const m = part.match(SEG_ID_RE);
    const rec = m ? byId.get(m[1]) : null;
    if (!rec) {
      out += part;
      continue;
    } // unknown/leading segment → pass through

    const termSpans = collectPaired(part, 'term');
    const fnSpans = collectPaired(part, 'fn');

    const nestedCount = countCrossTypeNesting(termSpans, fnSpans);
    if (nestedCount > 0) {
      mismatches.push({ segId: rec.segId, type: 'nested', expected: 0, got: nestedCount });
      out += rec.originalText;
      continue;
    } // safe degrade — never splice overlapping spans

    const termOk = termSpans.length === rec.termIds.length;
    const fnOk = fnSpans.length === rec.fnIds.length;

    if (!termOk)
      mismatches.push({
        segId: rec.segId,
        type: 'term',
        expected: rec.termIds.length,
        got: termSpans.length,
      });
    if (!fnOk)
      mismatches.push({
        segId: rec.segId,
        type: 'fn',
        expected: rec.fnIds.length,
        got: fnSpans.length,
      });

    if (!termOk || !fnOk) {
      out += rec.originalText;
      continue;
    } // safe degrade

    // Build replacement list (term + fn), splice right-to-left to keep offsets valid.
    const repls = [];
    termSpans.forEach((s, k) => {
      const id = rec.termIds[k];
      repls.push({
        start: s.start,
        end: s.end,
        text: id === null ? `[[term:${s.inner}]]` : `[[term:${s.inner}|${id}]]`,
      });
    });
    fnSpans.forEach((s, k) => {
      const id = rec.fnIds[k];
      repls.push({
        start: s.start,
        end: s.end,
        text: id === null ? `[[fn:${s.inner}]]` : `[[fn:${s.inner}|${id}]]`,
      });
    });
    repls.sort((a, b) => b.start - a.start);
    let segOut = part;
    for (const r of repls) segOut = segOut.slice(0, r.start) + r.text + segOut.slice(r.end);
    out += segOut;
  }
  return { text: out, mismatches };
}

// ─── Book → Domain Mapping ──────────────────────────────────────────
// bookToDomain now lives in book-rendering-config.js (reads book-config.json
// `domain`). Imported above for internal use; re-exported here for backward
// compatibility with existing callers/tests.
export { bookToDomain };

// ─── Glossary Loading ───────────────────────────────────────────────

/**
 * Load glossary from a book's glossary directory.
 * Returns API-formatted glossary object or null if unavailable.
 *
 * `options.onSkipped` receives any entries dropped for having a blank English
 * or Icelandic side (register C14), so the caller can report the loss instead
 * of it being silent. onSkipped fires even if this function returns null (the
 * worst case: all approved terms were malformed).
 *
 * @param {string} glossaryDir
 * @param {string} domain
 * @param {{onSkipped?: (dropped: Array<object>) => void,
 *          onOmitted?: (report: {omitted: Array<object>, competitions: Array<object>, commaLists: Array<object>}) => void}} [options]
 */
export function loadGlossary(glossaryDir, domain, { onSkipped, onOmitted } = {}) {
  const glossaryPath = path.join(glossaryDir, 'glossary-unified.json');
  if (!fs.existsSync(glossaryPath)) return null;

  let dropped = null;
  let omittedReport = null;
  let glossary;
  try {
    const data = JSON.parse(fs.readFileSync(glossaryPath, 'utf8'));
    // An inner callback that CANNOT throw, so the caller's callback never
    // runs inside this catch-all. Handing `onSkipped` straight to
    // formatGlossary would mean a throwing caller callback is swallowed and
    // returned as `null` — indistinguishable from corrupt JSON, and a
    // fail-loud violation.
    glossary = formatGlossary(data.terms || [], {
      domain,
      approvedOnly: true,
      onSkipped: (d) => {
        dropped = d;
      },
      // Same non-throwing inner-callback discipline as onSkipped above: a
      // throwing caller callback handed straight to formatGlossary would be
      // swallowed by this try/catch and returned as null, indistinguishable
      // from corrupt JSON.
      onOmitted: (r) => {
        omittedReport = r;
      },
    });
  } catch {
    return null;
  }

  // BEFORE the empty-check, deliberately. When every approved term is
  // malformed or omitted, terms.length is 0 and this function returns null —
  // and the caller then prints "none available", the same message as having
  // no glossary file at all. Reporting first is what keeps the worst case
  // (a wholly corrupt or wholly contested glossary) from reading as the
  // benign one.
  if (dropped && typeof onSkipped === 'function') onSkipped(dropped);
  if (omittedReport && typeof onOmitted === 'function') onOmitted(omittedReport);

  if (glossary.terms.length === 0) return null;
  return glossary;
}

/**
 * The operator-facing glossary line. Extracted from main() so the total-drop
 * case is testable: a glossary whose every approved term was malformed loads
 * as null, and without the count this line is identical to the one printed
 * when there is no glossary file at all — the worst case rendered
 * indistinguishable from the benign one.
 *
 * Surfacing the count at the MT stage is deliberate: the same reasoning as
 * countInlineMarkers — a data defect must be visible where it happens, not
 * inferred three stages downstream from bad output.
 */
export function glossaryStatusLine(glossary, skippedCount, omittedCount = 0) {
  const notes = [];
  if (skippedCount > 0) notes.push(`${skippedCount} malformed skipped`);
  // C18: an omitted term is a term whose Icelandic side is contested. Naming
  // it here rather than in a separate line keeps the MT stage's one status
  // line the single place a glossary defect surfaces.
  if (omittedCount > 0) notes.push(`${omittedCount} omitted — contested or comma-list`);
  const note = notes.length > 0 ? ` (${notes.join(', ')})` : '';
  return glossary
    ? `Glossary: ${glossary.terms.length} approved ${glossary.domain} terms${note}`
    : `Glossary: none available${note} (continuing without)`;
}

// ─── MT Edit-Lock ───────────────────────────────────────────────────

/**
 * Decide what api-translate does with one module's MT output.
 *
 * `locked` (an existing `.locked` marker next to the mtOutput file — see
 * tools/lib/mt-lock.cjs) always wins: once a module has been opened for
 * editing, MT must never overwrite its baseline again, not even with
 * --force. Absent a lock, `exists && !force` is the pre-existing accident
 * guard, unchanged.
 *
 * @param {{ exists: boolean, force: boolean, locked: boolean }} state
 * @returns {'locked-skip'|'skip'|'write'}
 */
export function mtRunDecision({ exists, force, locked }) {
  if (locked) return 'locked-skip'; // absolute: editing has begun, never clobber
  if (exists && !force) return 'skip'; // accident guard (unchanged)
  return 'write';
}

/**
 * Chapters eligible for --update-status completion (T4).
 *
 * A chapter is complete only if every translated module in it both (a)
 * succeeded outright, and (b) reported no id-reattach mismatches — a
 * mismatch means some segment silently degraded to its English source
 * (B4-D11 count-guard), which must hold the chapter back exactly like a
 * hard module failure does.
 *
 * @param {Set<string>} succeededChapters
 * @param {Set<string>} failedChapters
 * @param {Set<string>} mismatchChapters
 * @returns {string[]}
 */
export function computeCompleteChapters(succeededChapters, failedChapters, mismatchChapters) {
  return [...succeededChapters].filter(
    (ch) => !failedChapters.has(ch) && !mismatchChapters.has(ch)
  );
}

// ─── CLI ────────────────────────────────────────────────────────────

function parseCliArgs(argv) {
  return parseArgs(argv, [
    BOOK_OPTION,
    CHAPTER_OPTION,
    MODULE_OPTION,
    { name: 'force', flags: ['--force'], type: 'boolean', default: false },
    { name: 'dryRun', flags: ['--dry-run', '-n'], type: 'boolean', default: false },
    { name: 'noGlossary', flags: ['--no-glossary'], type: 'boolean', default: false },
    { name: 'rateDelay', flags: ['--rate-delay'], type: 'number', default: 500 },
    { name: 'maxChunk', flags: ['--max-chunk'], type: 'number', default: DEFAULT_MAX_CHUNK_CHARS },
    { name: 'updateStatus', flags: ['--update-status'], type: 'boolean', default: false },
  ]);
}

function formatChapter(chapter) {
  if (chapter === 'appendices') return 'appendices';
  return `ch${String(chapter).padStart(2, '0')}`;
}

function printHelp() {
  console.log(`
api-translate.js — Automated MT via Málstaður API

Translates English segment files to Icelandic using the Miðeind Málstaður API.
Sends whole module files directly — no protection or splitting needed.

Usage:
  node tools/api-translate.js --book <slug> --chapter <num> [--module <id>]
  node tools/api-translate.js --book <slug>

Options:
  --book <slug>       Book slug (default: efnafraedi-2e)
  --chapter <num>     Chapter number (omit for whole book)
  --module <id>       Single module ID (requires --chapter)
  --force             Overwrite existing output files
  --dry-run, -n       Show what would be translated + cost estimate
  --no-glossary       Don't send glossary terms with requests
  --rate-delay <ms>   Delay between API calls (default: 500)
  --update-status     Mark mtOutput stage as complete in pipeline DB
  -v, --verbose       Detailed progress output
  -h, --help          Show this help

Environment:
  MALSTADUR_API_KEY   API key (or set in .env file)

Examples:
  node tools/api-translate.js --book efnafraedi-2e --chapter 1
  node tools/api-translate.js --book efnafraedi-2e --dry-run
  node tools/api-translate.js --book liffraedi-2e --chapter 3 --module m71234
`);
}

// ─── Chapter Discovery ──────────────────────────────────────────────

/**
 * Discover chapter directories for a book.
 * Returns sorted list: ['ch01', 'ch02', ..., 'appendices']
 */
function discoverChapters(bookDir) {
  const mtDir = path.join(bookDir, '02-for-mt');
  if (!fs.existsSync(mtDir)) return [];
  return fs
    .readdirSync(mtDir)
    .filter((d) => d.match(/^ch\d+$/) || d === 'appendices')
    .sort((a, b) => {
      if (a === 'appendices') return 1;
      if (b === 'appendices') return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
}

// ─── Glossary Filtering ─────────────────────────────────────────────

/**
 * Filter glossary to only include terms that appear in the source text.
 * Reduces payload from ~35KB (617 terms) to typically 2-5KB.
 */
export function filterGlossaryForText(glossary, text) {
  if (!glossary) return null;
  const lowerText = text.toLowerCase();
  const filtered = glossary.terms.filter((t) => lowerText.includes(t.sourceWord.toLowerCase()));
  if (filtered.length === 0) return null;
  return { ...glossary, terms: filtered };
}

// ─── Chunk Splitting ────────────────────────────────────────────────

/**
 * Default max chars per chunk. Modules under this size are sent as-is.
 * Modules over this are split at SEG boundaries.
 * The API appears to truncate around 33-35KB; we use 25KB to leave room for glossary overhead.
 */
const DEFAULT_MAX_CHUNK_CHARS = 25000;

/**
 * Split segment file at <!-- SEG: --> boundaries into chunks ≤ maxChars.
 * Each chunk contains one or more complete segments (never splits mid-segment).
 * @param {string} text - Full segment file content
 * @param {number} maxChars - Maximum characters per chunk
 * @returns {string[]} Array of chunks, each a valid segment file fragment
 */
export function splitAtSegBoundaries(text, maxChars) {
  // Split into individual segments (each starting with <!-- SEG: -->)
  const segPattern = /(?=<!-- SEG:)/g;
  const parts = text.split(segPattern).filter((p) => p.trim().length > 0);

  if (parts.length === 0) return [text];

  const chunks = [];
  let current = '';

  for (const part of parts) {
    if (current.length + part.length > maxChars && current.length > 0) {
      chunks.push(current);
      current = part;
    } else {
      current += part;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

// ─── Translation ────────────────────────────────────────────────────

/**
 * Translate a single chunk via the API with glossary and retry logic.
 *
 * B4-D11: id-anchored [[term:text|id]]/[[fn:text|id]] markers are opaque to the
 * API (it doesn't translate inside them). The chunk is rewritten to paired
 * [[term]]text[[/term]] form for the wire (stripTermFnToPaired), and ids are
 * restored immediately after each translateAuto call (reattachIds) — before
 * the existing post-processing chain, which continues to operate on the
 * original id-anchored on-disk form.
 * @returns {{ text: string, usage: number, mismatches: Array }}
 */
export async function translateChunk(client, chunkText, glossary, verbose, chunkLabel) {
  const { wireText, segments } = stripTermFnToPaired(chunkText);
  const filteredGlossary = filterGlossaryForText(glossary, chunkText);
  const translateOpts = { targetLanguage: 'is' };
  if (filteredGlossary) {
    translateOpts.glossaries = [filteredGlossary];
  }

  // Order matters (Finding A): repairSegTags must run on the paired-form
  // output BEFORE reattachIds. reattachIds looks up captured term/fn ids by
  // the SEG id that rode the wire — if the API mangled that id (e.g. an
  // inserted hyphen), the lookup misses and the segment passes through
  // UNCHANGED, leaking colon-less [[term]]/[[fn]] wire form with no mismatch
  // recorded. repairSegTags fixes exactly that class of mangle, so running it
  // first means reattachIds always sees a clean id.
  let result = await client.translateAuto(wireText, translateOpts);
  let output = result.text;
  assertNoControlChars(output, chunkLabel);
  output = normalizeUnicode(output);
  output = repairSegTags(chunkText, output);
  let unwrap = unwrapInventedMarkers(output);
  output = unwrap.text;
  let unwrapped = unwrap.unwrapped;
  let reattach = reattachIds(output, segments);
  output = reattach.text;
  let mismatches = reattach.mismatches;

  // Validate — retry without glossary if truncated
  if (!validateMarkers(chunkText, output)) {
    if (filteredGlossary) {
      if (verbose) {
        console.error(
          `\n    ${chunkLabel}: truncated with glossary (${filteredGlossary.terms.length} terms), retrying without...`
        );
      }
      result = await client.translateAuto(wireText, { targetLanguage: 'is' });
      output = result.text;
      assertNoControlChars(output, chunkLabel);
      output = normalizeUnicode(output);
      output = repairSegTags(chunkText, output);
      // The retry sends no glossary, so the §C67 hallucination is unlikely here
      // — but "unlikely" is not "impossible", and a second path that silently
      // skips a repair is exactly how a fix half-ships.
      unwrap = unwrapInventedMarkers(output);
      output = unwrap.text;
      // REPLACES rather than appends, deliberately: the retry discards the
      // first response entirely, so the main path's unwraps describe text that
      // no longer exists. Concatenating would over-report.
      unwrapped = unwrap.unwrapped;
      reattach = reattachIds(output, segments);
      output = reattach.text;
      mismatches = reattach.mismatches;
    }

    if (!validateMarkers(chunkText, output)) {
      const inputCount = (chunkText.match(/<!-- SEG:/g) || []).length;
      const outputCount = (output.match(/<!-- SEG:/g) || []).length;
      throw new Error(
        `${chunkLabel}: segment marker mismatch: input has ${inputCount}, output has ${outputCount}. ` +
          `API may have truncated the response.`
      );
    }
  }

  return { text: output, usage: result.usage, mismatches, unwrapped };
}

/** Derive a module id (mNNNNN) from an mt-output output path. */
export function moduleIdFromOutputPath(outputPath) {
  return path.basename(outputPath).replace('-segments.is.md', '');
}

/**
 * Translate a single module file via the API.
 * Automatically splits large modules at SEG boundaries to avoid API truncation.
 * Filters glossary to terms in source text. Retries without glossary on truncation.
 */
export async function translateModule(
  client,
  inputPath,
  outputPath,
  glossary,
  verbose,
  maxChunk = DEFAULT_MAX_CHUNK_CHARS
) {
  const input = fs.readFileSync(inputPath, 'utf8');
  const moduleId = path.basename(inputPath, '-segments.en.md');

  // Split if too large for a single API call
  const chunks = splitAtSegBoundaries(input, maxChunk);
  const needsSplitting = chunks.length > 1;

  if (needsSplitting && verbose) {
    console.error(`\n    Splitting into ${chunks.length} chunks (${input.length} chars total)`);
  }

  let totalUsage = 0;
  const translatedChunks = [];
  const mismatches = [];
  const unwrapped = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkLabel = needsSplitting ? `chunk ${i + 1}/${chunks.length}` : moduleId;
    if (needsSplitting && verbose) {
      const segCount = (chunks[i].match(/<!-- SEG:/g) || []).length;
      console.error(`    ${chunkLabel}: ${chunks[i].length} chars, ${segCount} segments`);
    }

    const result = await translateChunk(client, chunks[i], glossary, verbose, chunkLabel);
    translatedChunks.push(result.text);
    totalUsage += result.usage || 0;
    if (result.mismatches && result.mismatches.length) mismatches.push(...result.mismatches);
    if (result.unwrapped && result.unwrapped.length) unwrapped.push(...result.unwrapped);
  }

  // Reassemble chunks
  let output = translatedChunks.join('');

  // Repair markers the API glued onto the end of the preceding segment's text.
  // Their count is correct so validateMarkers() wouldn't catch them, but a
  // line-based consumer would silently drop the preceding segment. Surface the
  // condition (it indicates MT mangling) and fix it at the source.
  const { text: normalizedOutput, fixed: markersNormalized } = normalizeSegMarkers(output);
  output = normalizedOutput;
  if (markersNormalized > 0) {
    console.error(
      `  Note: normalized ${markersNormalized} inline SEG marker(s) the MT API ran onto the previous line`
    );
  }

  // Final validation: total segment count must match
  if (!validateMarkers(input, output)) {
    const inputCount = (input.match(/<!-- SEG:/g) || []).length;
    const outputCount = (output.match(/<!-- SEG:/g) || []).length;
    throw new Error(
      `Reassembled output has ${outputCount} segments but input has ${inputCount}. ` +
        `Split/reassemble lost segments.`
    );
  }

  // Finding A.2 — leak-guard backstop. The A.1 reorder (repairSegTags before
  // reattachIds) closes the common case, but if a SEG-id mangle survives
  // repairSegTags (outside its known repair strategies), reattachIds's
  // per-id lookup still misses and a wire-only (colon-less) [[term]]/[[fn]]
  // token can reach this point. cnxml-inject.js only recognizes the
  // id-anchored colon form ([[term:text|id]]) — writing the wire form would
  // silently lose the term/fn wrapper, class, and id downstream. Fail loud
  // instead of writing it.
  if (WIRE_ONLY_PAIRED_TOKEN_RE.test(output)) {
    throw new Error(
      `${moduleId}: a wire-only paired marker ([[term]]/[[fn]]) survived to write in ` +
        `${outputPath} — a SEG-id mangle that repairSegTags did not fix, or an ` +
        `otherwise-unresolved marker. Refusing to write corrupted output.`
    );
  }

  // Write output
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, output, 'utf8');

  // B3: surface any inline bracket-marker loss/add at the producer, per module. This
  // is a module-level aggregate: a drop in one segment and a spurious add of the same
  // type in another cancel to zero and won't be reported — acceptable for a non-gating
  // diagnostic (any non-cancelling loss still surfaces here and in the run summary).
  // §C82: the per-segment, all-types instrument that DOES catch the cancelling case
  // is bracketMarkerDeltaBySegment; the loop's A3 gate uses that one, not this.
  //
  // MOVED ABOVE the provenance write (§C82) so the run record can carry it. The
  // write must stay as close to fs.writeFileSync as possible: resolveRestorePolicy
  // THROWS when a segment file exists with no sidecar, so every line between the
  // two widens a real failure window.
  const bracketDelta = bracketMarkerDelta(input, output);
  const bracketNote = formatBracketDelta(moduleId, bracketDelta);
  if (bracketNote) console.error(`  Note: ${bracketNote}`);

  // §C67 class 3: markers the MT invented around glossary target words and we
  // removed. Reported, never silent — the rate is the input to deciding whether
  // a glossary is safe to send at its current size.
  if (unwrapped.length) {
    const types = [...new Set(unwrapped.map((u) => u.type))].join(', ');
    console.error(
      `  Note: ${moduleId}: removed ${unwrapped.length} invented glossary marker(s) — ${types}`
    );
  }

  // B2: stamp producer provenance next to the segment file.
  // §C82 prerequisite 2: it now also carries the run record. Without this the
  // in-pipeline repairs erase their own evidence — the counters below exist
  // nowhere else once this function returns.
  writeProvenance(outputDir, moduleIdFromOutputPath(outputPath), {
    tool: 'api-translate',
    run: buildRunRecord({
      chars: input.length,
      usage: totalUsage,
      estimatedIsk: estimateIsk(input.length),
      markersNormalized,
      mismatches,
      bracketDelta,
      unwrapped,
      glossaryArm: glossary ? 'glossary' : 'no-glossary',
      glossaryHash: glossaryContentHash(glossary),
      glossaryTermCount: glossary?.terms?.length ?? null,
    }),
  });

  // Copy -links.json if it exists
  const linksFilename = path.basename(inputPath).replace('-segments.en.md', '-segments-links.json');
  const linksSource = path.join(path.dirname(inputPath), linksFilename);
  if (fs.existsSync(linksSource)) {
    const linksDest = path.join(outputDir, linksFilename);
    fs.copyFileSync(linksSource, linksDest);
  }

  return {
    chars: input.length,
    usage: totalUsage,
    markersNormalized,
    mismatches,
    bracketDelta,
    unwrapped,
  };
}

// ─── Pipeline Status ────────────────────────────────────────────────

/**
 * Update pipeline status for translated chapters.
 * Uses the server's pipelineStatusService directly (standalone, no server needed).
 * Fails silently — status updates should never block translation.
 */
async function updatePipelineStatus(bookSlug, chapters) {
  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);

    let pipelineStatus;
    try {
      pipelineStatus = require('../server/services/pipelineStatusService.js');
    } catch {
      console.warn('  Warning: Could not load pipeline status service (server not set up?)');
      return;
    }

    for (const chapterDir of chapters) {
      const chapterNum = chapterDir === 'appendices' ? -1 : parseInt(chapterDir.slice(2), 10);
      try {
        pipelineStatus.transitionStage(
          bookSlug,
          chapterNum,
          'mtOutput',
          'complete',
          'api-translate'
        );
        console.log(`  ${chapterDir}: mtOutput → complete`);
      } catch (err) {
        console.warn(`  ${chapterDir}: status update failed — ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`  Warning: Pipeline status update skipped — ${err.message}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }
  requireBook(args);

  // Validate: --module requires --chapter (`== null` so chapter 0 / preface is valid)
  if (args.module && args.chapter == null) {
    console.error('Error: --module requires --chapter');
    process.exit(1);
  }

  BOOKS_DIR = `books/${args.book}`;
  const mtInputDir = path.join(BOOKS_DIR, '02-for-mt');
  const mtOutputDir = path.join(BOOKS_DIR, '02-mt-output');

  // Load .env if API key not in environment
  if (!process.env.MALSTADUR_API_KEY) {
    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const envVars = loadEnvFile(path.join(projectRoot, '.env'));
    if (envVars.MALSTADUR_API_KEY) {
      process.env.MALSTADUR_API_KEY = envVars.MALSTADUR_API_KEY;
    }
  }

  // Load glossary
  let glossary = null;
  if (!args.noGlossary) {
    const domain = bookToDomain(args.book);
    let skippedCount = 0;
    let omittedCount = 0;
    glossary = loadGlossary(path.join(BOOKS_DIR, 'glossary'), domain, {
      onSkipped: (dropped) => {
        skippedCount = dropped.length;
      },
      onOmitted: (report) => {
        omittedCount = report.omitted.length;
      },
    });
    console.log(glossaryStatusLine(glossary, skippedCount, omittedCount));
  }

  // Discover modules to translate
  const chapters =
    args.chapter != null ? [formatChapter(args.chapter)] : discoverChapters(BOOKS_DIR);

  if (chapters.length === 0) {
    console.error(`No chapters found in ${mtInputDir}`);
    process.exit(1);
  }

  // Build work list
  const workList = [];
  for (const chapterDir of chapters) {
    const inputDir = path.join(mtInputDir, chapterDir);
    const outputDir = path.join(mtOutputDir, chapterDir);
    let modules = discoverModules(inputDir);

    // Include chapter-metadata segments (chapter title) if present
    const chapterMetaFile = 'chapter-metadata-segments.en.md';
    const chapterMetaPath = path.join(inputDir, chapterMetaFile);
    if (fs.existsSync(chapterMetaPath)) {
      modules.push({
        moduleId: 'chapter-metadata',
        filename: chapterMetaFile,
        path: chapterMetaPath,
      });
    }

    // Exercise segments (item 9/D3) ride the same per-chapter MT path.
    const exercisesEntry = discoverExercisesFile(inputDir);
    if (exercisesEntry) {
      modules.push(exercisesEntry);
    }

    // Filter to specific module if requested
    if (args.module) {
      modules = modules.filter((m) => m.moduleId === args.module);
    }

    for (const mod of modules) {
      const outputPath = path.join(outputDir, mod.filename.replace('.en.md', '.is.md'));
      const exists = fs.existsSync(outputPath);
      const locked = isMtLocked(outputPath);
      const action = mtRunDecision({ exists, force: args.force, locked });

      workList.push({
        ...mod,
        chapterDir,
        outputPath,
        action,
        skip: action !== 'write',
      });
    }
  }

  const toTranslate = workList.filter((m) => !m.skip);
  const toSkip = workList.filter((m) => m.skip);

  if (workList.length === 0) {
    console.error('No modules found for the specified scope.');
    process.exit(1);
  }

  // Dry run
  if (args.dryRun) {
    const lockedList = workList.filter((m) => m.action === 'locked-skip');
    console.log(`\nDry run — ${workList.length} modules found:`);
    console.log(`  To translate: ${toTranslate.length}`);
    // The Already-done count includes locked modules, but --force does NOT
    // apply to those — qualify the hint so the operator isn't misled.
    const lockedHint =
      lockedList.length > 0 ? `; ${lockedList.length} of these locked — --force refused` : '';
    console.log(`  Already done:  ${toSkip.length} (use --force to re-translate${lockedHint})`);

    // The 🔒 warn further down lives in the live translate loop, which a dry
    // run never reaches (this block exits the process first) — so locked
    // modules must be surfaced here too, or a dry run can't show lock state.
    if (lockedList.length > 0) {
      console.log(`  Locked:        ${lockedList.length} (editing started — MT re-run refused)`);
      if (args.verbose) {
        for (const mod of lockedList) {
          console.log(`    🔒 ${mod.chapterDir}/${mod.moduleId}`);
        }
      }
    }

    let totalChars = 0;
    for (const mod of toTranslate) {
      const content = fs.readFileSync(mod.path, 'utf8');
      totalChars += content.length;
      if (args.verbose) {
        console.log(
          `  ${mod.chapterDir}/${mod.moduleId}: ${content.length.toLocaleString()} chars`
        );
      }
    }
    console.log(`\n  Estimated characters: ${totalChars.toLocaleString()}`);
    console.log(`  Estimated cost: ~${estimateIsk(totalChars).toFixed(0)} ISK`);
    process.exit(0);
  }

  // Create API client
  let client;
  try {
    client = createClient({ rateDelayMs: args.rateDelay });
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  console.log(`\nTranslating ${toTranslate.length} module(s), skipping ${toSkip.length}...`);
  console.log('');

  // Translate
  const results = {
    translated: 0,
    skipped: toSkip.length,
    lockedSkipped: 0,
    failed: 0,
    markersNormalized: 0,
    mismatches: 0,
    bracketLoss: {}, // B3: per-type accumulated output−input delta across modules
    errors: [],
  };

  // Track per-chapter outcome so --update-status only advances chapters whose
  // modules all succeeded (a chapter with any failed module is NOT complete).
  // T4: a chapter with any module whose id-reattach mismatched (a segment
  // silently degraded to English) is likewise held back — mirrors
  // failedChapters exactly, just for a softer failure mode.
  const succeededChapters = new Set();
  const failedChapters = new Set();
  const mismatchChapters = new Set();

  for (const mod of workList) {
    if (mod.action === 'locked-skip') {
      console.warn(
        `  🔒 ${mod.chapterDir}/${mod.moduleId} LOCKED (editing started) — MT re-run refused` +
          `${args.force ? ' (--force ignored)' : ''}`
      );
      results.lockedSkipped++;
      continue;
    }
    if (mod.skip) {
      if (args.verbose) console.log(`  ⏭  ${mod.chapterDir}/${mod.moduleId} (exists)`);
      continue;
    }

    process.stdout.write(`  ${mod.chapterDir}/${mod.moduleId}... `);

    try {
      const { chars, markersNormalized, mismatches, bracketDelta } = await translateModule(
        client,
        mod.path,
        mod.outputPath,
        glossary,
        args.verbose,
        args.maxChunk
      );
      const fixedNote = markersNormalized > 0 ? `, ${markersNormalized} marker(s) un-glued` : '';
      console.log(`✅ (${chars.toLocaleString()} chars${fixedNote})`);
      results.translated++;
      results.markersNormalized += markersNormalized;
      for (const [t, n] of Object.entries(bracketDelta || {})) {
        results.bracketLoss[t] = (results.bracketLoss[t] || 0) + n;
      }
      if (mismatches && mismatches.length) {
        results.mismatches += mismatches.length;
        for (const mm of mismatches) {
          console.error(
            `  WARNING: id-reattach mismatch in ${mm.segId} (${mm.type}: expected ${mm.expected}, got ${mm.got}) — segment left untranslated (B4-D11 count-guard)`
          );
        }
        mismatchChapters.add(mod.chapterDir);
      }
      succeededChapters.add(mod.chapterDir);
    } catch (err) {
      console.log(`❌ ${err.message}`);
      results.failed++;
      results.errors.push({ module: mod.moduleId, chapter: mod.chapterDir, error: err.message });
      failedChapters.add(mod.chapterDir);
    }
  }

  // Summary
  const usage = client.getUsage();
  console.log('\n' + '═'.repeat(50));
  console.log('Summary:');
  console.log(`  Translated: ${results.translated}`);
  console.log(`  Skipped:    ${results.skipped}`);
  if (results.lockedSkipped > 0) {
    console.log(`  Locked:     ${results.lockedSkipped} (editing started — MT re-run refused)`);
  }
  console.log(`  Failed:     ${results.failed}`);
  if (results.markersNormalized > 0) {
    console.log(
      `  Markers un-glued: ${results.markersNormalized} (MT API ran them onto prev line)`
    );
  }
  const bracketLossParts = Object.entries(results.bracketLoss).filter(([, n]) => n !== 0);
  if (bracketLossParts.length > 0) {
    console.log(
      `  Bracket-marker deltas: ${bracketLossParts.map(([t, n]) => `${t} ${n > 0 ? '+' : ''}${n}`).join(', ')} ` +
        `(inline markers dropped/added by the API — see per-module notes)`
    );
  }
  if (results.mismatches > 0) {
    console.log(
      `  Marker id-reattach mismatches: ${results.mismatches} (segments degraded to source — see warnings)`
    );
  }
  console.log(`  API usage:  ${usage.totalChars.toLocaleString()} chars`);
  console.log(`  Est. cost:  ~${usage.estimatedISK.toFixed(0)} ISK`);
  console.log(`  Time:       ${(usage.elapsedMs / 1000).toFixed(1)}s`);

  if (results.errors.length > 0) {
    console.log('\nFailed modules:');
    for (const err of results.errors) {
      console.log(`  ${err.chapter}/${err.module}: ${err.error}`);
    }
  }

  // Update pipeline status if requested. Only mark a chapter's mtOutput
  // complete when every translated module in it succeeded AND reported no
  // id-reattach mismatches — a chapter with any failure OR any segment
  // silently degraded to English stays incomplete instead of silently
  // transitioning (F7 / T4).
  if (args.updateStatus && results.translated > 0) {
    const completeChapters = computeCompleteChapters(
      succeededChapters,
      failedChapters,
      mismatchChapters
    );
    if (completeChapters.length > 0) {
      console.log('\nUpdating pipeline status...');
      await updatePipelineStatus(args.book, completeChapters);
    }
    const heldBack = [...succeededChapters].filter(
      (ch) => failedChapters.has(ch) || mismatchChapters.has(ch)
    );
    if (heldBack.length > 0) {
      console.log(
        `  Held back (failures or marker mismatches): ${heldBack.join(', ')} — fix and re-run to mark complete`
      );
    }
  }

  if (results.failed > 0 || results.mismatches > 0) process.exit(1);
}

// Only run when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
