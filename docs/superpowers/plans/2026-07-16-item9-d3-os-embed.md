# Item 9 — D3 os-embed Exercise Translation Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the extract→MT→assemble→render path that lets lifraen-efnafraedi's 1,961 os-embed exercises ship in Icelandic instead of English, riding the existing segment pipeline (code only — the MT run itself is a later lead-gated data op).

**Architecture:** A pure reversible HTML⇄segments converter (`tools/lib/exercise-html.js`) turns each exercise field into a byte-exact skeleton + marker-text runs; `tools/exercise-extract.js` writes standard per-chapter segment files + skeleton sidecars from the read-only `01-source/exercises/` cache; a small hook makes `api-translate` carry the exercise files through the existing MT path (gates, locks, costing all apply); `tools/exercise-assemble.js` re-slots translated runs into the skeleton and writes render-shaped sidecars under `03-translated/{track}/exercises/`; `resolveOsEmbed` in the renderer prefers the sidecar with a loud, counted EN fallback. Two scanner guards keep the new files from confusing the 6b coverage gate and the server's module listing.

**Tech Stack:** Node 22 ESM (server file is CJS), Vitest, existing libs: `seg-markers.cjs`, `residue-check.js`, `residue-allowlist.js`, `mt-lock.cjs`.

**Spec:** `docs/superpowers/specs/2026-07-16-item9-d3-os-embed-design.md` (all inventory numbers verified 2026-07-16).

## Global Constraints

- `npm test` from the **repo root** is the authoritative gate.
- `01-source/` is READ-ONLY. `exercise-extract.js` only reads it and must be classified as a **reader** in `tools/__tests__/source-write-guard.test.js` (the suite fails otherwise, by design). `exercise-assemble.js` must not reference `01-source` at all (everything it needs is in the skeleton sidecar).
- **No live `books/` content in the PR.** Test fixtures live under `tools/__tests__/fixtures/`. After the full test run, `git status --porcelain books/` must be empty.
- **Unknown tag policy: fail loud per exercise, never silently strip.** The tag inventory is closed today (spec § Measured facts); anything outside it throws.
- **Round-trip law:** for every field in the live cache, `fieldToHtml(htmlToField(h))` === `h` byte-identical. No entity decoding/re-encoding anywhere (`&gt;`/`&lt;`/`&nbsp;` pass through verbatim). `<img>` is never self-closed in the corpus — emit stored literals verbatim, never reconstruct tags.
- Marker dialect is the proven-survival set only: `[[i:]]`, `[[b:]]`, `[[sub:]]`, `[[sup:]]`, opaque `[[MEDIA:n]]`, id-anchored `[[em:text|n]]`.
- Seg-id scheme conforms to the pipeline's `SEG:module:type:elementId` convention (resolves spec integration check 5): `SEG:{nickname}:stimulus:b{k}` · `SEG:{nickname}:stem:{qid}-b{k}` · `SEG:{nickname}:sol:{qid}-b{k}`. Deterministic — re-extraction is byte-identical; no counters.
- Chapter token = first `-`-delimited nickname segment; `ch` dir = `'ch' + String(parseInt(token,10)).padStart(2,'0')` — **`18a` folds into `ch18`** (spec integration check 6, sanctioned fold; nicknames keep identity in seg-ids so nothing is lost).
- Solutions are extracted **only when `solutions_are_public` is truthy** (mirror `resolveOsEmbed`'s `|| false` truthiness; never render-blocked content → never spent MT budget).
- Path resolution via `import.meta.url`, never `process.cwd()` (repo durable rule; exception: `cnxml-render.js`'s existing relative `BOOKS_DIR` global stays as-is — pre-existing, out of scope).
- Vanilla JS ES modules (server file CJS); no new dependencies; comments state constraints code can't show.
- Branch **`feat/item9-d3-os-embed`** already exists with the spec commit — do NOT create a new branch. Commit prefixes: `feat(item9/D3):` / `test(item9/D3):` / `docs(item9/D3):`.
- A prettier/eslint pre-commit hook reformats staged JS — expected, let it. **Fixture JSON/MD files:** verify after commit that lint-staged did not rewrite them (they must stay verbatim copies); if it did, add them to `.prettierignore` in the same commit.

## Reference: verified interfaces this plan builds against

| Fact | Where |
|------|-------|
| `parseSegmentsMap(content, {duplicates}) → Map<string,string>`; ESM-importable: `import { parseSegmentsMap } from './lib/seg-markers.cjs'` | `tools/lib/seg-markers.cjs:31`, import style `cnxml-inject.js:54` |
| `detectResidue(enText, isText) → {exact, warn, ratio}`; inject's pattern: `r.exact` → allowlisted ? `tolerated` : `residues`; `r.warn` → `residueWarnings` | `tools/lib/residue-check.js:155`, `cnxml-inject.js:1880-1894` |
| `loadResidueAllowlist` / `classifyResidue(moduleId, segmentId, allowlist).tolerated` | `tools/lib/residue-allowlist.js`, `cnxml-inject.js:53` |
| `discoverModules()` strict `^m\d+-segments\.en\.md$`; non-module precedent: `chapter-metadata-segments.en.md` pushed manually into workList with `{moduleId:'chapter-metadata', filename, path}` | `tools/api-translate.js:246-256`, `:1067-1075` |
| MT lock: `{base}-segments.is.md` → `{base}-segments.locked` (so `exercises-segments.locked` — matches git-backup glob `books/*/02-mt-output/*/*-segments.locked`) | `tools/lib/mt-lock.cjs:9`, `scripts/git-backup.sh:20` |
| `resolveOsEmbed(nickname)` reads `{BOOKS_DIR}/01-source/exercises/{nickname}.json` → `{stimulus, questions:[{id, stem, solutions[]}], solutionsPublic}`; consumed at `:1433-1471`; `BOOKS_DIR` global set at `:3084` | `tools/cnxml-render.js:171-191` |
| 6b gate treats any `*-segments.en.md` as a module | `tools/verify-extraction-coverage.js:88-89` |
| Server module listing globs `-segments.en.md` | `server/services/segmentParser.js:478` in `listChapterModules` (CJS, exported `:532`) |
| `03-translated/` is already staged by the git-backup cron | `scripts/git-backup.sh` pathspecs |

---

### Task 0: Verify branch state

**Files:** none (git only)

- [ ] **Step 1: Confirm the branch and clean tree**

```bash
cd <repo>
git branch --show-current   # expect: feat/item9-d3-os-embed
git status --short          # expect: clean
git log --oneline -1        # expect: docs(item9/D3): design spec — os-embed exercise translation path
```

---

### Task 1: `tools/lib/exercise-html.js` — reversible HTML⇄segments converter

**Files:**
- Create: `tools/lib/exercise-html.js`
- Test: `tools/__tests__/exercise-html.test.js`

**Interfaces:**
- Produces (Tasks 2 and 4 import exactly these):
  - `htmlToField(html) → {skeleton, runs, opaques, wraps}` — `skeleton`: string with `\x00SLOT_k\x00` sentinels; `runs`: string[] of marker-text (index = slot k); `opaques`: `{[n]: literalTagText}`; `wraps`: `{[n]: {open, close}}`.
  - `fieldToHtml(field, runs = field.runs) → string` — re-slots (possibly translated) runs, inverts markers; throws on run-count mismatch, unknown opaque/wrap id, stray `[[`, or leftover sentinel.
  - `class UnknownTagError extends Error` (has `.tag`), `class MarkerError extends Error`.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/exercise-html.test.js`:

```js
/**
 * exercise-html.test.js — item 9 (D3): reversible HTML⇄segments converter for
 * os-embed exercise fields. The round-trip law (fieldToHtml(htmlToField(h)) === h,
 * byte-identical) is the load-bearing property: it is what makes the skeleton
 * sidecar a safe place to park untranslatable structure while text rides the
 * MT pipeline as bracket-marker segments.
 */

import { describe, it, expect } from 'vitest';
import { htmlToField, fieldToHtml, UnknownTagError, MarkerError } from '../lib/exercise-html.js';

const roundTrip = (h) => fieldToHtml(htmlToField(h));

describe('htmlToField — text runs and markers', () => {
  it('bare text is a single run with an empty skeleton slot', () => {
    const f = htmlToField('What is the hybridization of carbon?');
    expect(f.runs).toEqual(['What is the hybridization of carbon?']);
    expect(f.skeleton).toBe('\x00SLOT_0\x00');
  });

  it('naked inline tags map to bracket markers, nested included', () => {
    // Real corpus shape: <b>p<i>K</i><sub>1</sub></b> (table header)
    const f = htmlToField('<b>p<i>K</i><sub>1</sub></b>');
    expect(f.runs).toEqual(['[[b:p[[i:K]][[sub:1]]]]']);
  });

  it('sub/sup map to [[sub:]]/[[sup:]]', () => {
    const f = htmlToField('H<sub>2</sub>O and Ca<sup>2+</sup>');
    expect(f.runs).toEqual(['H[[sub:2]]O and Ca[[sup:2+]]']);
  });

  it('img becomes an opaque [[MEDIA:n]] with the literal tag preserved', () => {
    const img = '<img class="scaled-down" src="https://exercises.openstax.org/x/y.jpg" alt="A structure">';
    const f = htmlToField(`Before ${img} after`);
    expect(f.runs).toEqual(['Before [[MEDIA:0]] after']);
    expect(f.opaques[0]).toBe(img);
  });

  it('empty span (data-math) becomes an opaque [[MEDIA:n]], byte-exact', () => {
    // Real corpus shape: H<sub>2</sub>C<span data-math="\\text{═}"></span>CHCO<sub>2</sub>Et
    const h = 'H<sub>2</sub>C<span data-math="\\text{═}"></span>CHCO<sub>2</sub>Et';
    const f = htmlToField(h);
    expect(f.runs[0]).toBe('H[[sub:2]]C[[MEDIA:0]]CHCO[[sub:2]]Et');
    expect(f.opaques[0]).toBe('<span data-math="\\text{═}"></span>');
  });

  it('text-bearing span/small become wrap-anchored [[em:text|n]]', () => {
    const f = htmlToField('<span class="magenta-text">1</span> and <small>note</small>');
    expect(f.runs).toEqual(['[[em:1|0]] and [[em:note|1]]']);
    expect(f.wraps[0]).toEqual({ open: '<span class="magenta-text">', close: '</span>' });
    expect(f.wraps[1]).toEqual({ open: '<small>', close: '</small>' });
  });

  it('attr-bearing i/b fall back to wrap-anchored (byte-exact inversion)', () => {
    const f = htmlToField('<i class="x">t</i>');
    expect(f.runs).toEqual(['[[em:t|0]]']);
    expect(f.wraps[0]).toEqual({ open: '<i class="x">', close: '</i>' });
  });

  it('block structure goes to the skeleton; runs hold only text', () => {
    const h = '<p>First</p>\n<p style="text-align: center">Second</p>';
    const f = htmlToField(h);
    expect(f.runs).toEqual(['First', 'Second']);
    expect(f.skeleton).toBe('<p>\x00SLOT_0\x00</p>\n<p style="text-align: center">\x00SLOT_1\x00</p>');
  });

  it('run leading/trailing whitespace is hoisted into the skeleton', () => {
    const f = htmlToField('<li>\n  item text\n</li>');
    expect(f.runs).toEqual(['item text']);
    expect(f.skeleton).toBe('<li>\n  \x00SLOT_0\x00\n</li>');
  });

  it('entities pass through verbatim (no decode)', () => {
    const f = htmlToField('<p>A &gt; B &nbsp; C&lt;D</p>');
    expect(f.runs).toEqual(['A &gt; B &nbsp; C&lt;D']);
  });

  it('throws UnknownTagError on tags outside the closed inventory', () => {
    expect(() => htmlToField('<p><blockquote>x</blockquote></p>')).toThrow(UnknownTagError);
    try {
      htmlToField('<blockquote>x</blockquote>');
    } catch (e) {
      expect(e.tag).toBe('blockquote');
    }
  });

  it('throws on an unclosed inline tag', () => {
    expect(() => htmlToField('<i>never closed')).toThrow(UnknownTagError);
  });
});

describe('fieldToHtml — inversion and the round-trip law', () => {
  const CASES = [
    'plain text',
    '<b>p<i>K</i><sub>1</sub></b>',
    'H<sub>2</sub>C<span data-math="\\text{═}"></span>CHCO<sub>2</sub>Et',
    '<p>Some p<i>K</i><sub>a</sub> data.</p>\n<table class="unnumbered">\n<tbody><tr>\n<th><b>Name</b></th>\n<th><b>p<i>K</i><sub>1</sub></b></th>\n</tr>\n<tr>\n<td>Oxalic</td>\n<td>1.2</td>\n</tr>\n</tbody></table>',
    '<p>Compound <b>D</b>:</p>\n<ul style="list-style-type:none">\n<li><sup>13</sup>C NMR: 9.7 <i>δ</i></li>\n</ul>',
    '<figure id="fig-00202"><img src="https://x.test/a.jpg" alt="A molecule"></figure>',
    'A &gt; B<br>C &nbsp; <span class="magenta-text">2</span>',
  ];
  for (const h of CASES) {
    it(`round-trips: ${h.slice(0, 40)}…`, () => {
      expect(roundTrip(h)).toBe(h);
    });
  }

  it('re-slots translated runs (structure kept, text replaced)', () => {
    const f = htmlToField('<p>Oxygen</p><p>Nitrogen</p>');
    expect(fieldToHtml(f, ['Súrefni', 'Nitur'])).toBe('<p>Súrefni</p><p>Nitur</p>');
  });

  it('inverts translated markers inside a translated run', () => {
    const f = htmlToField('H<sub>2</sub>O is <i>water</i>');
    expect(fieldToHtml(f, ['H[[sub:2]]O er [[i:vatn]]'])).toBe('H<sub>2</sub>O er <i>vatn</i>');
  });

  it('throws MarkerError on run-count mismatch', () => {
    const f = htmlToField('<p>a</p><p>b</p>');
    expect(() => fieldToHtml(f, ['only one'])).toThrow(MarkerError);
  });

  it('throws MarkerError on an unknown MEDIA id (translation corrupted the digits)', () => {
    const f = htmlToField('x <img src="https://x.test/a.jpg"> y');
    expect(() => fieldToHtml(f, ['x [[MEDIA:7]] y'])).toThrow(MarkerError);
  });

  it('throws MarkerError on a stray [[ left in a translated run', () => {
    const f = htmlToField('plain');
    expect(() => fieldToHtml(f, ['broken [[i:unterminated'])).toThrow(MarkerError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/exercise-html.test.js`
Expected: FAIL — `Cannot find module '../lib/exercise-html.js'`.

- [ ] **Step 3: Implement `tools/lib/exercise-html.js`**

```js
/**
 * exercise-html.js — reversible HTML⇄segments converter for os-embed exercise
 * fields (item 9 / D3). Pure, no I/O.
 *
 * Model: a field's HTML splits into a byte-exact SKELETON (block tags,
 * inter-tag whitespace, opaque content — everything MT must not touch, with
 * \x00SLOT_k\x00 sentinels where text was) and RUNS (the translatable text,
 * inline HTML mapped to the proven-survival bracket dialect). fieldToHtml is
 * the exact inverse; under identity translation the round-trip is
 * byte-identical (tested over the entire live cache — the closed-inventory
 * proof). Anything outside the verified tag inventory throws: a future
 * exercise-bank refresh must surface, never silently strip.
 */

/** Tags handled as block structure (skeleton-side, attrs preserved verbatim). */
const STRUCTURAL_SRC =
  '<\\/?(?:p|br|ul|li|table|thead|tbody|tr|th|td|figure|figcaption)\\b[^>]*>';

/** Attr-free inline tags with deterministic marker inversion. */
const NAKED = { i: 'i', b: 'b', sub: 'sub', sup: 'sup' };
/** Inline tags preserved byte-exact via wrap anchors (arbitrary attrs). */
const WRAP_TAGS = new Set(['span', 'small', 'em', 'strong', 'i', 'b', 'sub', 'sup']);

const SLOT = (k) => `\x00SLOT_${k}\x00`;
const SLOT_RE = /\x00SLOT_(\d+)\x00/g;

export class UnknownTagError extends Error {
  constructor(tag, context) {
    super(`unknown tag <${tag}> in exercise HTML near: ${context}`);
    this.name = 'UnknownTagError';
    this.tag = tag;
  }
}

export class MarkerError extends Error {
  constructor(message, context = '') {
    super(context ? `${message} near: ${context}` : message);
    this.name = 'MarkerError';
  }
}

/** Find the matching close tag for `name`, starting after its open tag. */
function matchClose(text, from, name) {
  const re = new RegExp(`<(/?)${name}\\b[^>]*>`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = re.exec(text)) !== null) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) {
      return { inner: text.slice(from, m.index), end: m.index + m[0].length, closeTag: m[0] };
    }
  }
  throw new UnknownTagError(name, `unclosed <${name}>: ${text.slice(from, from + 40)}`);
}

/** Convert one text run's inline HTML to marker text (recursive). */
function convertRun(text, state) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, lt);
    const tagMatch = /^<([a-zA-Z][\w-]*)\b([^>]*)>/.exec(text.slice(lt));
    if (!tagMatch) throw new UnknownTagError('<', text.slice(lt, lt + 40));
    const openTag = tagMatch[0];
    const name = tagMatch[1].toLowerCase();
    const attrs = tagMatch[2];

    if (name === 'img') {
      // Opaque: store the literal tag (corpus imgs are never self-closed —
      // emitting the stored literal is what keeps round-trips byte-exact).
      const n = state.nextOpaque++;
      state.opaques[n] = openTag;
      out += `[[MEDIA:${n}]]`;
      i = lt + openTag.length;
      continue;
    }
    if (name in NAKED && attrs.trim() === '') {
      const { inner, end } = matchClose(text, lt + openTag.length, name);
      out += `[[${NAKED[name]}:${convertRun(inner, state)}]]`;
      i = end;
      continue;
    }
    if (WRAP_TAGS.has(name)) {
      const { inner, end, closeTag } = matchClose(text, lt + openTag.length, name);
      if (!inner.trim()) {
        // Empty span/small (the 170 data-math spans): nothing to translate —
        // the whole element is opaque, byte-exact.
        const n = state.nextOpaque++;
        state.opaques[n] = text.slice(lt, end);
        out += `[[MEDIA:${n}]]`;
      } else {
        const n = state.nextWrap++;
        state.wraps[n] = { open: openTag, close: closeTag };
        out += `[[em:${convertRun(inner, state)}|${n}]]`;
      }
      i = end;
      continue;
    }
    throw new UnknownTagError(name, text.slice(lt, lt + 60));
  }
  return out;
}

/**
 * Split one exercise field's HTML into skeleton + translatable runs.
 * @param {string} html
 * @returns {{skeleton: string, runs: string[], opaques: Record<string,string>,
 *            wraps: Record<string,{open:string,close:string}>}}
 */
export function htmlToField(html) {
  const state = { opaques: {}, wraps: {}, nextOpaque: 0, nextWrap: 0 };
  let skeleton = '';
  const runs = [];

  const pushRun = (text) => {
    if (!text) return;
    if (!text.trim()) {
      skeleton += text; // whitespace between block tags stays structural
      return;
    }
    // Hoist edge whitespace into the skeleton so MT sees clean segments.
    const lead = text.match(/^\s*/)[0];
    const trail = text.match(/\s*$/)[0];
    const core = text.slice(lead.length, text.length - trail.length);
    skeleton += lead + SLOT(runs.length) + trail;
    runs.push(convertRun(core, state));
  };

  const re = new RegExp(STRUCTURAL_SRC, 'gi');
  let last = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    pushRun(html.slice(last, m.index));
    skeleton += m[0];
    last = m.index + m[0].length;
  }
  pushRun(html.slice(last));

  return { skeleton, runs, opaques: state.opaques, wraps: state.wraps };
}

/** Scan for the `]]` matching an already-consumed `[[type:`, nesting-aware. */
function scanMarkerEnd(s, from) {
  let depth = 1;
  let i = from;
  while (i < s.length) {
    if (s.startsWith('[[', i)) {
      depth++;
      i += 2;
    } else if (s.startsWith(']]', i)) {
      depth--;
      if (depth === 0) return i;
      i += 2;
    } else {
      i++;
    }
  }
  throw new MarkerError('unterminated marker', s.slice(Math.max(0, from - 10), from + 30));
}

/** Invert one (possibly translated) run's markers back to HTML. */
function invertRun(run, field) {
  let out = '';
  let i = 0;
  while (i < run.length) {
    const start = run.indexOf('[[', i);
    if (start === -1) {
      out += run.slice(i);
      break;
    }
    out += run.slice(i, start);
    const head = /^\[\[(i|b|sub|sup|em|MEDIA):/.exec(run.slice(start));
    if (!head) throw new MarkerError('stray [[ in run', run.slice(start, start + 30));
    const type = head[1];
    const bodyStart = start + head[0].length;
    const end = scanMarkerEnd(run, bodyStart);
    const body = run.slice(bodyStart, end);
    if (type === 'MEDIA') {
      const lit = field.opaques[body];
      if (lit === undefined) throw new MarkerError(`unknown MEDIA id ${body}`, run.slice(start, start + 30));
      out += lit;
    } else if (type === 'em') {
      const pm = body.match(/^([\s\S]*)\|(\d+)$/);
      if (!pm) throw new MarkerError('em marker missing |n anchor', run.slice(start, start + 30));
      const wrap = field.wraps[pm[2]];
      if (!wrap) throw new MarkerError(`unknown wrap id ${pm[2]}`, run.slice(start, start + 30));
      out += wrap.open + invertRun(pm[1], field) + wrap.close;
    } else {
      out += `<${type}>${invertRun(body, field)}</${type}>`;
    }
    i = end + 2;
  }
  return out;
}

/**
 * Rebuild a field's HTML from its skeleton and (possibly translated) runs.
 * @param {ReturnType<typeof htmlToField>} field
 * @param {string[]} [runs] - translated runs; defaults to the originals
 * @returns {string}
 */
export function fieldToHtml(field, runs = field.runs) {
  if (runs.length !== field.runs.length) {
    throw new MarkerError(`run count mismatch: ${runs.length} !== ${field.runs.length}`);
  }
  const html = field.skeleton.replace(SLOT_RE, (_, k) => invertRun(runs[Number(k)], field));
  if (html.includes('\x00')) throw new MarkerError('unresolved slot sentinel in skeleton');
  return html;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/exercise-html.test.js`
Expected: PASS (all cases, incl. every round-trip).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/exercise-html.js tools/__tests__/exercise-html.test.js
git commit -m "feat(item9/D3): reversible HTML⇄segments converter for os-embed exercise fields

Pure lib: byte-exact skeleton + marker-text runs (proven-survival dialect
only), opaque MEDIA anchors for img/data-math spans, wrap anchors for
attr-bearing inline tags, fail-loud on anything outside the verified tag
inventory. Round-trip law tested per shape; the whole-corpus sweep lands
with Task 7."
```

---

### Task 2: `tools/exercise-extract.js` + fixtures + source-write-guard classification

**Files:**
- Create: `tools/exercise-extract.js`
- Create: `tools/__tests__/fixtures/exercises/` (5 fixture JSONs, copied VERBATIM from the live cache)
- Modify: `tools/__tests__/source-write-guard.test.js` (classify the new tool as a reader)
- Test: `tools/__tests__/exercise-extract.test.js`

**Interfaces:**
- Consumes: `htmlToField` from `tools/lib/exercise-html.js` (Task 1).
- Produces (Task 4 consumes these files):
  - `02-for-mt/ch{NN}/exercises-segments.en.md` — `<!-- SEG:{nickname}:{type}:{elementId} -->` blocks, exercises sorted by nickname, fields in order stimulus → per-question (source order) stem → sol, runs in slot order.
  - `02-structure/ch{NN}/exercises-skeleton.json` — shape:
    ```json
    {
      "generated_by": "exercise-extract.js",
      "exercises": {
        "01-03-OC-P01": {
          "source_uid": "37538@3",
          "solutions_are_public": true,
          "question_order": ["448142"],
          "fields": {
            "stimulus": { "skeleton": "…", "slots": 1, "opaques": {}, "wraps": {} },
            "stem:448142": { "skeleton": "…", "slots": 1, "opaques": {}, "wraps": {} },
            "sol:448142": { "skeleton": "…", "slots": 2, "opaques": {}, "wraps": {} }
          }
        }
      }
    }
    ```
  - Exported for tests: `extractBook(bookDir, {chapter, verbose, log}) → {chapters: Map<string,{segments, skeleton}>, failures: [{nickname, error}], counts}` (pure of process.exit; the CLI wrapper handles argv/exit).
- Seg-id ↔ field-key mapping (Task 4 relies on it): field `stimulus` → ids `{nickname}:stimulus:b{k}`; field `stem:{qid}` → `{nickname}:stem:{qid}-b{k}`; field `sol:{qid}` → `{nickname}:sol:{qid}-b{k}`; `k` ∈ `0..slots-1`.

- [ ] **Step 1: Copy fixtures (verbatim — no editing)**

```bash
mkdir -p tools/__tests__/fixtures/exercises
F=books/lifraen-efnafraedi/01-source/exercises
# multi-question + stimulus + solutions:
cp "$F/01-03-OC-P01.json" tools/__tests__/fixtures/exercises/
# 18a chapter-token oddity:
cp "$F/18a-04-OC-P01.json" tools/__tests__/fixtures/exercises/
ls "$F" | head -50   # then pick and cp: one img-bearing stem, one table-bearing
                     # solution, one solutions_are_public=false exercise —
                     # verify each property with grep/python before copying;
                     # record WHICH files were chosen in the test file header.
```

(Finding the img/table/private fixtures: `grep -l '<img' $F/*.json | head`, `grep -l '<table' $F/*.json | head`, `grep -l '"solutions_are_public": false' $F/*.json | head` — copy one of each.)

- [ ] **Step 2: Write the failing test**

Create `tools/__tests__/exercise-extract.test.js`:

```js
/**
 * exercise-extract.test.js — item 9 (D3): 01-source/exercises/*.json →
 * per-chapter segments + skeleton sidecars. Deterministic ids, idempotent
 * re-runs, 18a→ch18 fold, private solutions excluded, malformed JSON = loud
 * per-exercise skip. Fixtures are VERBATIM copies of live cache files
 * (see fixtures/exercises/) — do not edit them.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { extractBook } from '../exercise-extract.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'exercises');

/** Build a throwaway book dir with 01-source/exercises from fixtures. */
function makeBook(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-extract-'));
  const exDir = path.join(dir, '01-source', 'exercises');
  fs.mkdirSync(exDir, { recursive: true });
  for (const n of names) {
    fs.copyFileSync(path.join(FIXTURES, n), path.join(exDir, n));
  }
  return dir;
}

describe('extractBook', () => {
  it('writes per-chapter segments with deterministic SEG ids', () => {
    const book = makeBook(['01-03-OC-P01.json']);
    const res = extractBook(book, {});
    expect(res.failures).toEqual([]);
    const seg = fs.readFileSync(path.join(book, '02-for-mt', 'ch01', 'exercises-segments.en.md'), 'utf8');
    expect(seg).toContain('<!-- SEG:01-03-OC-P01:stimulus:b0 -->');
    expect(seg).toMatch(/<!-- SEG:01-03-OC-P01:stem:\d+-b0 -->/);
    const skel = JSON.parse(
      fs.readFileSync(path.join(book, '02-structure', 'ch01', 'exercises-skeleton.json'), 'utf8')
    );
    const ex = skel.exercises['01-03-OC-P01'];
    expect(ex.source_uid).toBe('37538@3');
    expect(ex.question_order.length).toBeGreaterThan(0);
    expect(ex.fields.stimulus.slots).toBeGreaterThan(0);
  });

  it('folds the 18a chapter token into ch18', () => {
    const book = makeBook(['18a-04-OC-P01.json']);
    const res = extractBook(book, {});
    expect(res.failures).toEqual([]);
    expect(fs.existsSync(path.join(book, '02-for-mt', 'ch18', 'exercises-segments.en.md'))).toBe(true);
    const seg = fs.readFileSync(path.join(book, '02-for-mt', 'ch18', 'exercises-segments.en.md'), 'utf8');
    expect(seg).toContain('SEG:18a-04-OC-P01:'); // nickname keeps its identity
  });

  it('is idempotent — re-run output is byte-identical', () => {
    const book = makeBook(['01-03-OC-P01.json', '18a-04-OC-P01.json']);
    extractBook(book, {});
    const segPath = path.join(book, '02-for-mt', 'ch01', 'exercises-segments.en.md');
    const skelPath = path.join(book, '02-structure', 'ch01', 'exercises-skeleton.json');
    const seg1 = fs.readFileSync(segPath, 'utf8');
    const skel1 = fs.readFileSync(skelPath, 'utf8');
    extractBook(book, {});
    expect(fs.readFileSync(segPath, 'utf8')).toBe(seg1);
    expect(fs.readFileSync(skelPath, 'utf8')).toBe(skel1);
  });

  it('skips a malformed JSON loudly and continues', () => {
    const book = makeBook(['01-03-OC-P01.json']);
    fs.writeFileSync(path.join(book, '01-source', 'exercises', '01-04-OC-P99.json'), '{broken');
    const res = extractBook(book, {});
    expect(res.failures.map((f) => f.nickname)).toEqual(['01-04-OC-P99']);
    // the good exercise still extracted:
    expect(fs.existsSync(path.join(book, '02-for-mt', 'ch01', 'exercises-segments.en.md'))).toBe(true);
  });

  it('never writes into 01-source', () => {
    const book = makeBook(['01-03-OC-P01.json']);
    const before = fs.readdirSync(path.join(book, '01-source', 'exercises'));
    extractBook(book, {});
    expect(fs.readdirSync(path.join(book, '01-source', 'exercises'))).toEqual(before);
  });
});

// Private solutions: add the equivalent assertions once the
// solutions_are_public=false fixture is chosen in Step 1 —
// its sol:* field keys must be absent from both segments and skeleton.
```

Also add (in the same step) an assertion using the private-solutions fixture chosen in Step 1 — replace the trailing comment with a real test:

```js
  it('excludes solutions when solutions_are_public is false', () => {
    const book = makeBook(['<PRIVATE_FIXTURE>.json']); // exact name from Step 1
    extractBook(book, {});
    const seg = fs.readFileSync(
      path.join(book, '02-for-mt', '<chNN>', 'exercises-segments.en.md'), 'utf8');
    expect(seg).not.toMatch(/:sol:/);
  });
```

(`<PRIVATE_FIXTURE>`/`<chNN>` are filled with the actual fixture name and its chapter at implementation time — they are data selections, not design decisions.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/exercise-extract.test.js`
Expected: FAIL — `Cannot find module '../exercise-extract.js'`.

- [ ] **Step 4: Implement `tools/exercise-extract.js`**

```js
#!/usr/bin/env node

/**
 * exercise-extract.js — Extract os-embed exercise content into MT-ready
 * segments (item 9 / D3).
 *
 * Reads books/{book}/01-source/exercises/*.json (READ-ONLY — the cache
 * fetched by resolve-os-embed.js) and writes, per chapter:
 *   02-for-mt/chNN/exercises-segments.en.md      (translatable runs)
 *   02-structure/chNN/exercises-skeleton.json    (byte-exact structure)
 *
 * Only the fields the renderer consumes are extracted: stimulus_html,
 * questions[].stem_html, and questions[].collaborator_solutions[0]
 * .content_html — solutions only when solutions_are_public is truthy
 * (mirrors resolveOsEmbed; render-blocked content never spends MT budget).
 *
 * Deterministic seg-ids ({nickname}:{type}:{elementId}) — re-extraction is
 * byte-identical; ids are stable the day real MT runs.
 *
 * Usage:
 *   node tools/exercise-extract.js --book lifraen-efnafraedi [--chapter 12] [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { htmlToField } from './lib/exercise-html.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = path.join(__dirname, '..', 'books');

/** Chapter dir from a nickname's first token: '01'→ch01, '18a'→ch18 (documented fold). */
function chapterDirForNickname(nickname) {
  const token = nickname.split('-')[0];
  const n = parseInt(token, 10);
  if (Number.isNaN(n)) throw new Error(`unparsable chapter token '${token}' in nickname ${nickname}`);
  return `ch${String(n).padStart(2, '0')}`;
}

/** Per-field translatable surfaces of one exercise, in canonical order. */
function exerciseFields(exercise) {
  const fields = [];
  if ((exercise.stimulus_html || '').trim()) {
    fields.push({ key: 'stimulus', type: 'stimulus', elementId: (k) => `b${k}`, html: exercise.stimulus_html });
  }
  const solutionsPublic = exercise.solutions_are_public || false;
  for (const q of exercise.questions || []) {
    if ((q.stem_html || '').trim()) {
      fields.push({ key: `stem:${q.id}`, type: 'stem', elementId: (k) => `${q.id}-b${k}`, html: q.stem_html });
    }
    const sol = (q.collaborator_solutions || [])[0];
    if (solutionsPublic && sol && (sol.content_html || '').trim()) {
      fields.push({ key: `sol:${q.id}`, type: 'sol', elementId: (k) => `${q.id}-b${k}`, html: sol.content_html });
    }
  }
  return fields;
}

/**
 * Extract one book's exercises. Pure of argv/process.exit for testability.
 * @param {string} bookDir - absolute path to books/{slug}
 * @param {{chapter?: string|number, verbose?: boolean, log?: (s:string)=>void}} opts
 * @returns {{chapters: Map<string, {segments: string, skeleton: object}>,
 *            failures: {nickname: string, error: string}[],
 *            counts: {exercises: number, segments: number}}}
 */
export function extractBook(bookDir, opts = {}) {
  const log = opts.log || (() => {});
  const exercisesDir = path.join(bookDir, '01-source', 'exercises');
  if (!fs.existsSync(exercisesDir)) {
    throw new Error(`no exercises cache at ${exercisesDir} (run resolve-os-embed.js first)`);
  }

  const wantCh =
    opts.chapter != null ? `ch${String(parseInt(String(opts.chapter), 10)).padStart(2, '0')}` : null;

  const byChapter = new Map(); // chDir -> [{nickname, exercise}]
  const failures = [];
  const files = fs.readdirSync(exercisesDir).filter((f) => f.endsWith('.json')).sort();

  for (const file of files) {
    const nickname = file.replace(/\.json$/, '');
    try {
      const chDir = chapterDirForNickname(nickname);
      if (wantCh && chDir !== wantCh) continue;
      const exercise = JSON.parse(fs.readFileSync(path.join(exercisesDir, file), 'utf8'));
      if (!byChapter.has(chDir)) byChapter.set(chDir, []);
      byChapter.get(chDir).push({ nickname, exercise });
    } catch (err) {
      failures.push({ nickname, error: err.message });
      log(`  ✗ ${nickname}: ${err.message}`);
    }
  }

  const chapters = new Map();
  let segmentCount = 0;
  let exerciseCount = 0;

  for (const [chDir, list] of [...byChapter.entries()].sort()) {
    const segLines = [];
    const skeleton = { generated_by: 'exercise-extract.js', exercises: {} };

    for (const { nickname, exercise } of list.sort((a, b) => a.nickname.localeCompare(b.nickname))) {
      try {
        const entryFields = {};
        const fieldDefs = exerciseFields(exercise);
        for (const fd of fieldDefs) {
          const field = htmlToField(fd.html);
          entryFields[fd.key] = {
            skeleton: field.skeleton,
            slots: field.runs.length,
            opaques: field.opaques,
            wraps: field.wraps,
          };
          field.runs.forEach((run, k) => {
            segLines.push(`<!-- SEG:${nickname}:${fd.type}:${fd.elementId(k)} -->`, run, '');
            segmentCount++;
          });
        }
        skeleton.exercises[nickname] = {
          source_uid: exercise.uid || null,
          solutions_are_public: exercise.solutions_are_public || false,
          question_order: (exercise.questions || []).map((q) => String(q.id)),
          fields: entryFields,
        };
        exerciseCount++;
      } catch (err) {
        failures.push({ nickname, error: err.message });
        log(`  ✗ ${nickname}: ${err.message}`);
      }
    }

    if (Object.keys(skeleton.exercises).length === 0) continue;

    const forMtDir = path.join(bookDir, '02-for-mt', chDir);
    const structDir = path.join(bookDir, '02-structure', chDir);
    fs.mkdirSync(forMtDir, { recursive: true });
    fs.mkdirSync(structDir, { recursive: true });
    const segments = segLines.join('\n') + '\n';
    const skeletonJson = JSON.stringify(skeleton, null, 2) + '\n';
    fs.writeFileSync(path.join(forMtDir, 'exercises-segments.en.md'), segments, 'utf8');
    fs.writeFileSync(path.join(structDir, 'exercises-skeleton.json'), skeletonJson, 'utf8');
    chapters.set(chDir, { segments, skeleton });
    log(`  ${chDir}: ${Object.keys(skeleton.exercises).length} exercises`);
  }

  return { chapters, failures, counts: { exercises: exerciseCount, segments: segmentCount } };
}

// ─── CLI ─────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log(
      'Usage: node tools/exercise-extract.js --book <slug> [--chapter <num>] [--verbose]'
    );
    process.exit(0);
  }
  const book = args.find((a, i) => args[i - 1] === '--book') || '';
  const chapter = args.find((a, i) => args[i - 1] === '--chapter');
  const verbose = args.includes('--verbose') || args.includes('-v');
  if (!book) {
    console.error('Error: --book <slug> is required');
    process.exit(1);
  }
  const bookDir = path.join(BOOKS_DIR, book);
  if (!fs.existsSync(bookDir)) {
    console.error(`Error: book not found: ${bookDir}`);
    process.exit(1);
  }

  const res = extractBook(bookDir, { chapter, verbose, log: verbose ? console.log : () => {} });
  console.log(
    `Extracted ${res.counts.exercises} exercises → ${res.counts.segments} segments across ${res.chapters.size} chapter file(s)`
  );
  if (res.failures.length > 0) {
    console.error(`FAILED: ${res.failures.length} exercise(s) skipped:`);
    for (const f of res.failures) console.error(`  ${f.nickname}: ${f.error}`);
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/exercise-extract.test.js tools/__tests__/exercise-html.test.js`
Expected: PASS.

- [ ] **Step 6: Classify the tool in the source-write-guard**

Run `npx vitest run tools/__tests__/source-write-guard.test.js` — expected: FAIL naming `exercise-extract.js` as an unclassified `01-source` referencer. Open the test, find the reader/writer classification lists (the failure message points at them), and add `'exercise-extract.js'` to the **readers** list with a one-line comment (`// item 9: reads the exercises cache; writes only 02-for-mt/02-structure`). Re-run — expected: PASS. (If the guard does NOT fail, verify why — the guard matches on `01-source` string references and `exercise-extract.js` contains one; a silent pass means the guard regressed. Do not proceed without understanding.)

- [ ] **Step 7: Commit**

```bash
git add tools/exercise-extract.js tools/__tests__/exercise-extract.test.js \
        tools/__tests__/fixtures/exercises/ tools/__tests__/source-write-guard.test.js
git commit -m "feat(item9/D3): exercise-extract CLI — exercises cache → MT-ready segments + skeleton sidecars

Deterministic {nickname}:{type}:{elementId} seg-ids (idempotent re-runs,
byte-identical); 18a folds to ch18 (documented); private solutions excluded
at the source (render-gated content never spends MT budget); malformed JSON
= loud per-exercise skip, exit 1. Classified as 01-source READER in the
source-write-guard."
```

---

### Task 3: `api-translate.js` exercise-file discovery hook

**Files:**
- Modify: `tools/api-translate.js` (work-list build, `:1060-1080`; helper near `discoverModules` `:246`)
- Test: `tools/__tests__/api-translate-exercises-discovery.test.js`

**Interfaces:**
- Consumes: `02-for-mt/chNN/exercises-segments.en.md` (Task 2's output name).
- Produces: `export function discoverExercisesFile(dir)` → `{moduleId: 'exercises', filename: 'exercises-segments.en.md', path} | null`. The work list gains that entry when present, so MT output lands at `02-mt-output/chNN/exercises-segments.is.md` — which `mt-lock.cjs` maps to `exercises-segments.locked` (already covered by the git-backup glob).

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/api-translate-exercises-discovery.test.js`:

```js
/**
 * api-translate-exercises-discovery.test.js — item 9 (D3): exercises-segments
 * files ride the existing MT path. discoverModules stays strictly m\d+ (its
 * regex is load-bearing for module identity); exercises files are discovered
 * by an explicit sibling helper, mirroring the chapter-metadata precedent.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { discoverModules, discoverExercisesFile } from '../api-translate.js';

function makeDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apitr-disc-'));
  for (const f of files) fs.writeFileSync(path.join(dir, f), '<!-- SEG:x:t:1 -->\nseg\n');
  return dir;
}

describe('exercise-file discovery', () => {
  it('discoverModules does NOT return the exercises file (module regex untouched)', () => {
    const dir = makeDir(['m00031-segments.en.md', 'exercises-segments.en.md']);
    expect(discoverModules(dir).map((m) => m.moduleId)).toEqual(['m00031']);
  });

  it('discoverExercisesFile returns the entry when present', () => {
    const dir = makeDir(['exercises-segments.en.md']);
    const e = discoverExercisesFile(dir);
    expect(e).toEqual({
      moduleId: 'exercises',
      filename: 'exercises-segments.en.md',
      path: path.join(dir, 'exercises-segments.en.md'),
    });
  });

  it('discoverExercisesFile returns null when absent', () => {
    const dir = makeDir(['m00031-segments.en.md']);
    expect(discoverExercisesFile(dir)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/api-translate-exercises-discovery.test.js`
Expected: FAIL — `discoverExercisesFile` is not exported.

- [ ] **Step 3: Implement the hook**

3a. Next to `discoverModules` (after `tools/api-translate.js:256`), add:

```js
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
```

3b. In the work-list build (read `tools/api-translate.js:1060-1085` first — the `chapter-metadata` block is the template), add immediately after the chapter-metadata block, with the **identical field set** that block uses when pushing into `modules` (if it sets more fields than `{moduleId, filename, path}` — e.g. an output path or flags — replicate them for the exercises entry the same way):

```js
    // Exercise segments (item 9/D3) ride the same per-chapter MT path.
    const exercisesEntry = discoverExercisesFile(inputDir);
    if (exercisesEntry) {
      modules.push(exercisesEntry);
    }
```

3c. Verify downstream naming holds by reading, not assuming: `moduleIdFromOutputPath` (`:855`) yields `exercises` for `exercises-segments.is.md`; the links-file copy (`:952`) is `existsSync`-guarded (no links file → no-op); the `.locked` check derives `exercises-segments.locked`. If any of these sites special-cases `m\d+`, handle it there explicitly and note it in the report.

- [ ] **Step 4: Run tests to verify pass (discovery + the tool's existing suites)**

Run: `npx vitest run tools/__tests__/api-translate-exercises-discovery.test.js tools/__tests__/api-translate-bracket-count.test.js && npx vitest run tools/ -t "api-translate"`
Expected: PASS — new discovery behavior plus every existing api-translate suite untouched.

- [ ] **Step 5: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate-exercises-discovery.test.js
git commit -m "feat(item9/D3): api-translate discovers exercises-segments files per chapter

Explicit sibling helper (chapter-metadata precedent) — module discovery
regex untouched. Exercises MT output inherits SEG-count gate, B3 bracket
deltas, dry-run costing, and the .locked edit-lock for free."
```

---

### Task 4: `tools/exercise-assemble.js` — translated segments → render-shaped sidecars

**Files:**
- Create: `tools/exercise-assemble.js`
- Test: `tools/__tests__/exercise-assemble.test.js`

**Interfaces:**
- Consumes: skeleton sidecars + EN segments (Task 2 shapes), IS segments (`02-mt-output` or `03-faithful-translation`), `fieldToHtml`/`MarkerError` (Task 1), `parseSegmentsMap` (`./lib/seg-markers.cjs`), `detectResidue` (`./lib/residue-check.js`), `loadResidueAllowlist`/`classifyResidue` (`./lib/residue-allowlist.js`).
- Produces: `03-translated/{track}/exercises/{nickname}.json`:
  ```json
  {
    "nickname": "01-03-OC-P01",
    "source_uid": "37538@3",
    "generated_by": "exercise-assemble.js",
    "track": "mt-preview",
    "solutions_are_public": true,
    "stimulus_html": "…IS…",
    "questions": [
      { "id": "448142", "stem_html": "…IS…", "collaborator_solutions": [{ "content_html": "…IS…" }] }
    ]
  }
  ```
  Field names deliberately identical to the source JSON so `resolveOsEmbed` (Task 5) parses either with one loader. Every source question appears in `questions` (stems are universal in the corpus); `collaborator_solutions` is `[]` where no public solution was extracted; `stimulus_html` is `''` when the exercise had none.
  Exported for tests: `assembleBook(bookDir, {track, chapter, log}) → {written: string[], skipped: [{nickname, reason}], residues: [{nickname, segId}], tolerated: [...], chaptersMissingIs: string[]}`.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/exercise-assemble.test.js`:

```js
/**
 * exercise-assemble.test.js — item 9 (D3): IS segments + skeleton → translated
 * exercise sidecars, render-shaped. Fail-loud invariants: missing segment,
 * marker corruption, or a real EN residue → that exercise is SKIPPED (no
 * sidecar, EN fallback persists) and reported; never a half-translated file.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { extractBook } from '../exercise-extract.js';
import { assembleBook } from '../exercise-assemble.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'exercises');

/** Book with one extracted fixture + a synthetic IS file derived from the EN. */
function makeBook({ mutateIs } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-asm-'));
  const exDir = path.join(dir, '01-source', 'exercises');
  fs.mkdirSync(exDir, { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, '01-03-OC-P01.json'), path.join(exDir, '01-03-OC-P01.json'));
  extractBook(dir, {});
  const en = fs.readFileSync(path.join(dir, '02-for-mt', 'ch01', 'exercises-segments.en.md'), 'utf8');
  // Pseudo-translate: prefix every non-marker, non-blank line — clearly
  // different text (defeats the residue exact-match) while preserving markers.
  let is = en
    .split('\n')
    .map((l) => (l.startsWith('<!-- SEG:') || l.trim() === '' ? l : `ÞÝТ ${l}`))
    .join('\n');
  if (mutateIs) is = mutateIs(is);
  const outDir = path.join(dir, '02-mt-output', 'ch01');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'exercises-segments.is.md'), is, 'utf8');
  return dir;
}

describe('assembleBook — happy path', () => {
  it('writes a render-shaped sidecar for mt-preview', () => {
    const book = makeBook();
    const res = assembleBook(book, { track: 'mt-preview' });
    expect(res.skipped).toEqual([]);
    expect(res.written).toEqual([path.join(book, '03-translated', 'mt-preview', 'exercises', '01-03-OC-P01.json')]);
    const side = JSON.parse(fs.readFileSync(res.written[0], 'utf8'));
    expect(side.nickname).toBe('01-03-OC-P01');
    expect(side.track).toBe('mt-preview');
    expect(side.questions.length).toBeGreaterThan(0);
    expect(side.questions[0].stem_html).toContain('ÞÝТ');
    expect(side.generated_by).toBe('exercise-assemble.js');
  });

  it('reports a chapter whose IS segments are missing (faithful before review exists)', () => {
    const book = makeBook();
    const res = assembleBook(book, { track: 'faithful' });
    expect(res.written).toEqual([]);
    expect(res.chaptersMissingIs).toEqual(['ch01']);
  });
});

describe('assembleBook — fail-loud invariants', () => {
  it('missing segment id → exercise skipped, no sidecar', () => {
    const book = makeBook({
      mutateIs: (is) => is.replace(/<!-- SEG:01-03-OC-P01:stimulus:b0 -->\n[^\n]*\n/, ''),
    });
    const res = assembleBook(book, { track: 'mt-preview' });
    expect(res.written).toEqual([]);
    expect(res.skipped.length).toBe(1);
    expect(res.skipped[0].nickname).toBe('01-03-OC-P01');
  });

  it('marker corruption in IS → exercise skipped, no sidecar', () => {
    const book = makeBook({ mutateIs: (is) => is.replaceAll('[[sub:', '[[oops:') });
    const res = assembleBook(book, { track: 'mt-preview' });
    // If the fixture has no [[sub: markers this mutate is a no-op — the test
    // asserts on written-or-skipped consistency instead of failing silently:
    expect(res.written.length + res.skipped.length).toBe(1);
    if (res.skipped.length === 1) {
      expect(fs.existsSync(path.join(book, '03-translated', 'mt-preview', 'exercises', '01-03-OC-P01.json'))).toBe(false);
    }
  });

  it('untranslated (identical) segments → real residue → skipped', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ex-asm-res-'));
    const exDir = path.join(dir, '01-source', 'exercises');
    fs.mkdirSync(exDir, { recursive: true });
    fs.copyFileSync(path.join(FIXTURES, '01-03-OC-P01.json'), path.join(exDir, '01-03-OC-P01.json'));
    extractBook(dir, {});
    const en = fs.readFileSync(path.join(dir, '02-for-mt', 'ch01', 'exercises-segments.en.md'), 'utf8');
    const outDir = path.join(dir, '02-mt-output', 'ch01');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'exercises-segments.is.md'), en, 'utf8'); // EN verbatim
    const res = assembleBook(dir, { track: 'mt-preview' });
    expect(res.written).toEqual([]);
    expect(res.residues.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/exercise-assemble.test.js`
Expected: FAIL — `Cannot find module '../exercise-assemble.js'`.

- [ ] **Step 3: Implement `tools/exercise-assemble.js`**

```js
#!/usr/bin/env node

/**
 * exercise-assemble.js — Assemble translated os-embed exercise sidecars
 * (item 9 / D3). The inject-stage counterpart for exercise content.
 *
 * Reads per-chapter skeleton sidecars (02-structure) + EN segments
 * (02-for-mt) + IS segments (02-mt-output for mt-preview, or
 * 03-faithful-translation for faithful), re-slots translated runs into each
 * field's skeleton, and writes 03-translated/{track}/exercises/{nickname}.json
 * shaped exactly like the fields resolveOsEmbed reads from source.
 *
 * Never touches 01-source (everything needed rides the skeleton sidecar).
 *
 * Fail-loud invariants (spec): a missing segment, marker corruption, or a
 * real EN residue skips THAT exercise (no sidecar — the renderer's EN
 * fallback persists) and sets exit code 1; other exercises proceed.
 * Residue policy = inject's, same libs (detectResidue + allowlist).
 *
 * Usage:
 *   node tools/exercise-assemble.js --book lifraen-efnafraedi --track mt-preview [--chapter 12] [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fieldToHtml } from './lib/exercise-html.js';
import { parseSegmentsMap } from './lib/seg-markers.cjs';
import { detectResidue } from './lib/residue-check.js';
import { loadResidueAllowlist, classifyResidue } from './lib/residue-allowlist.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = path.join(__dirname, '..', 'books');

/** Seg-id for field key + slot, mirroring exercise-extract's scheme exactly. */
function segIdFor(nickname, fieldKey, k) {
  if (fieldKey === 'stimulus') return `${nickname}:stimulus:b${k}`;
  const [type, qid] = fieldKey.split(':'); // 'stem:448142' | 'sol:448142'
  return `${nickname}:${type}:${qid}-b${k}`;
}

/**
 * Assemble one book's translated exercises.
 * @param {string} bookDir - absolute path to books/{slug}
 * @param {{track: 'mt-preview'|'faithful', chapter?: string|number,
 *          log?: (s:string)=>void}} opts
 */
export function assembleBook(bookDir, opts) {
  const track = opts.track;
  if (track !== 'mt-preview' && track !== 'faithful') {
    throw new Error(`--track must be mt-preview or faithful (got '${track}')`);
  }
  const log = opts.log || (() => {});
  const allowlist = loadResidueAllowlist(bookDir);

  const structRoot = path.join(bookDir, '02-structure');
  const wantCh =
    opts.chapter != null ? `ch${String(parseInt(String(opts.chapter), 10)).padStart(2, '0')}` : null;

  const written = [];
  const skipped = [];
  const residues = [];
  const tolerated = [];
  const chaptersMissingIs = [];

  const chDirs = fs.existsSync(structRoot)
    ? fs.readdirSync(structRoot).filter((d) => /^ch\d+$/.test(d)).sort()
    : [];

  for (const chDir of chDirs) {
    if (wantCh && chDir !== wantCh) continue;
    const skelPath = path.join(structRoot, chDir, 'exercises-skeleton.json');
    if (!fs.existsSync(skelPath)) continue;

    const enPath = path.join(bookDir, '02-for-mt', chDir, 'exercises-segments.en.md');
    const isPath =
      track === 'faithful'
        ? path.join(bookDir, '03-faithful-translation', chDir, 'exercises-segments.is.md')
        : path.join(bookDir, '02-mt-output', chDir, 'exercises-segments.is.md');

    if (!fs.existsSync(isPath)) {
      chaptersMissingIs.push(chDir);
      log(`  ${chDir}: no ${track} IS segments yet — skipped`);
      continue;
    }

    const skeletonDoc = JSON.parse(fs.readFileSync(skelPath, 'utf8'));
    const enMap = fs.existsSync(enPath)
      ? parseSegmentsMap(fs.readFileSync(enPath, 'utf8'))
      : new Map();
    const isMap = parseSegmentsMap(fs.readFileSync(isPath, 'utf8'));

    const outDir = path.join(bookDir, '03-translated', track, 'exercises');
    fs.mkdirSync(outDir, { recursive: true });

    for (const [nickname, entry] of Object.entries(skeletonDoc.exercises)) {
      try {
        const assembled = {}; // fieldKey -> IS html
        for (const [fieldKey, fieldMeta] of Object.entries(entry.fields)) {
          const runs = [];
          for (let k = 0; k < fieldMeta.slots; k++) {
            const segId = segIdFor(nickname, fieldKey, k);
            const isText = isMap.get(segId);
            if (isText === undefined) throw new Error(`missing IS segment ${segId}`);
            const enText = enMap.get(segId);
            if (enText !== undefined) {
              const r = detectResidue(enText, isText); // inject's policy, same lib
              if (r.exact) {
                if (classifyResidue(nickname, segId, allowlist).tolerated) {
                  tolerated.push({ nickname, segId });
                } else {
                  residues.push({ nickname, segId });
                  throw new Error(`untranslated EN residue at ${segId}`);
                }
              }
            }
            runs.push(isText.trim());
          }
          const field = {
            skeleton: fieldMeta.skeleton,
            runs: new Array(fieldMeta.slots).fill(''),
            opaques: fieldMeta.opaques,
            wraps: fieldMeta.wraps,
          };
          assembled[fieldKey] = fieldToHtml(field, runs); // throws MarkerError on corruption
        }

        const sidecar = {
          nickname,
          source_uid: entry.source_uid,
          generated_by: 'exercise-assemble.js',
          track,
          solutions_are_public: entry.solutions_are_public,
          stimulus_html: assembled.stimulus || '',
          questions: entry.question_order.map((qid) => ({
            id: qid,
            stem_html: assembled[`stem:${qid}`] || '',
            collaborator_solutions:
              `sol:${qid}` in assembled ? [{ content_html: assembled[`sol:${qid}`] }] : [],
          })),
        };

        // Temp+rename: a sidecar either exists complete or not at all.
        const outPath = path.join(outDir, `${nickname}.json`);
        const tmpPath = `${outPath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(sidecar, null, 2) + '\n', 'utf8');
        fs.renameSync(tmpPath, outPath);
        written.push(outPath);
      } catch (err) {
        skipped.push({ nickname, reason: err.message });
        log(`  ✗ ${nickname}: ${err.message}`);
      }
    }
  }

  return { written, skipped, residues, tolerated, chaptersMissingIs };
}

// ─── CLI ─────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log(
      'Usage: node tools/exercise-assemble.js --book <slug> --track <mt-preview|faithful> [--chapter <num>] [--verbose]'
    );
    process.exit(0);
  }
  const book = args.find((a, i) => args[i - 1] === '--book') || '';
  const track = args.find((a, i) => args[i - 1] === '--track') || '';
  const chapter = args.find((a, i) => args[i - 1] === '--chapter');
  const verbose = args.includes('--verbose') || args.includes('-v');
  if (!book || !track) {
    console.error('Error: --book and --track are required');
    process.exit(1);
  }
  const bookDir = path.join(BOOKS_DIR, book);
  if (!fs.existsSync(bookDir)) {
    console.error(`Error: book not found: ${bookDir}`);
    process.exit(1);
  }

  const res = assembleBook(bookDir, {
    track,
    chapter,
    log: verbose ? console.log : () => {},
  });
  console.log(
    `Assembled ${res.written.length} exercise sidecar(s) [track=${track}]` +
      (res.tolerated.length ? `; tolerated (allowlisted) residues: ${res.tolerated.length}` : '')
  );
  if (res.chaptersMissingIs.length > 0) {
    console.log(`  chapters without ${track} IS segments: ${res.chaptersMissingIs.join(', ')}`);
  }
  if (res.skipped.length > 0) {
    console.error(`FAILED: ${res.skipped.length} exercise(s) skipped (EN fallback persists):`);
    for (const s of res.skipped) console.error(`  ${s.nickname}: ${s.reason}`);
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
```

Note on `loadResidueAllowlist` / `classifyResidue`: read their exact signatures in `tools/lib/residue-allowlist.js` before wiring (inject calls `classifyResidue(moduleId, segmentId, residueAllowlist).tolerated` — `cnxml-inject.js:4097`; the nickname stands in for the module id). If `loadResidueAllowlist` takes a book **slug** rather than a dir, adapt the call — the test's temp book has no allowlist file, so the loader's missing-file behavior (empty allowlist) is exercised either way.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/exercise-assemble.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/exercise-assemble.js tools/__tests__/exercise-assemble.test.js
git commit -m "feat(item9/D3): exercise-assemble CLI — translated segments → render-shaped sidecars

Track-aware IS source (mt-preview←02-mt-output, faithful←03-faithful);
skeleton re-slot + marker inversion; inject's residue policy via the same
libs; temp+rename per exercise; any failure skips THAT exercise loudly (no
sidecar — renderer EN fallback persists), exit 1."
```

---

### Task 5: Track-aware `resolveOsEmbed` with loud EN fallback

**Files:**
- Modify: `tools/cnxml-render.js` (`resolveOsEmbed` `:171-191`; `renderCnxmlToHtml` options block `:496-506`; `main()` near `:3084`; export block `:3954+`)
- Test: `tools/__tests__/cnxml-render-osembed-track.test.js`

**Interfaces:**
- Consumes: sidecar files from Task 4 (`03-translated/{track}/exercises/{nickname}.json`, same field names as source).
- Produces: module globals `RENDER_TRACK` (default `'mt-preview'`, set from `options.track` in `renderCnxmlToHtml` and from `args.track` in `main()`) and `OS_EMBED_STATS = {translated: 0, fallback: 0}`; new exports `_setBooksDirForTest(dir)`, `_getOsEmbedStatsForTest()`, `_resetOsEmbedStatsForTest()`. CLI prints `os-embed: N translated / M EN-fallback` at end of run when N+M > 0. **Non-gating** — a fallback never fails a render.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/cnxml-render-osembed-track.test.js`:

```js
/**
 * cnxml-render-osembed-track.test.js — item 9 (D3): resolveOsEmbed prefers the
 * translated sidecar for the active track and falls back to EN loudly
 * (counted, never gating). Uses a temp book dir via _setBooksDirForTest.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  renderCnxmlToHtml,
  _loadBookConfigForTest,
  _setBooksDirForTest,
  _getOsEmbedStatsForTest,
  _resetOsEmbedStatsForTest,
} from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e'); // any config; os-embed is book-agnostic

const EN_EXERCISE = {
  uid: '1@1',
  nickname: '01-03-OC-P01',
  solutions_are_public: true,
  stimulus_html: 'English stimulus',
  questions: [{ id: '9', stem_html: 'English stem', collaborator_solutions: [{ content_html: 'English solution' }] }],
};
const IS_SIDECAR = {
  nickname: '01-03-OC-P01',
  source_uid: '1@1',
  generated_by: 'exercise-assemble.js',
  track: 'mt-preview',
  solutions_are_public: true,
  stimulus_html: 'Íslenskt áreiti',
  questions: [{ id: '9', stem_html: 'Íslensk spurning', collaborator_solutions: [{ content_html: 'Íslensk lausn' }] }],
};

const DOC =
  '<document xmlns="http://cnx.rice.edu/cnxml"><title>T</title><content>' +
  '<section class="section-exercises" id="s1"><title>Æfingar</title>' +
  '<exercise id="e1"><problem id="p1"><para id="pp1">' +
  '<link class="os-embed" url="#exercise/01-03-OC-P01"/></para></problem></exercise>' +
  '</section></content></document>';

let bookDir;
beforeEach(() => {
  bookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osembed-'));
  const src = path.join(bookDir, '01-source', 'exercises');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, '01-03-OC-P01.json'), JSON.stringify(EN_EXERCISE));
  _setBooksDirForTest(bookDir);
  _resetOsEmbedStatsForTest();
});
afterEach(() => _setBooksDirForTest(null));

function render(opts = {}) {
  return renderCnxmlToHtml(DOC, { lang: 'is', chapter: 1, moduleId: 'mTEST', moduleSections: {}, ...opts }).html;
}

describe('resolveOsEmbed track preference', () => {
  it('renders the translated sidecar when present for the track', () => {
    const dir = path.join(bookDir, '03-translated', 'mt-preview', 'exercises');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '01-03-OC-P01.json'), JSON.stringify(IS_SIDECAR));
    const html = render({ track: 'mt-preview' });
    expect(html).toContain('Íslensk spurning');
    expect(html).not.toContain('English stem');
    expect(_getOsEmbedStatsForTest()).toEqual({ translated: 1, fallback: 0 });
  });

  it('falls back to EN loudly (counted) when no sidecar exists', () => {
    const html = render({ track: 'mt-preview' });
    expect(html).toContain('English stem');
    expect(_getOsEmbedStatsForTest()).toEqual({ translated: 0, fallback: 1 });
  });

  it('track isolation: a mt-preview sidecar does not leak into faithful renders', () => {
    const dir = path.join(bookDir, '03-translated', 'mt-preview', 'exercises');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '01-03-OC-P01.json'), JSON.stringify(IS_SIDECAR));
    const html = render({ track: 'faithful' });
    expect(html).toContain('English stem');
    expect(_getOsEmbedStatsForTest()).toEqual({ translated: 0, fallback: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-render-osembed-track.test.js`
Expected: FAIL — `_setBooksDirForTest` (etc.) not exported.

- [ ] **Step 3: Implement**

3a. Near the `BOOKS_DIR` global (`tools/cnxml-render.js:144`), add:

```js
// Item 9/D3: active publication track for os-embed sidecar preference and
// the run's translated/fallback tally. Set from options.track (in-process
// callers) and args.track (CLI main). Non-gating by design — an EN fallback
// is counted and reported, never a failure (organic ships all-EN today).
let RENDER_TRACK = 'mt-preview';
const OS_EMBED_STATS = { translated: 0, fallback: 0 };
let BOOKS_DIR_TEST_OVERRIDE = null;

function _setBooksDirForTest(dir) {
  BOOKS_DIR_TEST_OVERRIDE = dir;
}
function _getOsEmbedStatsForTest() {
  return { ...OS_EMBED_STATS };
}
function _resetOsEmbedStatsForTest() {
  OS_EMBED_STATS.translated = 0;
  OS_EMBED_STATS.fallback = 0;
}
```

3b. Replace `resolveOsEmbed` (`:171-191`) with:

```js
/**
 * Look up exercise content for an os-embed reference: the translated sidecar
 * for the active track when present (item 9/D3), else the EN source cache —
 * counted as a fallback, never a failure.
 * Returns { stimulus, questions, solutionsPublic } or null if not cached.
 */
function resolveOsEmbed(nickname) {
  const base = BOOKS_DIR_TEST_OVERRIDE || BOOKS_DIR;
  const readExercise = (p) => {
    if (!p || !fs.existsSync(p)) return null;
    try {
      const exercise = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return {
        stimulus: exercise.stimulus_html || '',
        questions: (exercise.questions || []).map((q) => ({
          id: q.id,
          stem: q.stem_html || '',
          solutions: (q.collaborator_solutions || []).map((s) => s.content_html || ''),
        })),
        solutionsPublic: exercise.solutions_are_public || false,
      };
    } catch {
      return null;
    }
  };

  const translated = readExercise(
    safeJoin(path.join(base, '03-translated', RENDER_TRACK, 'exercises'), `${nickname}.json`)
  );
  if (translated) {
    OS_EMBED_STATS.translated++;
    return translated;
  }
  const en = readExercise(safeJoin(path.join(base, '01-source', 'exercises'), `${nickname}.json`));
  if (en) OS_EMBED_STATS.fallback++;
  return en;
}
```

(Note: the original used `path.join(BOOKS_DIR, '01-source', 'exercises')` + `safeJoin(exercisesDir, …)` — keep `safeJoin` for the nickname exactly as before; verify `safeJoin`'s argument order at `:150-161` matches this usage before editing.)

3c. In `renderCnxmlToHtml`'s options block (after the `options.embedMap` line, `:506`):

```js
  if (options.track) RENDER_TRACK = options.track;
```

3d. In `main()` where `BOOKS_DIR` is set from args (`:3084`), add:

```js
  RENDER_TRACK = args.track || 'mt-preview';
```

and at the end of `main()`'s per-run summary output, add:

```js
  if (OS_EMBED_STATS.translated + OS_EMBED_STATS.fallback > 0) {
    console.log(
      `os-embed: ${OS_EMBED_STATS.translated} translated / ${OS_EMBED_STATS.fallback} EN-fallback`
    );
  }
```

3e. Add to the export block (`:3954+`): `_setBooksDirForTest,`, `_getOsEmbedStatsForTest,`, `_resetOsEmbedStatsForTest,`.

- [ ] **Step 4: Run tests — new + renderer blast radius**

Run: `npx vitest run tools/__tests__/cnxml-render-osembed-track.test.js && npx vitest run tools/`
Expected: PASS all; every pre-existing renderer suite unchanged (the resolveOsEmbed rewrite is behavior-identical when no sidecar exists: same EN read, same nulls).

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render-osembed-track.test.js
git commit -m "feat(item9/D3): resolveOsEmbed prefers the track's translated sidecar, loud EN fallback

RENDER_TRACK plumbed from options.track/args.track; translated/fallback
tally printed per run (non-gating — organic ships all-EN today, this is
progressive enhancement). Test seam: _setBooksDirForTest + stats accessors."
```

---

### Task 6: Scanner guards — 6b gate skip + server module-listing exclusion

**Files:**
- Modify: `tools/verify-extraction-coverage.js:86-92` (file loop)
- Modify: `server/services/segmentParser.js:478` (`listChapterModules` filter)
- Test: `tools/__tests__/verify-extraction-coverage-exercises.test.js`
- Test: `server/__tests__/segmentParserExercises.test.js`

**Interfaces:**
- Consumes: the filename constant `exercises-segments.en.md` (Tasks 2–4).
- Produces: no new interfaces — both changes are exclusions with tests. Without them: the 6b gate would report module `exercises` under `modulesMissingSource` (false finding), and the editorial server would list a phantom module named `exercises`.

- [ ] **Step 1: Write the failing 6b-gate test**

Create `tools/__tests__/verify-extraction-coverage-exercises.test.js`:

```js
/**
 * verify-extraction-coverage-exercises.test.js — item 9 (D3): the pre-freeze
 * coverage gate measures CNXML extraction; exercises-segments.en.md is
 * JSON-sourced (os-embed path) and must be skipped BY NAME, not treated as a
 * module (it would otherwise land in modulesMissingSource as a false finding).
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

it('gate ignores exercises-segments.en.md (no phantom module finding)', () => {
  // Hermetic mini-book: books root override via the gate's CLI contract —
  // read tools/verify-extraction-coverage.js:40-75 for the exact flag; if the
  // gate only supports real books/ paths, create the temp book under
  // books/__e2e-fixture__-style naming is NOT allowed — instead invoke the
  // analyzer library directly:
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-ex-'));
  fs.mkdirSync(path.join(dir, '02-for-mt', 'ch01'), { recursive: true });
  fs.mkdirSync(path.join(dir, '01-source'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '02-for-mt', 'ch01', 'exercises-segments.en.md'),
    '<!-- SEG:01-03-OC-P01:stimulus:b0 -->\ntext\n'
  );
  // Assert via the gate's exported/underlying analysis entry point (see
  // implementation step): scanning this dir yields ZERO module entries.
  const { collectModuleFiles } = requireGateInternals();
  const files = collectModuleFiles(path.join(dir, '02-for-mt'));
  expect(files.map((f) => f.moduleId)).toEqual([]);
});
```

**Implementation note for this test:** `verify-extraction-coverage.js` is a CLI whose file loop at `:86-92` may not be exported. Preferred shape: extract the loop's file-filtering into a small exported helper (`collectModuleFiles(forMtRoot) → [{moduleId, chDir, path}]`) in the same file, use it in `main`, and test THAT (replace `requireGateInternals()` above with a direct import). This is a mechanical refactor of ~6 lines; behavior-preserving for modules, new skip for `exercises-segments.en.md`. If the file already exposes a testable seam, use it instead — do not create a parallel copy of the filter logic.

- [ ] **Step 2: Implement the gate skip**

In the chapter-file loop (`tools/verify-extraction-coverage.js:88`):

```js
      if (!file.endsWith('-segments.en.md')) continue;
      if (file === 'exercises-segments.en.md') continue; // item 9/D3: JSON-sourced (os-embed), not CNXML extraction — has its own pipeline gates
      const moduleId = file.slice(0, -'-segments.en.md'.length);
```

(plus the exported-helper refactor per the note above). Run the new test — PASS; run `npx vitest run tools/ -t "coverage"` — existing gate suites green.

- [ ] **Step 3: Write the failing server test**

Create `server/__tests__/segmentParserExercises.test.js` (CommonJS or ESM — match the sibling tests in `server/__tests__/`; check one existing file's import style and mirror it):

```js
/**
 * segmentParserExercises.test.js — item 9 (D3): the editorial server's module
 * listing must not surface a phantom module named 'exercises'
 * (exercises-segments.en.md is os-embed pipeline data; editor wiring for it
 * is deliberately out of scope — spec § Out of scope).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Mirror the sibling tests' pattern for pointing segmentParser at a temp
// books dir (BOOKS_DIR env or module config — read a sibling test first).
const { listChapterModules } = require('../services/segmentParser.js');

test('listChapterModules ignores exercises-segments.en.md', () => {
  // Arrange a temp book with one real module + one exercises file in ch01,
  // using the same BOOKS_DIR override mechanism the sibling tests use.
  // Assert: returned moduleIds === ['m00031'] — no 'exercises' phantom.
});
```

**Implementation note:** the test body depends on how sibling server tests inject `BOOKS_DIR` (env var, config module, or constructor). Read one sibling (`server/__tests__/`) FIRST, then write the full arrange/assert with that exact mechanism — the assertion is fixed: module list contains the real module and not `exercises`.

- [ ] **Step 4: Implement the server exclusion**

`server/services/segmentParser.js:478`:

```js
  const files = fs
    .readdirSync(enDir)
    .filter((f) => f.endsWith('-segments.en.md') && f !== 'exercises-segments.en.md'); // item 9/D3: os-embed pipeline data, not an editable module
```

Run: `npx vitest run server/__tests__/segmentParserExercises.test.js` → PASS; then the server project's own suite for the touched file: `npx vitest run server/ -t "segmentParser"` → green.

- [ ] **Step 5: Commit**

```bash
git add tools/verify-extraction-coverage.js tools/__tests__/verify-extraction-coverage-exercises.test.js \
        server/services/segmentParser.js server/__tests__/segmentParserExercises.test.js
git commit -m "feat(item9/D3): scanner guards — 6b gate + server listing skip exercises-segments files

The coverage gate measures CNXML extraction (exercises are JSON-sourced with
their own gates); the editor must not list a phantom 'exercises' module
(editor wiring is out of scope by spec). Both exclusions by exact filename,
each with a test."
```

---

### Task 7: Whole-corpus sweep test, live evidence, register, PR prep

**Files:**
- Create: `tools/__tests__/exercise-html-corpus.test.js`
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item 9 register line)

- [ ] **Step 1: Write the corpus sweep test (proves the closed inventory)**

Create `tools/__tests__/exercise-html-corpus.test.js`:

```js
/**
 * exercise-html-corpus.test.js — item 9 (D3): the closed-inventory proof.
 * Round-trips EVERY translatable field of the live lifraen-efnafraedi
 * exercise cache (5,540 fields / 1,961 exercises at authoring time) through
 * htmlToField/fieldToHtml and requires byte-identity. Skips when the book
 * isn't present (CI clones without books/ content still pass).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToField, fieldToHtml } from '../lib/exercise-html.js';

const EX_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'books', 'lifraen-efnafraedi', '01-source', 'exercises'
);

describe.skipIf(!fs.existsSync(EX_DIR))('exercise-html — live corpus round-trip', () => {
  it('every consumed field round-trips byte-identical', () => {
    const files = fs.readdirSync(EX_DIR).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(1900); // the cache, not a stub
    let fields = 0;
    const failures = [];
    for (const f of files) {
      const d = JSON.parse(fs.readFileSync(path.join(EX_DIR, f), 'utf8'));
      const surfaces = [d.stimulus_html || ''];
      for (const q of d.questions || []) {
        surfaces.push(q.stem_html || '');
        const sol = (q.collaborator_solutions || [])[0];
        if (sol) surfaces.push(sol.content_html || '');
      }
      for (const h of surfaces) {
        if (!h.trim()) continue;
        fields++;
        try {
          const rt = fieldToHtml(htmlToField(h));
          if (rt !== h) failures.push({ f, kind: 'diff', h: h.slice(0, 80) });
        } catch (e) {
          failures.push({ f, kind: e.name, msg: e.message.slice(0, 100) });
        }
      }
    }
    expect(fields).toBeGreaterThan(5000);
    expect(failures).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tools/__tests__/exercise-html-corpus.test.js`
Expected: PASS (0 failures across every field). **If any field fails, STOP and fix the converter in `exercise-html.js` (add the missing shape + a unit test distilled from the failing field) — do not weaken byte-identity to "close enough" and do not allowlist corpus fields.**

- [ ] **Step 3: Live evidence run (uncommitted — evidence for the PR body only)**

```bash
node tools/exercise-extract.js --book lifraen-efnafraedi --verbose 2>&1 | tail -5
# expect: "Extracted 1961 exercises → <N> segments across 22 chapter file(s)", 0 failures
node tools/api-translate.js --book lifraen-efnafraedi --dry-run 2>&1 | tail -15
# capture the exercises-file cost lines — THE dry-run number for the lead's spend decision
git status --porcelain books/ | head   # shows the generated files (expected, untracked)
git clean -n books/lifraen-efnafraedi/02-for-mt books/lifraen-efnafraedi/02-structure  # REVIEW the list: exercises-* files only
git clean -f books/lifraen-efnafraedi/02-for-mt books/lifraen-efnafraedi/02-structure  # then remove
git status --porcelain books/        # MUST be empty
```

Record: exercise/segment counts, any failures (expected 0), and the dry-run ISK figure. **Caution:** `git clean` only after reviewing `-n` output — it must list only `exercises-segments.en.md` / `exercises-skeleton.json` files (everything else under those dirs is tracked and untouched; `git clean` never touches tracked files, the `-n` review is belt-and-braces).

- [ ] **Step 4: Full authoritative gate**

Run from repo root: `npm test`
Expected: entire suite green. Then `git status --porcelain books/` → empty.

- [ ] **Step 5: Update the campaign register**

In `docs/plans/2026-07-11-pre-semester-coding-campaign.md`, edit item 9's line (`:52`) in place, matching the document's shipped-item style: mark the path built (extract → MT hook → assemble → track-aware render with loud fallback), **correct the "biology uses os-embed too" claim** (biology has zero os-embed — verified; D3 gates organic only), note the corpus proof (all 5,540 fields round-trip byte-identical) and the dry-run cost figure from Step 3, and state the remaining op: lead-gated data run (extract → MT ≈ the measured figure → assemble → re-render organic). Commit:

```bash
git add docs/plans/2026-07-11-pre-semester-coding-campaign.md tools/__tests__/exercise-html-corpus.test.js
git commit -m "docs(item9/D3): corpus round-trip proof + campaign register (path built; MT run = lead-gated data op)"
```

- [ ] **Step 6: PR**

Push and open the PR (controller's finishing flow). PR body must carry: the component table (extract/hook/assemble/render/guards), corpus-proof numbers (fields round-tripped, 0 failures), the live-extract evidence (1,961 exercises, N segments, 0 failures), the **dry-run ISK figure**, the biology correction, and the explicit out-of-scope list (MT run, editor wiring, answers[], 01-source). Remember `git fetch origin` before pushing if a `--delete-branch` merge happened earlier in the session.

---

## Self-review (performed at plan-writing time)

- **Spec coverage:** converter + round-trip law ✓ (T1, corpus proof T7); extract with deterministic ids, 18a fold, private-solutions exclusion, malformed-skip ✓ (T2); source-write-guard reader classification ✓ (T2 step 6; assembler needs none — it never references 01-source, by design); api-translate hook with gates/locks riding ✓ (T3); assembler with track sources, fail-loud invariants, inject's residue policy, temp+rename ✓ (T4); track-aware render preference, loud non-gating fallback, summary line ✓ (T5); scanner guards for the 6b gate and server listing ✓ (T6); acceptance items — fixture round-trip through real render (T5 test), live extract evidence + dry-run figure (T7), full suite (T7) ✓. Spec integration checks: (1) scanners → T6 + T3-verify + git-backup verified in plan reference table; (2) guard classification → T2; (3) `.locked` → reference table + T3; (4) fixture verbatim-ness → T2/global constraints; (5) seg-id charset → resolved by adopting the `SEG:module:type:elementId` convention; (6) `18a` → fold documented + tested.
- **Placeholder scan:** two deliberate data-selection blanks remain in T2 (`<PRIVATE_FIXTURE>`/`<chNN>` — filled by the fixture chosen at implementation, criteria given); T6's server-test body names its dependency (sibling BOOKS_DIR mechanism) with the assertion fixed — these are verify-then-write instructions with the decision already made, not open design. No TBDs.
- **Type consistency:** `htmlToField`/`fieldToHtml`/`UnknownTagError`/`MarkerError` (T1) used identically in T2/T4/T7; `extractBook(bookDir, opts)` (T2) reused in T4's tests; seg-id builder in T4 mirrors T2's emission scheme (`stimulus:b{k}`, `{type}:{qid}-b{k}`); sidecar field names in T4 = exactly what T5's `readExercise` parses; `discoverExercisesFile` (T3) name matches its test.
- **Risk notes for the executor:** `parseSegmentsMap` default `duplicates:'first'` is fine here (deterministic ids can't collide within a file — extract emits each id once); `renderCnxmlToHtml` renders the os-embed branch only via the exercise/problem path — the T5 test's DOC wraps the link in `<exercise><problem>` to reach `:1433`; if `safeJoin`'s contract differs from assumed, adjust per its actual signature (`:150-161`).
