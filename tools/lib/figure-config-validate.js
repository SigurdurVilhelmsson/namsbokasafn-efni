/**
 * The figure config's four policy tables, its two per-block tables, `heldBlockValues` and
 * `anchorExclusions`, its per-figure artwork-edit table, `artworkEdits`, and its per-figure
 * source-aligned-box switch, `sourceAlignedBoxes`, checked against the repo
 * (§C140 ㊵, spec D11; `keptCopies`, §C140 ㊾, spec 2026-10-02 D1; `heldBlockValues`, §C140 ㊾, spec
 * 2026-10-02 D5(a); `anchorExclusions`, §C140 '6', ruling R-20, spec 2026-10-05 D-a; `artworkEdits`,
 * §C140 '6', rulings R-15a/R-15a2; `sourceAlignedBoxes`, §C140 '6', ruling R-5c2, record
 * docs/decisions/2026-10-07-hazdiamond-keeps-source-box-alignment.md).
 *
 * Run by `npm test` (tools/__tests__/figure-config-validate.test.js), and run LOCALLY before any
 * pin's buy: CI only sees a pin after the money is spent, because a pin lands in the commit that
 * runs its buy (spec D1). The Python resolver fails closed per figure at run time; these are the
 * rules it cannot check, plus the cross-table ones.
 *
 * ⚠️ A RETIRED FIGURE'S PUBLISHED COPIES AND REFERENCES ARE NOT CHECKED HERE, ON PURPOSE: they
 * legitimately remain until ②'s whole-book re-render (spec D14). After `--prune`, re-running the
 * retire tool as a dry run is the census: it reports what still references each figure.
 *
 * ⚠️ WHAT THIS CANNOT CHECK FOR `heldBlockValues`, AND WHO DOES. A held key is a key of the
 * figure's `blocks.json`, which `figure-prepare.py` generates from artwork outside the repo. So
 * whether the key exists in the current read layer, its send flag, the block's exact VISUAL line
 * count, a source run for each script kind the value uses, glyph coverage, fit, and whether the
 * block is an arc are all refused by name at compose time (`figure-compose.py`'s pre-flight and
 * `compose.py`'s planner), before anything publishes. Here: the owner book, the `.svg` row, the
 * translated copy, the policy overlaps, a collision with a bought sidecar key, the value's shape
 * and encoding, and the line upper bound (the key's '|'-segments that are not spaces-only: a U+0020-only
 * segment is the next row's indent space, which the composer folds into its neighbour - spec
 * 2026-10-05 D-b, ruling R-17; figtext.is_blank_line is the Python twin of that predicate).
 *
 * ⚠️ WHAT THIS CANNOT CHECK FOR `anchorExclusions`, AND WHO DOES. Whether a key is a block of the
 * current read layer, and whether that block is send:true, is `figure-compose.py`'s pre-flight; whether
 * the exclusion still changes the cut is `compose.py`'s `anchorExcluded[].changed` (a note). Here: the
 * owner book, the policy overlaps, the entry's shape, a key that can reach M1 at all (it holds '|'), the
 * Markdown escape, the key being a block key of the figure's committed sidecar, and the reason.
 *
 * ⚠️ WHAT THIS CANNOT CHECK FOR `artworkEdits`, AND WHO DOES. A selector picks a painted path or a text
 * line of the figure's STAGED artwork PDF, which lives outside the repo, so whether each selector
 * matches exactly one object, and whether the op can apply to it (one `re`, one horizontal stroked
 * line, an axis-aligned CTM, no inverted edge), is refused by name at PREPARE time by
 * experiments/figure-text-translation/artworkedits.py, which also re-measures every path and line after
 * the rewrite. Here: the owner book, the policy overlaps, the `.svg` row, the translated copy, and the
 * shape of every op and selector (`artworkEditsProblems`, a second implementation of `for_figure`).
 *
 * ⚠️ A REPEATED KEY IS INVISIBLE TO `validateFigureConfig`, which reads the PARSED config: JSON.parse
 * keeps only the last of two equal keys. `repeatedKeyProblems` reads the raw text instead; the
 * committed-config test runs both.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { normkey } from './figure-text-config.js';
import { DEFAULT_SUFFIX, indexBookSourceBasenames } from '../generate-image-mapping.js';
import { readMappingOrRefuse, topLevelTranslatedCopies } from './translated-figure-refs.js';

// §C140 '6' D6: INVISIBLE_LINE and the key's line rule have ONE JS owner, figure-text-sidecar.cjs, which
// the block-save route and the corpus sweep also read (blockValueProblems).
const { sidecarPath, INVISIBLE_LINE, keyInkSegments, keyInkLineCount } = createRequire(
  import.meta.url
)('./figure-text-sidecar.cjs');

const TABLES = ['supersededArtwork', 'retiredFigures', 'keptCopies', 'artworkPins'];
// §C140 ㊾ D5(a) — `heldBlockValues` is keyed by basename like TABLES, so it shares their type,
// fold and exactly-one-book loops (same `${name}` template, so Part 1's strings are unchanged).
// It stays OUT of TABLES: its values are objects, not reason strings, so `reasonOf` and the pin
// overlap list must never read it (Review Focus 5).
// §C140 '6' R-20 — `anchorExclusions` likewise: keyed by basename, values are {blockKey: reason} objects.
// §C140 '6' R-5c2 — `sourceAlignedBoxes` is keyed by basename; its value is a reason string, but it stays OUT
// of TABLES for the same reason heldBlockValues does: the pin overlap list must never read it.
const KEYED = [
  ...TABLES,
  'heldBlockValues',
  'anchorExclusions',
  'artworkEdits',
  'sourceAlignedBoxes',
];
// §C140 '6' R-15a — `artworkEdits` is keyed by basename too (same fold / exactly-one-book loops);
// its per-figure value is a LIST of ops, checked by artworkEditsProblems (a SECOND implementation of
// experiments/figure-text-translation/artworkedits.py `for_figure` — change both or neither).
// AE_OPS and AE_SELECT_FIELDS are pinned to one literal here and in test_artworkedits.py (AE-10).
export const AE_OPS = {
  'move-paths': [['op', 'dx', 'select'], ['note']],
  'move-edge': [
    ['op', 'edge', 'select'],
    ['note', 'to', 'dx'],
  ],
  'move-text': [['op', 'dx', 'select'], ['note']],
  'move-line-end': [['op', 'edge', 'dx', 'select'], ['note']],
};
export const AE_SELECT_FIELDS = { path: ['bbox', 'colour', 'paint'], line: ['origin', 'text'] };
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** -> problems for the `artworkEdits` table (shape only; selectors are matched at prepare time). */
export function artworkEditsProblems(table) {
  const problems = [];
  for (const [b, entry] of Object.entries(table)) {
    const where = `artworkEdits.${b}`;
    if (!Array.isArray(entry) || entry.length === 0) {
      problems.push(`${where} must be a non-empty list of ops`);
      continue;
    }
    entry.forEach((op, i) => {
      const w = `${where}[${i}]`;
      // typeof first (G21 #58): Object.hasOwn coerces ['move-paths'] to 'move-paths', which Python refuses.
      if (!isPlainObject(op) || typeof op.op !== 'string' || !Object.hasOwn(AE_OPS, op.op)) {
        problems.push(
          `${w} must be an object whose op is one of ${Object.keys(AE_OPS).join(', ')}`
        );
        return;
      }
      const [req, opt] = AE_OPS[op.op];
      const extra = Object.keys(op).filter((k) => !req.includes(k) && !opt.includes(k));
      if (extra.length) problems.push(`${w} has unknown field(s) ${extra.join(', ')}`);
      const missing = req.filter((k) => !Object.hasOwn(op, k));
      if (missing.length) problems.push(`${w} lacks ${missing.join(', ')}`);
      if (Object.hasOwn(op, 'note') && typeof op.note !== 'string')
        problems.push(`${w}.note must be a string`);
      if (
        (op.op === 'move-edge' || op.op === 'move-line-end') &&
        op.edge !== 'left' &&
        op.edge !== 'right'
      )
        problems.push(`${w}.edge must be left or right`);
      if (op.op === 'move-edge') {
        if (Object.hasOwn(op, 'to') === Object.hasOwn(op, 'dx'))
          problems.push(`${w} needs exactly one of to / dx`);
        else if (!isNum(op.to ?? op.dx)) problems.push(`${w}.to/dx must be a number`);
      } else if (!isNum(op.dx)) problems.push(`${w}.dx must be a number`);
      if (!Array.isArray(op.select) || op.select.length === 0) {
        problems.push(`${w}.select must be a non-empty list`);
        return;
      }
      const fields = op.op === 'move-text' ? AE_SELECT_FIELDS.line : AE_SELECT_FIELDS.path;
      op.select.forEach((s, j) => {
        const ws = `${w}.select[${j}]`;
        if (!isPlainObject(s) || Object.keys(s).sort().join() !== fields.join()) {
          problems.push(`${ws} must have exactly ${fields.join(', ')}`);
          return;
        }
        if (op.op === 'move-text') {
          if (typeof s.text !== 'string' || s.text === '')
            problems.push(`${ws}.text must be a non-empty string`);
          if (!Array.isArray(s.origin) || s.origin.length !== 2 || !s.origin.every(isNum))
            problems.push(`${ws}.origin must be [x, y]`);
        } else {
          if (s.paint !== 'fill' && s.paint !== 'stroke')
            problems.push(`${ws}.paint must be fill or stroke`);
          if (
            !Array.isArray(s.colour) ||
            typeof s.colour[0] !== 'string' ||
            !s.colour.slice(1).every(isNum)
          )
            problems.push(`${ws}.colour must be [operator, numbers...]`);
          const bb = s.bbox;
          if (
            !Array.isArray(bb) ||
            bb.length !== 4 ||
            !bb.every(isNum) ||
            bb[0] > bb[2] ||
            bb[1] > bb[3]
          )
            problems.push(`${ws}.bbox must be [x0, y0, x1, y1] with x0<=x1, y0<=y1`);
        }
      });
    });
  }
  return problems;
}
const PIN_KINDS = new Set(['alias', 'override']);
const MIN_REASON = 40;

/**
 * The 24 sub/superscript characters a held value may use: ₀–₉ ₊ ₋ lowered, ⁰ ¹ ² ³ ⁴–⁹ ⁺ ⁻ raised.
 * compose.py decodes each to its base glyph drawn in the block's OWN source script style, never
 * as the glyph itself (the pinned faces lack ⁰ ⁻ ⁺); ₋ and ⁻ draw U+2013.
 * 🔴 A SECOND IMPLEMENTATION of `experiments/figure-text-translation/heldvalues.py`'s
 * HELD_SCRIPT_CHARS: both tests pin this literal, in this order. Change both or neither.
 */
export const HELD_SCRIPT_CHARS = '₀₁₂₃₄₅₆₇₈₉₊₋⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻';
const SCRIPT_BLOCK = [0x2070, 0x209f]; // Unicode "Superscripts and Subscripts"

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {object} cfg  the parsed figure config
 * @param {{suffix:string, basenamesByBook:Object<string,Set<string>>,
 *          retiredState:Object<string,{rows:number, translatedCopies:string[]}>,
 *          keptState:Object<string,{rows:number, translatedCopies:string[]}>,
 *          heldState?:Object<string,{rows:number, translatedCopies:string[], svgRows:number,
 *                                    sidecarKeys:(string[]|null)}>,
 *          anchorState?:Object<string,{sidecarKeys:(string[]|null)}>,
 *          editState?:Object<string,{rows:number, translatedCopies:string[], svgRows:number}>}} corpus
 *   `heldState` is optional: a corpus without it (Part 1's fixtures) skips the held corpus rules.
 *   `anchorState` likewise skips the anchorExclusions sidecar rule, and `editState` the artworkEdits
 *   row and copy rules.
 * @returns {string[]} problems; empty when the config is valid
 */
export function validateFigureConfig(cfg, corpus) {
  const problems = [];
  const tables = {};
  for (const name of KEYED) {
    // Only an ABSENT table is empty. `?? {}` would also read a null one as empty, and the tools
    // throw on a null table (retiredFigureNames), so the validator must refuse it, not pass it.
    const t = cfg[name] === undefined ? {} : cfg[name];
    if (!isPlainObject(t)) problems.push(`${name} must be an object`);
    tables[name] = t;
  }
  if (problems.length) return problems;

  // No two keys within one table fold together: the resolver would keep only one of them.
  for (const name of KEYED) {
    const seen = new Map();
    for (const k of Object.keys(tables[name])) {
      const f = normkey(k);
      if (seen.has(f)) problems.push(`${name}: ${seen.get(f)} and ${k} fold to the same key`);
      else seen.set(f, k);
    }
  }

  // A pin shares no key with the other three tables: each refuses the figure before a pin is read.
  const foldedKeys = (t) => new Map(Object.keys(t).map((k) => [normkey(k), k]));
  for (const other of ['supersededArtwork', 'retiredFigures', 'keptCopies']) {
    const keys = foldedKeys(tables[other]);
    for (const k of Object.keys(tables.artworkPins)) {
      if (keys.has(normkey(k))) {
        problems.push(
          `artworkPins.${k} is also in ${other} (${keys.get(normkey(k))}) — that pin can never apply`
        );
      }
    }
  }

  // Every key is EXACTLY the basename of an image in exactly one book's source, and no other book
  // holds an image that FOLDS onto it. The tables are global and sources.py matches a key after the
  // fold, so a twin spelt differently in a second book would be retired, superseded or pinned there
  // too, at run time, while an exact-match rule here passed it (R5, amended 2026-10-02).
  const books = Object.entries(corpus.basenamesByBook);
  const foldsByBook = books.map(([b, set]) => [b, new Set([...set].map(normkey))]);
  for (const name of KEYED) {
    for (const k of Object.keys(tables[name])) {
      const owners = books.filter(([, set]) => set.has(k)).map(([b]) => b);
      const foldOwners = foldsByBook.filter(([, f]) => f.has(normkey(k))).map(([b]) => b);
      if (owners.length !== 1 || foldOwners.length !== 1) {
        const twins = foldOwners.filter((b) => !owners.includes(b));
        problems.push(
          `${name}.${k} names an image in ${owners.length} books' source (${owners.join(', ') || 'none'})` +
            (twins.length
              ? `; it folds onto a differently spelt image in ${twins.join(', ')}`
              : '') +
            '; it must be exactly one book, by exact name and by fold'
        );
      }
    }
  }

  // Every entry carries a substantive reason.
  const reasonOf = (name, v) =>
    name === 'artworkPins' ? (isPlainObject(v) ? v.reason : undefined) : v;
  for (const name of TABLES) {
    for (const [k, v] of Object.entries(tables[name])) {
      const r = reasonOf(name, v);
      if (typeof r !== 'string' || r.trim().length <= MIN_REASON) {
        problems.push(`${name}.${k} needs a reason of over ${MIN_REASON} characters`);
      }
    }
  }

  // Each pin names one valid file, no other pin names it, and it is no other figure's artwork.
  const allBasenames = new Map();
  for (const [, set] of books) for (const b of set) allBasenames.set(normkey(b), b);
  const targets = new Map();
  for (const [k, pin] of Object.entries(tables.artworkPins)) {
    if (!isPlainObject(pin)) {
      problems.push(`artworkPins.${k} must be an object`);
      continue;
    }
    if (!PIN_KINDS.has(pin.kind))
      problems.push(
        `artworkPins.${k}.kind must be alias or override, got ${JSON.stringify(pin.kind)}`
      );
    if (!(cfg.editionPrecedence || []).includes(pin.edition)) {
      problems.push(
        `artworkPins.${k}.edition ${JSON.stringify(pin.edition)} is not in editionPrecedence`
      );
    }
    const file = pin.file;
    if (typeof file !== 'string' || !file.trim()) {
      problems.push(`artworkPins.${k}.file must be a non-empty string`);
      continue;
    }
    if (
      file.startsWith('/') ||
      /^[A-Za-z]:/.test(file) ||
      file.includes('\\') ||
      file === '.' ||
      file.split('/').includes('..')
    ) {
      problems.push(
        `artworkPins.${k}.file ${JSON.stringify(file)} must be a relative path inside its tree`
      );
    }
    const ext = path.posix.extname(file);
    const stem = path.posix.basename(file, ext);
    if (stem.toLowerCase().endsWith(corpus.suffix.toLowerCase())) {
      problems.push(
        `artworkPins.${k}.file ${JSON.stringify(file)} is one of our own translated files (its stem ends in the translated suffix)`
      );
    }
    const owner = allBasenames.get(normkey(stem));
    if (owner !== undefined && normkey(owner) !== normkey(k)) {
      problems.push(
        `artworkPins.${k}.file ${JSON.stringify(file)} is the artwork of another figure, ${owner}`
      );
    }
    const target = `${pin.edition}:${path.posix.normalize(file)}`;
    if (targets.has(target))
      problems.push(
        `artworkPins.${k} and artworkPins.${targets.get(target)} name the same file ${target}`
      );
    else targets.set(target, k);
  }

  // A retired figure has no row and no translated copy: what --retire removes.
  for (const k of Object.keys(tables.retiredFigures)) {
    const s = corpus.retiredState[k];
    if (!s) continue; // the exactly-one-book rule above already names it
    if (s.rows)
      problems.push(
        `retiredFigures.${k} still has ${s.rows} image-mapping row(s) — run tools/retire-translated-figure.js --retire`
      );
    for (const f of s.translatedCopies)
      problems.push(`retiredFigures.${k} still has a translated copy: media/${f}`);
  }

  // §C140 ㊾ — A KEPT FIGURE IS THE INVERSE OF A RETIRED ONE: it HAS its row and its translated
  // copy, because that copy is what readers are served and what the ruling keeps. It is not also
  // retired, by any spelling: one ruling removes the copy the other keeps. It MAY also be in
  // supersededArtwork, as a retired figure may — that table is about the SOURCE drawing — and
  // sources.py checks kept first, so the run prints `REFUSED — kept`.
  const retiredKeys = foldedKeys(tables.retiredFigures);
  for (const k of Object.keys(tables.keptCopies)) {
    if (retiredKeys.has(normkey(k))) {
      problems.push(
        `keptCopies.${k} is also in retiredFigures (${retiredKeys.get(normkey(k))}) — a copy cannot be both kept and retired`
      );
    }
    const s = corpus.keptState[k];
    if (!s) continue; // the exactly-one-book rule above already names it
    if (!s.rows)
      problems.push(
        `keptCopies.${k} has no image-mapping row — readers are not served the copy it keeps`
      );
    if (s.translatedCopies.length === 0)
      problems.push(`keptCopies.${k} has no translated copy at the top of its book's media/`);
  }

  // §C140 ㊾ D5(a) — heldBlockValues: {basename: {blockKey: value}}, [USER]'s wording for labels
  // the MT is never sent, drawn by compose.py in place of the source's English. Design:
  // docs/superpowers/specs/2026-10-03-c140-step2-part5-heldblockvalues-design.md, D-b and D-g.
  const neverComposed = ['retiredFigures', 'keptCopies', 'supersededArtwork'].map((t) => [
    t,
    foldedKeys(tables[t]),
  ]);
  const heldState = corpus.heldState || {}; // Part 1's fixtures carry none
  for (const [b, entry] of Object.entries(tables.heldBlockValues)) {
    // A retired, kept or superseded figure is refused before compose, so its values would never
    // be drawn. A PINNED figure is composed (the pin only chooses its artwork), so a pin is fine.
    for (const [t, keys] of neverComposed) {
      if (keys.has(normkey(b))) {
        problems.push(
          `heldBlockValues.${b} is also in ${t} (${keys.get(normkey(b))}) — that figure is never composed, so its values are never drawn`
        );
      }
    }
    if (!isPlainObject(entry) || Object.keys(entry).length === 0) {
      problems.push(`heldBlockValues.${b} must be a non-empty object of {blockKey: value}`);
      continue;
    }
    // The routes that draw a held value: a sidecar recompose and a textless recompose both need
    // an image-mapping row naming an `.svg` (isRecomposableTextless; the sidecar publish), and a
    // translated copy at the top of media/ is what readers are served today.
    const s = heldState[b];
    if (s && !s.svgRows) {
      problems.push(
        `heldBlockValues.${b} has no image-mapping row naming an .svg — no run recomposes it`
      );
    }
    if (s && s.translatedCopies.length === 0) {
      problems.push(`heldBlockValues.${b} has no translated copy at the top of its book's media/`);
    }
    const bought = new Set((s && s.sidecarKeys) || []);
    for (const [k, v] of Object.entries(entry)) {
      if (k === '') {
        problems.push(`heldBlockValues.${b}: a block key must be a non-empty string`);
        continue;
      }
      // The value sheet is Markdown, where a key's `|` is written `\|`. No committed sidecar key
      // holds a backslash (0 of 2,771, measured 2026-10-03), so this is the copy artefact.
      if (k.includes('\\|')) {
        problems.push(
          `heldBlockValues.${b}: the key ${k} holds '\\|', a Markdown escape — copy the bare '|'`
        );
      }
      // A value never overrides a bought (or editor-corrected) label: that one is edited in the
      // figure review panel. figure-compose.py also refuses a send:true key; this catches the
      // ones already in the committed sidecar, in CI.
      if (bought.has(k)) {
        problems.push(
          `heldBlockValues.${b}[${k}] is a bought block in figure-text/${b}.is.json — edit its value there (figure review), not here`
        );
      }
      if (typeof v !== 'string' || v === '') {
        problems.push(`heldBlockValues.${b}[${k}] must be a non-empty string`);
        continue;
      }
      // Lines are separated by '\n', deliberately NOT the key's '|': a value copied in the key's
      // shape would be wrong exactly where FT.lines and the visual lines differ (buffer).
      if (v.includes('|')) {
        problems.push(
          `heldBlockValues.${b}[${k}] contains '|' — a value's lines are separated by a newline; '|' is the KEY's notation`
        );
      }
      const lines = v.split('\n');
      // An edge space would make an unchanged line read as changed and re-lay it.
      if (lines.some((l) => l === '' || l !== l.trim())) {
        problems.push(
          `heldBlockValues.${b}[${k}] has an empty line, or a line with leading or trailing whitespace`
        );
      }
      // A line of only format, combining or control characters draws NOTHING, and U+200B, U+00AD and
      // U+034F are in the pinned faces' cmap, so compose's no-glyph check passes them: the label would
      // be erased. 🔴 A SECOND IMPLEMENTATION of heldvalues.py's `invisible-line` (INVISIBLE_CATEGORIES);
      // each reads its engine's own Unicode tables, so they can differ on a newly assigned code point.
      if (lines.some((l) => INVISIBLE_LINE.test(l))) {
        problems.push(
          `heldBlockValues.${b}[${k}] has a line with no visible character — only format, combining or control characters, which draw nothing`
        );
      }
      // Visual lines merge and never split, so the key's '|'-lines bound the value's lines from
      // above. The exact count (the block's visual lines) is compose.py's `line-count` refusal.
      // A key segment of only U+0020 is the next row's indent space (figtext.is_blank_line); the composer
      // folds it into its neighbour, so it is no line a value can fill (FoodLabel `(cid:127) 5% or less| `).
      // The rule is figure-text-sidecar.cjs's keyInkSegments/keyInkLineCount (its one owner, D6).
      const inkSegs = keyInkSegments(k);
      const keyLines = keyInkLineCount(k);
      if (lines.length > keyLines) {
        problems.push(
          `heldBlockValues.${b}[${k}] has ${lines.length} lines but its key has ${keyLines} source lines`
        );
      }
      for (const ch of new Set(v)) {
        const cp = ch.codePointAt(0);
        if (cp >= SCRIPT_BLOCK[0] && cp <= SCRIPT_BLOCK[1] && !HELD_SCRIPT_CHARS.includes(ch)) {
          const u = cp.toString(16).toUpperCase().padStart(4, '0');
          problems.push(
            `heldBlockValues.${b}[${k}] uses ${ch} (U+${u}), which is not a sub/superscript a held value can draw`
          );
        }
      }
      if (lines.join('|') === k || (inkSegs.length && lines.join('|') === inkSegs.join('|'))) {
        problems.push(`heldBlockValues.${b}[${k}] equals its key — it draws nothing new`);
      }
    }
  }

  // §C140 '6' R-20 — anchorExclusions: {basename: {blockKey: reason}}, the block keys whose label M1
  // (figlayout's source-anchored cuts) must leave alone. Design: docs/superpowers/specs/
  // 2026-10-05-c140-composer-formatting-class-design.md, D-a. The INVERSE of heldBlockValues' sidecar
  // rule: an excluded key is a BOUGHT label, so it must be a block key of the figure's committed sidecar.
  const anchorState = corpus.anchorState; // Part 1's and the held fixtures carry none
  for (const [b, entry] of Object.entries(tables.anchorExclusions)) {
    for (const [t, keys] of neverComposed) {
      if (keys.has(normkey(b))) {
        problems.push(
          `anchorExclusions.${b} is also in ${t} (${keys.get(normkey(b))}) — that figure is never composed, so its exclusions never act`
        );
      }
    }
    if (!isPlainObject(entry) || Object.keys(entry).length === 0) {
      problems.push(`anchorExclusions.${b} must be a non-empty object of {blockKey: reason}`);
      continue;
    }
    const s = anchorState && anchorState[b];
    const sidecar = s ? new Set(s.sidecarKeys || []) : null;
    if (s && s.sidecarKeys === null) {
      problems.push(
        `anchorExclusions.${b} has no committed sidecar figure-text/${b}.is.json — an exclusion is for a bought label`
      );
    }
    for (const [k, r] of Object.entries(entry)) {
      if (k === '') {
        problems.push(`anchorExclusions.${b}: a block key must be a non-empty string`);
        continue;
      }
      // A one-line key never reaches M1 (it runs only at n == n_src >= 2), so the entry could never act.
      if (!k.includes('|')) {
        problems.push(
          `anchorExclusions.${b}[${k}] has no '|' — a one-line label never reaches M1, so the exclusion never acts`
        );
      }
      if (k.includes('\\|')) {
        problems.push(
          `anchorExclusions.${b}: the key ${k} holds '\\|', a Markdown escape — copy the bare '|'`
        );
      }
      if (sidecar && s.sidecarKeys !== null && !sidecar.has(k)) {
        problems.push(
          `anchorExclusions.${b}[${k}] is not a block key of figure-text/${b}.is.json — renamed, re-extracted or mistyped`
        );
      }
      if (typeof r !== 'string' || r.trim().length <= MIN_REASON) {
        problems.push(
          `anchorExclusions.${b}[${k}] needs a reason of over ${MIN_REASON} characters`
        );
      }
    }
  }
  problems.push(...artworkEditsProblems(tables.artworkEdits));

  // §C140 '6' R-15a — artworkEdits' corpus rules, the heldBlockValues ones minus the bought-key rule
  // (an edit is not a label, so a bought sidecar is fine). An edit is drawn only when the figure is
  // recomposed, so a retired, kept or superseded figure's edit is dead, and the figure needs the routes
  // a recompose uses: an image-mapping row naming an `.svg` and a translated copy. A pin is fine (the
  // pinned figure IS composed; its selectors must then match the pinned artwork, at prepare time).
  const editState = corpus.editState || {}; // Part 1's, the held and the anchor fixtures carry none
  for (const b of Object.keys(tables.artworkEdits)) {
    for (const [t, keys] of neverComposed) {
      if (keys.has(normkey(b))) {
        problems.push(
          `artworkEdits.${b} is also in ${t} (${keys.get(normkey(b))}) — that figure is never composed, so its edits are never drawn`
        );
      }
    }
    const s = editState[b];
    if (s && !s.svgRows) {
      problems.push(
        `artworkEdits.${b} has no image-mapping row naming an .svg — no run recomposes it`
      );
    }
    if (s && s.translatedCopies.length === 0) {
      problems.push(`artworkEdits.${b} has no translated copy at the top of its book's media/`);
    }
  }

  // §C140 '6' R-5c2 — sourceAlignedBoxes: {basename: reason}. The policy tables' reason rule, and
  // artworkEdits' corpus rules: the switch acts only when the figure is recomposed, so a retired, kept or
  // superseded figure's entry is dead, and the figure needs an image-mapping row naming an `.svg` and a
  // translated copy. Whether the figure HAS a schematic box is figure-compose.py's verify, at compose time
  // (an entry that reaches no box refuses the figure there).
  const boxState = corpus.boxState || {}; // fixtures that predate the table carry none
  for (const [b, r] of Object.entries(tables.sourceAlignedBoxes)) {
    if (typeof r !== 'string' || r.trim().length <= MIN_REASON) {
      problems.push(`sourceAlignedBoxes.${b} needs a reason of over ${MIN_REASON} characters`);
    }
    for (const [t, keys] of neverComposed) {
      if (keys.has(normkey(b))) {
        problems.push(
          `sourceAlignedBoxes.${b} is also in ${t} (${keys.get(normkey(b))}) — that figure is never composed, so the switch never acts`
        );
      }
    }
    const s = boxState[b];
    if (s && !s.svgRows) {
      problems.push(
        `sourceAlignedBoxes.${b} has no image-mapping row naming an .svg — no run recomposes it`
      );
    }
    if (s && s.translatedCopies.length === 0) {
      problems.push(
        `sourceAlignedBoxes.${b} has no translated copy at the top of its book's media/`
      );
    }
  }
  return problems;
}

/**
 * Every key a JSON text repeats inside one object, at any depth (§C140 ㊾ D5(a); a skeptic's finding,
 * 2026-10-03). JSON.parse keeps only the LAST of two equal keys, so the parsed config cannot show a
 * repeat: a figure's heldBlockValues entry written twice (say one per value-sheet row), or a block key
 * repeated inside one, would drop the first value with no error, and `validateFigureConfig` would pass
 * what is left. figure-compose.py refuses the same thing at compose time, with an `object_pairs_hook`;
 * this is the CI half. Each key is compared as JSON.parse DECODES it (the slice is handed to
 * JSON.parse), so two spellings of one key - `"No"` and `"N\u006f"` - collide as they collapse. A key
 * written n times is named once.
 *
 * The text is parsed first, so invalid JSON throws and the scanner below only ever reads valid JSON.
 *
 * @param {string} text  the raw config file
 * @returns {string[]} problems, in document order; empty when no key repeats
 */
export function repeatedKeyProblems(text) {
  JSON.parse(text);
  const problems = [];
  let i = 0;
  const skipSpace = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) i += 1;
  };
  const readString = () => {
    const start = i;
    i += 1; // the opening quote
    // A backslash skips the character it escapes (the hex digits of \uXXXX are never a quote).
    while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i += 1; // the closing quote
    return JSON.parse(text.slice(start, i));
  };
  const readValue = (where) => {
    skipSpace();
    const c = text[i];
    if (c === '{' || c === '[') {
      const close = c === '{' ? '}' : ']';
      const seen = new Set();
      const named = new Set();
      i += 1;
      skipSpace();
      if (text[i] === close) {
        i += 1;
        return;
      }
      for (let n = 0; ; n += 1) {
        let child = `${where}[${n}]`;
        if (c === '{') {
          skipSpace();
          const key = readString();
          if (seen.has(key) && !named.has(key)) {
            named.add(key);
            problems.push(
              `${where === '' ? 'the config' : where} repeats the key ${key} — JSON keeps only the last ` +
                'of a repeated key, so the earlier one is dropped silently; merge them into one'
            );
          }
          seen.add(key);
          child = where === '' ? key : `${where}.${key}`;
          skipSpace();
          i += 1; // the colon
        }
        readValue(child);
        skipSpace();
        const sep = text[i];
        i += 1; // a comma, or the closing bracket
        if (sep === close) return;
      }
    }
    if (c === '"') {
      readString();
      return;
    }
    while (i < text.length && !',]} \t\n\r'.includes(text[i])) i += 1; // a number, true, false, null
  };
  readValue('');
  return problems;
}

/**
 * A held figure's bought block keys: `Object.keys(sidecar.blocks)`, read STRICTLY. An absent
 * sidecar is null (nothing bought); anything else that cannot be read — unreadable, not JSON,
 * not an object with a `blocks` object — THROWS, as `readMappingOrRefuse` does. Never the
 * lenient `readSidecar`, which answers null for a conflicted file and would pass a collision.
 *
 * @param {string} bookDir
 * @param {string} basename
 * @returns {string[]|null}
 */
function sidecarKeysStrict(bookDir, basename) {
  const file = sidecarPath(bookDir, basename);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(
      `${file} cannot be read (${err.code || err.message}); refusing to check heldBlockValues or anchorExclusions against a sidecar I cannot see`
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `${file} is not valid JSON (${err.message}); refusing to read it as no bought blocks — repair it first`
    );
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.blocks)) {
    throw new Error(
      `${file} is not a sidecar object with a blocks object; refusing to read it as no bought blocks — repair it first`
    );
  }
  return Object.keys(parsed.blocks);
}

/**
 * The corpus the validator needs, read from the repo. No git: this runs in CI.
 * @returns {{suffix:string, basenamesByBook:Object<string,Set<string>>, retiredState:Object,
 *            keptState:Object, heldState:Object<string,{rows:number,
 *            translatedCopies:string[], svgRows:number, sidecarKeys:(string[]|null)}>,
 *            anchorState:Object<string,{sidecarKeys:(string[]|null)}>,
 *            editState:Object<string,{rows:number, translatedCopies:string[], svgRows:number}>,
 *            boxState:Object<string,{rows:number, translatedCopies:string[], svgRows:number}>}}
 */
export function buildValidatorCorpus(repoRoot, cfg) {
  const booksDir = path.join(repoRoot, 'books');
  const basenamesByBook = {};
  for (const b of fs.readdirSync(booksDir).sort()) {
    const bookDir = path.join(booksDir, b);
    if (fs.statSync(bookDir).isDirectory()) basenamesByBook[b] = indexBookSourceBasenames(bookDir);
  }
  // One measurement for both tables (§C140 ㊾): a retired figure must come out with neither a
  // mapping row nor a translated copy, a kept one with both. A key that is not exactly one book's
  // image gets no state; the exactly-one-book rule names it.
  const copyState = (table) => {
    const state = {};
    for (const k of Object.keys(table ?? {})) {
      const owners = Object.keys(basenamesByBook).filter((b) => basenamesByBook[b].has(k));
      if (owners.length !== 1) continue;
      const bookDir = path.join(booksDir, owners[0]);
      const rows = readMappingOrRefuse(path.join(bookDir, 'media', 'image-mapping.json'), {
        allowMissing: true,
      });
      state[k] = {
        rows: rows.filter((r) => r.originalImage === k).length,
        translatedCopies: topLevelTranslatedCopies(bookDir, k, DEFAULT_SUFFIX),
      };
    }
    return state;
  };
  // §C140 ㊾ D5(a) — a held figure is measured as a kept one is (copyState, unchanged), plus the
  // two facts only it needs: its rows naming an `.svg` (what a recompose and the sidecar publish
  // both need) and its sidecar's bought keys (a value never overrides a bought label).
  const heldState = copyState(cfg.heldBlockValues);
  for (const k of Object.keys(heldState)) {
    const owner = Object.keys(basenamesByBook).find((b) => basenamesByBook[b].has(k));
    const bookDir = path.join(booksDir, owner);
    const rows = readMappingOrRefuse(path.join(bookDir, 'media', 'image-mapping.json'), {
      allowMissing: true,
    });
    heldState[k].svgRows = rows.filter(
      (r) =>
        r.originalImage === k &&
        typeof r.outputName === 'string' &&
        path.extname(r.outputName) === '.svg'
    ).length;
    heldState[k].sidecarKeys = sidecarKeysStrict(bookDir, k);
  }
  // §C140 '6' R-15a — an edited figure is measured as a held one is, WITHOUT the sidecar: copyState plus
  // its rows naming an `.svg`. Its sidecar is never read (an edit is not a label).
  const svgRowsOf = (k) => {
    const owner = Object.keys(basenamesByBook).find((b) => basenamesByBook[b].has(k));
    const rows = readMappingOrRefuse(path.join(booksDir, owner, 'media', 'image-mapping.json'), {
      allowMissing: true,
    });
    return rows.filter(
      (r) =>
        r.originalImage === k &&
        typeof r.outputName === 'string' &&
        path.extname(r.outputName) === '.svg'
    ).length;
  };
  const editState = copyState(cfg.artworkEdits);
  for (const k of Object.keys(editState)) editState[k].svgRows = svgRowsOf(k);
  // §C140 '6' R-5c2 — a source-aligned figure is measured exactly as an edited one is; no sidecar is read.
  const boxState = copyState(cfg.sourceAlignedBoxes);
  for (const k of Object.keys(boxState)) boxState[k].svgRows = svgRowsOf(k);
  // §C140 '6' R-20 — an excluded figure needs only its sidecar's block keys (read STRICTLY, as for
  // heldState). A key that is not exactly one book's image gets no state; the exactly-one-book rule
  // names it.
  const anchorState = {};
  for (const k of Object.keys(cfg.anchorExclusions ?? {})) {
    const owners = Object.keys(basenamesByBook).filter((b) => basenamesByBook[b].has(k));
    if (owners.length !== 1) continue;
    anchorState[k] = { sidecarKeys: sidecarKeysStrict(path.join(booksDir, owners[0]), k) };
  }
  return {
    suffix: DEFAULT_SUFFIX,
    basenamesByBook,
    retiredState: copyState(cfg.retiredFigures),
    keptState: copyState(cfg.keptCopies),
    heldState,
    anchorState,
    editState,
    boxState,
  };
}
