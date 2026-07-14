# B4-D11 Term/Footnote Translation Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Málstaður API translate the inner text of id-anchored `[[term:…|id]]` / `[[fn:…|id]]` markers by round-tripping them through the paired `[[term]]…[[/term]]` form on the wire, then re-attaching the id after translation.

**Architecture:** Two new exported pure functions in `tools/api-translate.js` (`stripTermFnToPaired`, `reattachIds`) wired into `translateChunk` around the `client.translateAuto` call. On-disk `02-for-mt`/`02-mt-output` stay in `[[term:text|id]]` form (paired form is transient, wire-only). A per-segment/per-type count-guard degrades a mismatched segment to its original markers, records the mismatch, and forces a non-zero process exit. Extract, inject, and the sidecar are untouched.

**Tech Stack:** Node.js 22 ESM, Vitest. No new dependencies.

## Global Constraints

- Node 22.x LTS / npm 10.x; run `npm test` from the **repo root** (authoritative gate).
- `tools/api-translate.js` uses `export function` for testable helpers; tests import named exports from `../api-translate.js` (see `tools/__tests__/api-translate.test.js`).
- SEG marker format is exactly `<!-- SEG:<id> -->`; segments split on `/(?=<!-- SEG:)/`.
- Vanilla JS ESM, functional style, JSDoc on non-obvious signatures.
- **Out of scope (do NOT touch):** `tools/cnxml-extract.js`, `tools/cnxml-inject.js`, the `-inline-attrs.json` sidecar, and any re-MT / data regeneration. On-disk marker format must remain `[[term:text|id]]`.

## File Structure

- **Modify:** `tools/api-translate.js`
  - Add `stripTermFnToPaired(chunkText)` and `reattachIds(wireOutput, segments)` (exported pure functions) + two small internal scan helpers.
  - Wire both into `translateChunk` (:489) around `client.translateAuto` (primary :496 + retry :511).
  - Thread `mismatches` through `translateModule`'s return and aggregate in `main()` → non-zero exit + summary line.
- **Create:** `tools/__tests__/api-translate-term-roundtrip.test.js` — unit + integration tests for the two functions and the wired `translateChunk` (mocked client).
- **Modify:** `tools/test-malstadur-api.js` — add one opt-in live paired-survival probe case.

---

### Task 1: `stripTermFnToPaired` — rewrite id-anchored markers to paired form

**Files:**
- Modify: `tools/api-translate.js` (add exported function + 2 internal helpers, near the other exported helpers ~:283)
- Test: `tools/__tests__/api-translate-term-roundtrip.test.js` (create)

**Interfaces:**
- Produces: `stripTermFnToPaired(chunkText: string) => { wireText: string, segments: Array<{ segId: string, originalText: string, termIds: (string|null)[], fnIds: (string|null)[] }> }`
  - `wireText`: `chunkText` with every `[[term:text|id]]`→`[[term]]text[[/term]]` and `[[fn:text|id]]`→`[[fn]]text[[/fn]]` (no-id variants `[[term:text]]`→`[[term]]text[[/term]]`, id captured as `null`). Inner nested markers (`[[i:…]]`, `[[sub:…]]`, …) inside `text` are preserved verbatim.
  - `segments`: one record per SEG segment in source order; `termIds`/`fnIds` are the captured ids (or `null`) in source order; `originalText` is the segment's untouched source text (including its SEG marker) for count-guard fallback.

- [ ] **Step 1: Write the failing tests**

Create `tools/__tests__/api-translate-term-roundtrip.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { stripTermFnToPaired, reattachIds } from '../api-translate.js';

const SEG = (id, body) => `<!-- SEG:${id} -->\n${body}\n`;

describe('stripTermFnToPaired', () => {
  it('rewrites an id-anchored term to paired brackets and captures the id', () => {
    const input = SEG('m1:para:a', 'The [[term:viscosity|term-00001]] of a liquid.');
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('[[term]]viscosity[[/term]]');
    expect(wireText).not.toContain('[[term:');
    expect(segments).toHaveLength(1);
    expect(segments[0].segId).toBe('m1:para:a');
    expect(segments[0].termIds).toEqual(['term-00001']);
    expect(segments[0].fnIds).toEqual([]);
    expect(segments[0].originalText).toContain('[[term:viscosity|term-00001]]');
  });

  it('captures a null id for the no-id variant', () => {
    const { segments } = stripTermFnToPaired(SEG('m1:para:b', 'A [[term:mól]] here.'));
    expect(segments[0].termIds).toEqual([null]);
  });

  it('rewrites footnotes and keeps term/fn ids separate', () => {
    const input = SEG('m1:para:c', 'X [[term:t|term-1]] Y [[fn:note|fs-id9]] Z');
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('[[term]]t[[/term]]');
    expect(wireText).toContain('[[fn]]note[[/fn]]');
    expect(segments[0].termIds).toEqual(['term-1']);
    expect(segments[0].fnIds).toEqual(['fs-id9']);
  });

  it('preserves nested inline markers inside the term text', () => {
    const input = SEG('m1:para:d', 'The [[term:activation energy ([[i:E]][[sub:a]])|term-6]] matters.');
    const { wireText, segments } = stripTermFnToPaired(input);
    expect(wireText).toContain('[[term]]activation energy ([[i:E]][[sub:a]])[[/term]]');
    expect(segments[0].termIds).toEqual(['term-6']);
  });

  it('captures ids per-segment in source order across multiple segments', () => {
    const input =
      SEG('m1:para:a', 'A [[term:one|id1]] B') + SEG('m1:para:b', 'C [[term:two|id2]] D [[term:three|id3]] E');
    const { segments } = stripTermFnToPaired(input);
    expect(segments.map((s) => s.segId)).toEqual(['m1:para:a', 'm1:para:b']);
    expect(segments[0].termIds).toEqual(['id1']);
    expect(segments[1].termIds).toEqual(['id2', 'id3']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tools/__tests__/api-translate-term-roundtrip.test.js`
Expected: FAIL — `stripTermFnToPaired is not a function` (and `reattachIds` import also undefined).

- [ ] **Step 3: Implement `stripTermFnToPaired` + helpers**

Add to `tools/api-translate.js` (near the other exported helpers):

```js
// ─── B4-D11: paired-bracket MT round-trip for term/footnote translation ───

/** Split a marker's inner content at the last top-level `|` (id separator),
 *  ignoring `|` nested inside `[[ ]]`. Returns { text, id } (id null if none). */
function splitTopLevelId(inner) {
  let depth = 0;
  let idx = -1;
  for (let i = 0; i < inner.length; i++) {
    if (inner.startsWith('[[', i)) { depth++; i++; }
    else if (inner.startsWith(']]', i)) { if (depth > 0) depth--; i++; }
    else if (inner[i] === '|' && depth === 0) { idx = i; }
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
        if (text.startsWith('[[', j)) { depth++; j += 2; }
        else if (text.startsWith(']]', j)) { depth--; if (depth === 0) break; j += 2; }
        else j++;
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
    if (!m) { wireText += part; continue; } // leading non-SEG text (rare); pass through
    const term = rewriteToPaired(part, 'term');
    const fn = rewriteToPaired(term.text, 'fn');
    segments.push({ segId: m[1], originalText: part, termIds: term.ids, fnIds: fn.ids });
    wireText += fn.text;
  }
  return { wireText, segments };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tools/__tests__/api-translate-term-roundtrip.test.js -t stripTermFnToPaired`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate-term-roundtrip.test.js
git commit -m "feat(api-translate): stripTermFnToPaired — rewrite id-anchored term/fn markers to paired form (B4-D11)"
```

---

### Task 2: `reattachIds` — re-attach ids after MT, with count-guard fallback

**Files:**
- Modify: `tools/api-translate.js` (add exported function + 1 internal helper)
- Test: `tools/__tests__/api-translate-term-roundtrip.test.js` (extend)

**Interfaces:**
- Consumes: `segments` from `stripTermFnToPaired`.
- Produces: `reattachIds(wireOutput: string, segments) => { text: string, mismatches: Array<{ segId:string, type:'term'|'fn', expected:number, got:number }> }`
  - For each output segment (matched to its `segments` record by `segId`), counts surviving `[[term]]…[[/term]]`/`[[fn]]…[[/fn]]`. If a type's count equals the captured id count, re-emits `[[term:TranslatedText|id_k]]` by ordinal (`[[term:TranslatedText]]` when the id was `null`). If it differs, that segment keeps its `originalText` and a mismatch is recorded (per mismatching type).

- [ ] **Step 1: Write the failing tests**

Append to `tools/__tests__/api-translate-term-roundtrip.test.js`:

```js
describe('reattachIds', () => {
  it('re-attaches ids by within-segment ordinal', () => {
    const { segments } = stripTermFnToPaired(SEG('m1:para:a', 'A [[term:one|id1]] B [[term:two|id2]] C'));
    // simulate MT: text between paired brackets translated, delimiters kept
    const wireOut = SEG('m1:para:a', 'Á [[term]]einn[[/term]] B [[term]]tveir[[/term]] C');
    const { text, mismatches } = reattachIds(wireOut, segments);
    expect(text).toContain('[[term:einn|id1]]');
    expect(text).toContain('[[term:tveir|id2]]');
    expect(mismatches).toEqual([]);
  });

  it('emits no-id form when the captured id was null', () => {
    const { segments } = stripTermFnToPaired(SEG('m1:para:b', 'A [[term:mól]] B'));
    const wireOut = SEG('m1:para:b', 'Á [[term]]mól[[/term]] B');
    const { text } = reattachIds(wireOut, segments);
    expect(text).toContain('[[term:mól]]');
    expect(text).not.toContain('[[term:mól|');
  });

  it('re-attaches footnotes independently of terms', () => {
    const { segments } = stripTermFnToPaired(SEG('m1:para:c', 'X [[term:t|term-1]] [[fn:note|fs-9]] Z'));
    const wireOut = SEG('m1:para:c', 'X [[term]]hugtak[[/term]] [[fn]]neðanmáls[[/fn]] Z');
    const { text, mismatches } = reattachIds(wireOut, segments);
    expect(text).toContain('[[term:hugtak|term-1]]');
    expect(text).toContain('[[fn:neðanmáls|fs-9]]');
    expect(mismatches).toEqual([]);
  });

  it('preserves nested markers in the translated term text', () => {
    const { segments } = stripTermFnToPaired(SEG('m1:para:d', 'The [[term:activation energy ([[i:E]][[sub:a]])|term-6]] x'));
    const wireOut = SEG('m1:para:d', 'The [[term]]virkjunarorka ([[i:E]][[sub:a]])[[/term]] x');
    const { text } = reattachIds(wireOut, segments);
    expect(text).toContain('[[term:virkjunarorka ([[i:E]][[sub:a]])|term-6]]');
  });

  it('degrades to original markers + records a mismatch when a paired marker is dropped', () => {
    const { segments } = stripTermFnToPaired(SEG('m1:para:e', 'A [[term:one|id1]] B [[term:two|id2]] C'));
    // simulate a dropped closing/opening: only ONE paired term survives
    const wireOut = SEG('m1:para:e', 'Á [[term]]einn[[/term]] B tveir C');
    const { text, mismatches } = reattachIds(wireOut, segments);
    // segment falls back to ORIGINAL (English, valid markers, correct ids)
    expect(text).toContain('[[term:one|id1]]');
    expect(text).toContain('[[term:two|id2]]');
    expect(mismatches).toEqual([{ segId: 'm1:para:e', type: 'term', expected: 2, got: 1 }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tools/__tests__/api-translate-term-roundtrip.test.js -t reattachIds`
Expected: FAIL — `reattachIds is not a function`.

- [ ] **Step 3: Implement `reattachIds` + helper**

Add to `tools/api-translate.js` (after `stripTermFnToPaired`):

```js
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
 * Re-attach ids to the paired-form MT output, restoring on-disk [[type:text|id]] form.
 * Per-segment/per-type count-guard: if surviving paired markers != captured ids, that
 * segment degrades to its original text and a mismatch is recorded (B4-D11).
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
    if (!rec) { out += part; continue; } // unknown/leading segment → pass through

    const termSpans = collectPaired(part, 'term');
    const fnSpans = collectPaired(part, 'fn');
    const termOk = termSpans.length === rec.termIds.length;
    const fnOk = fnSpans.length === rec.fnIds.length;

    if (!termOk) mismatches.push({ segId: rec.segId, type: 'term', expected: rec.termIds.length, got: termSpans.length });
    if (!fnOk) mismatches.push({ segId: rec.segId, type: 'fn', expected: rec.fnIds.length, got: fnSpans.length });

    if (!termOk || !fnOk) { out += rec.originalText; continue; } // safe degrade

    // Build replacement list (term + fn), splice right-to-left to keep offsets valid.
    const repls = [];
    termSpans.forEach((s, k) => {
      const id = rec.termIds[k];
      repls.push({ start: s.start, end: s.end, text: id === null ? `[[term:${s.inner}]]` : `[[term:${s.inner}|${id}]]` });
    });
    fnSpans.forEach((s, k) => {
      const id = rec.fnIds[k];
      repls.push({ start: s.start, end: s.end, text: id === null ? `[[fn:${s.inner}]]` : `[[fn:${s.inner}|${id}]]` });
    });
    repls.sort((a, b) => b.start - a.start);
    let segOut = part;
    for (const r of repls) segOut = segOut.slice(0, r.start) + r.text + segOut.slice(r.end);
    out += segOut;
  }
  return { text: out, mismatches };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tools/__tests__/api-translate-term-roundtrip.test.js -t reattachIds`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate-term-roundtrip.test.js
git commit -m "feat(api-translate): reattachIds — restore ids post-MT with count-guard fallback (B4-D11)"
```

---

### Task 3: Wire the round-trip into `translateChunk`

**Files:**
- Modify: `tools/api-translate.js` — `translateChunk` (:489)
- Test: `tools/__tests__/api-translate-term-roundtrip.test.js` (extend, with a mock client)

**Interfaces:**
- Consumes: `stripTermFnToPaired`, `reattachIds`.
- Produces: `translateChunk(...)` now returns `{ text, usage, mismatches }`; the API receives paired-form text, the returned `text` is in `[[term:…|id]]` form.

- [ ] **Step 1: Write the failing integration test**

Append to the test file (a fake client whose `translateAuto` echoes input but translates *between* paired markers, mimicking the real API):

```js
describe('translateChunk round-trip (mocked client)', () => {
  // import translateChunk lazily since it is not exported yet in Task 1/2
  it('sends paired form to the API and returns id-anchored translated markers', async () => {
    const { translateChunk } = await import('../api-translate.js');
    const seen = {};
    const fakeClient = {
      async translateAuto(text) {
        seen.text = text;
        // API translates the word between paired brackets, keeps delimiters + SEG
        const out = text.replace('[[term]]viscosity[[/term]]', '[[term]]seigja[[/term]]');
        return { text: out, usage: 1 };
      },
    };
    const chunk = '<!-- SEG:m1:para:a -->\nThe [[term:viscosity|term-00001]] of a liquid.\n';
    const res = await translateChunk(fakeClient, chunk, null, false, 'm1');
    expect(seen.text).toContain('[[term]]viscosity[[/term]]'); // API saw paired form
    expect(seen.text).not.toContain('[[term:');                // id did NOT ride the wire
    expect(res.text).toContain('[[term:seigja|term-00001]]');  // returned id-anchored + translated
    expect(res.mismatches).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tools/__tests__/api-translate-term-roundtrip.test.js -t 'round-trip (mocked'`
Expected: FAIL — `translateChunk` is not exported, or `res.text` still contains `[[term:viscosity|term-00001]]` (untranslated).

- [ ] **Step 3: Wire it in and export `translateChunk`**

In `tools/api-translate.js`, change `async function translateChunk(...)` to `export async function translateChunk(...)` and modify its body. The API must receive the **paired** form on both the primary and retry calls; re-attach immediately after each call, before the existing post-processing:

```js
export async function translateChunk(client, chunkText, glossary, verbose, chunkLabel) {
  const { wireText, segments } = stripTermFnToPaired(chunkText);
  const filteredGlossary = filterGlossaryForText(glossary, chunkText);
  const translateOpts = { targetLanguage: 'is' };
  if (filteredGlossary) {
    translateOpts.glossaries = [filteredGlossary];
  }

  let result = await client.translateAuto(wireText, translateOpts);
  let reattach = reattachIds(result.text, segments);
  let output = reattach.text;
  let mismatches = reattach.mismatches;

  assertNoControlChars(output, chunkLabel);
  output = normalizeUnicode(output);
  output = repairSegTags(chunkText, output);

  if (!validateMarkers(chunkText, output)) {
    if (filteredGlossary) {
      if (verbose) {
        console.error(
          `\n    ${chunkLabel}: truncated with glossary (${filteredGlossary.terms.length} terms), retrying without...`
        );
      }
      result = await client.translateAuto(wireText, { targetLanguage: 'is' });
      reattach = reattachIds(result.text, segments);
      output = reattach.text;
      mismatches = reattach.mismatches;
      assertNoControlChars(output, chunkLabel);
      output = normalizeUnicode(output);
      output = repairSegTags(chunkText, output);
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

  return { text: output, usage: result.usage, mismatches };
}
```

Note: `filterGlossaryForText` and `validateMarkers` keep using `chunkText` (original) — the term *words* are present in both forms, and `validateMarkers` compares SEG counts, which the round-trip does not change.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/api-translate-term-roundtrip.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate-term-roundtrip.test.js
git commit -m "feat(api-translate): round-trip term/fn markers through paired form in translateChunk (B4-D11)"
```

---

### Task 4: Plumb mismatches to a non-zero exit + summary line

**Files:**
- Modify: `tools/api-translate.js` — `translateModule` (:540/:617) and `main()` (:807-:904)
- Test: `tools/__tests__/api-translate-term-roundtrip.test.js` (extend — `translateModule`-level, mocked client, temp dir)

**Interfaces:**
- Consumes: `translateChunk` returning `mismatches`.
- Produces: `translateModule(...)` return value gains `mismatches: Array`; `main()` prints a "Marker id-reattach mismatches: N" line and exits non-zero when any occurred (in addition to the existing `results.failed` gate).

- [ ] **Step 1: Write the failing test**

Append (drives `translateModule`, which is not exported — export it for the test, mirroring `translateChunk`):

```js
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('translateModule surfaces reattach mismatches', () => {
  it('returns mismatches from a chunk whose paired marker was dropped', async () => {
    const { translateModule } = await import('../api-translate.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b4d11-'));
    const inPath = path.join(dir, 'm9-segments.en.md');
    const outPath = path.join(dir, 'm9-segments.is.md');
    fs.writeFileSync(inPath, '<!-- SEG:m9:para:a -->\nA [[term:one|id1]] and [[term:two|id2]].\n');
    const fakeClient = {
      async translateAuto(text) {
        // drop the first closing delimiter → only 1 paired term parses vs 2 ids → count-guard trips
        return { text: text.replace('[[/term]]', ''), usage: 1 };
      },
    };
    const res = await translateModule(fakeClient, inPath, outPath, null, false);
    expect(res.mismatches.length).toBeGreaterThan(0);
    // on-disk output degraded that segment to original (valid markers, correct ids)
    const written = fs.readFileSync(outPath, 'utf8');
    expect(written).toContain('[[term:one|id1]]');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tools/__tests__/api-translate-term-roundtrip.test.js -t 'surfaces reattach'`
Expected: FAIL — `res.mismatches` is undefined (translateModule not exported / doesn't thread mismatches).

- [ ] **Step 3: Thread mismatches through `translateModule` and `main()`**

In `translateModule`: export it, accumulate chunk mismatches, and include them in the return.

```js
export async function translateModule(
  client, inputPath, outputPath, glossary, verbose, maxChunk = DEFAULT_MAX_CHUNK_CHARS
) {
  // ... unchanged up to the chunk loop ...
  let totalUsage = 0;
  const translatedChunks = [];
  const mismatches = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkLabel = needsSplitting ? `chunk ${i + 1}/${chunks.length}` : moduleId;
    // ... unchanged verbose logging ...
    const result = await translateChunk(client, chunks[i], glossary, verbose, chunkLabel);
    translatedChunks.push(result.text);
    totalUsage += result.usage || 0;
    if (result.mismatches && result.mismatches.length) mismatches.push(...result.mismatches);
  }

  // ... unchanged reassembly / normalizeSegMarkers / validateMarkers / write / provenance / links ...

  return { chars: input.length, usage: totalUsage, markersNormalized, mismatches };
}
```

In `main()`'s module loop (~:840), collect mismatches into `results`; initialize `results.mismatches = 0` near the other counters (:807-:818):

```js
    const { chars, markersNormalized, mismatches } = await translateModule(
      client, mod.inputPath, mod.outputPath, glossary, verbose
    );
    // ... existing success handling ...
    if (mismatches && mismatches.length) {
      results.mismatches += mismatches.length;
      for (const mm of mismatches) {
        console.error(
          `  WARNING: id-reattach mismatch in ${mm.segId} (${mm.type}: expected ${mm.expected}, got ${mm.got}) — segment left untranslated (B4-D11 count-guard)`
        );
      }
    }
```

In the summary block (~:864) add one line, and extend the exit gate (:904):

```js
  if (results.mismatches > 0) {
    console.log(`  Marker id-reattach mismatches: ${results.mismatches} (segments degraded to source — see warnings)`);
  }
  // ...
  if (results.failed > 0 || results.mismatches > 0) process.exit(1);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tools/__tests__/api-translate-term-roundtrip.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Run the full suite from repo root**

Run: `npm test`
Expected: PASS (no regressions — the round-trip is invisible to on-disk format, so existing api-translate tests still pass).

- [ ] **Step 6: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate-term-roundtrip.test.js
git commit -m "feat(api-translate): surface id-reattach mismatches as warnings + non-zero exit (B4-D11)"
```

---

### Task 5: Add an opt-in live paired-survival probe case

**Files:**
- Modify: `tools/test-malstadur-api.js` (add to `TEST_CASES`, ~:54)

**Interfaces:**
- Consumes: the existing `TEST_CASES` structure (see T1.14–T1.17 for the shape: `{ id, name, input, checks: [{ name, test }] }`).
- Produces: a new case `T1.18` proving paired `[[term]]…[[/term]]` / `[[fn]]…[[/fn]]` both **translate the inner text** and **survive** — the property T1.14–T1.17 never checked.

- [ ] **Step 1: Add the probe case**

Add to the `TEST_CASES` array in `tools/test-malstadur-api.js` (match the existing object shape exactly; verify against T1.17 which precedes it):

```js
  {
    id: 'T1.18',
    name: 'Paired-bracket term/fn translate inner text AND survive ([[term]]x[[/term]]) — B4-D11',
    input:
      'The [[term]]viscosity[[/term]] of a liquid. Water boils at 100 degrees. [[fn]]At standard pressure.[[/fn]]',
    checks: [
      { name: '[[term]] delimiter survives', test: (input, output) => output.includes('[[term]]') && output.includes('[[/term]]') },
      { name: '[[fn]] delimiter survives', test: (input, output) => output.includes('[[fn]]') && output.includes('[[/fn]]') },
      { name: 'term inner text is translated (not still "viscosity")', test: (input, output) => !/\[\[term\]\]viscosity\[\[\/term\]\]/.test(output) },
    ],
  },
```

- [ ] **Step 2: Verify it parses (dry, no API call)**

Run: `node -e "import('./tools/test-malstadur-api.js')"` — expect no syntax error. (The live run is intentionally NOT part of CI; it costs ~3 ISK and is run manually before the re-MT: `MALSTADUR_API_KEY=… node tools/test-malstadur-api.js --test T1.18 --verbose`.)

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/test-malstadur-api.js
git commit -m "test(malstadur): T1.18 — paired-bracket term/fn translate+survive probe (B4-D11)"
```

---

## Self-Review

**Spec coverage:**
- Two pure functions (`stripTermFnToPaired`, `reattachIds`) → Tasks 1–2. ✅
- Wired into `translateChunk` around primary + retry `translateAuto` → Task 3. ✅
- Nesting-aware, no-id variants, per-segment/per-type id capture → Tasks 1–2 tests. ✅
- Count-guard: degrade to original + record mismatch + non-zero exit → Tasks 2 (fallback+record) & 4 (exit). ✅
- On-disk format unchanged; extract/inject/sidecar untouched → no tasks modify them; Task 3 note confirms `validateMarkers`/`filterGlossaryForText` still use `chunkText`. ✅
- Opt-in live probe (gated out of CI) → Task 5. ✅
- Re-MT out of scope → no task performs it. ✅
- Gate `npm test` from repo root → Tasks 4/5. ✅

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `stripTermFnToPaired` returns `{ wireText, segments }`; `segments[i]` has `{ segId, originalText, termIds, fnIds }`; `reattachIds(wireOutput, segments)` returns `{ text, mismatches }`; `mismatches[i]` is `{ segId, type, expected, got }`; `translateChunk`→`{ text, usage, mismatches }`; `translateModule`→`{ chars, usage, markersNormalized, mismatches }`. Consistent across tasks. ✅
