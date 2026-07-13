# B4 Bracket Markers (term/fn/u/em) + Positional-Restore Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraction emits id-anchored single-token bracket markers `[[term:text|id]]` / `[[fn:text|id]]` / `[[u:text]]` / `[[em:text|class]]`; injection restores them content-anchored (id from the marker, class by sidecar lookup) and hardens the legacy positional restore (count mismatch → warn + attach nothing); every marker consumer learns the new types. Plus the RC4-m68860 extraction fix and the m68863 diagnosis.

**Architecture:** Producer change in `tools/cnxml-extract.js` (`extractInlineText`), consumer change in `tools/cnxml-inject.js` (`reverseInlineMarkup` + helpers), rule additions in 3 synchronized `stripMarkers` copies, 2 leak audits, and 3 editor-pane files. Legacy formats (`{{term}}`, `{{fn}}`, `{=`, `++`) keep parsing forever — all committed MT content in every book uses them. Sidecar `-inline-attrs.json` format is UNCHANGED.

**Tech Stack:** Node 22 ES modules (tools/), CJS (server/services, server/public/js UMD-ish), Vitest.

**Spec:** `docs/plans/2026-07-12-b4-term-fn-bracket-markers-design.md` (approved 2026-07-12). Read it first.

## Global Constraints

- Branch `feat/b4-bracket-markers` (exists, off main at `fd722979`); ONE PR; `npm test` from **repo root** is the authoritative gate (no branch protection).
- **ZERO changes under `books/`** in this PR (code + tests + docs only). The 8-module re-extract/re-MT is a post-merge op (spec §10).
- Marker grammar: text-first pipe `[[type:text|payload]]`; id charset in regexes is exactly `[A-Za-z0-9_.:-]+`; text groups use the `resolveBracketEmphasis` content-exclusion idiom `(?:(?!\[\[|\]\])[\s\S])+` and are GREEDY so the payload anchors on the LAST pipe (MathML in term text can contain `|`).
- `-inline-attrs.json` sidecar: emission and shape unchanged (null-padded occurrence arrays keyed by segment id).
- Backward compat is proof-by-absence: the existing 100 `it()` cases in `tools/__tests__/cnxml-inject.test.js` and all other existing tests pass **unmodified**, EXCEPT the two extraction-emission pins that FLIP (Task 1) — extraction is the producer, its output format is the thing changing.
- Attribute emission order is `class` then `id` (`<term class="…" id="…">`), matching the existing positional-restore order.
- lint-staged runs eslint on commit; if a symbol is introduced for a later task, scope it to the task that uses it instead of leaving unused exports (repo `no-unused-vars` is strict).
- Test commands: single file `npx vitest run <path>` from repo root; full gate `npm test`.

---

### Task 1: Extraction — emit the four new marker types

**Files:**
- Modify: `tools/cnxml-extract.js:301-335` (emphasis effect= / class= / term) and `:394-402` (footnote)
- Test: `tools/__tests__/cnxml-extract.test.js` (two existing pins FLIP at ~:73 and ~:83; new cases added)

**Interfaces:**
- Consumes: `parseAttributes(attrs)` (already imported), `stripTags`, module-level `collectedTermAttrs`/`collectedFootnoteAttrs`/`collectedEmphasisAttrs` (all unchanged).
- Produces: segment text containing `[[term:text|id]]`, `[[term:text]]`, `[[fn:text|id]]`, `[[fn:text]]`, `[[u:text]]`, `[[em:text|class]]`. Sidecar collection behavior byte-identical to today.

- [ ] **Step 1: Flip the two existing emission pins and add the new cases (failing tests)**

In `tools/__tests__/cnxml-extract.test.js`, REPLACE the two tests `'extracts <term> as {{term}}text{{/term}} API-safe markers'` and `'extracts <footnote> as {{fn}}text{{/fn}} API-safe markers'` with:

```js
  it('extracts <term id> as id-anchored [[term:text|id]] markers (B4)', () => {
    const mathMap = new Map();
    const counters = { math: 0, media: 0, segment: 0 };
    const input = 'A <term id="term-00001">molecule</term> is important';
    const result = extractInlineText(input, mathMap, counters);
    expect(result).toContain('[[term:molecule|term-00001]]');
    expect(result).not.toContain('<term');
    expect(result).not.toContain('{{term}}');
  });

  it('extracts attr-less <term> as [[term:text]] (no payload)', () => {
    const mathMap = new Map();
    const counters = { math: 0, media: 0, segment: 0 };
    const result = extractInlineText('A <term>molecule</term> here', mathMap, counters);
    expect(result).toContain('[[term:molecule]]');
  });

  it('extracts <term class+id> as [[term:text|id]] — class stays sidecar-only', () => {
    const mathMap = new Map();
    const counters = { math: 0, media: 0, segment: 0 };
    const input = '<term class="no-emphasis" id="term-00006">water</term>';
    const result = extractInlineText(input, mathMap, counters);
    expect(result).toContain('[[term:water|term-00006]]');
    expect(result).not.toContain('no-emphasis'); // class rides the sidecar, not the marker
  });

  it('keeps nested sub markers inside id-anchored term text', () => {
    const mathMap = new Map();
    const counters = { math: 0, media: 0, segment: 0 };
    const input = '<term id="t1">H<sub>2</sub>O</term>';
    const result = extractInlineText(input, mathMap, counters);
    expect(result).toContain('[[term:H[[sub:2]]O|t1]]');
  });

  it('extracts <footnote id> as [[fn:text|id]] markers (B4)', () => {
    const mathMap = new Map();
    const counters = { math: 0, media: 0, segment: 0 };
    const input = 'Some text<footnote id="fs-idp2355696">A note about this</footnote> here';
    const result = extractInlineText(input, mathMap, counters);
    expect(result).toContain('[[fn:A note about this|fs-idp2355696]]');
    expect(result).not.toContain('<footnote');
    expect(result).not.toContain('{{fn}}');
  });

  it('extracts underline emphasis as [[u:text]] (replaces ++text++)', () => {
    const mathMap = new Map();
    const counters = { math: 0, media: 0, segment: 0 };
    const input = '<emphasis effect="underline">key point</emphasis>';
    const result = extractInlineText(input, mathMap, counters);
    expect(result).toContain('[[u:key point]]');
    expect(result).not.toContain('++');
  });

  it('extracts class-only emphasis as [[em:text|class]] (replaces {=text=}, RC3)', () => {
    const mathMap = new Map();
    const counters = { math: 0, media: 0, segment: 0 };
    const input = '<emphasis class="emphasis-one">R—O—R</emphasis>';
    const result = extractInlineText(input, mathMap, counters);
    expect(result).toContain('[[em:R—O—R|emphasis-one]]');
    expect(result).not.toContain('{=');
  });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run tools/__tests__/cnxml-extract.test.js`
Expected: the 7 new/flipped cases FAIL (output still `{{term}}`/`{{fn}}`/`++`/`{=`); everything else passes.

- [ ] **Step 3: Implement the emission changes**

In `tools/cnxml-extract.js`:

At `:306` (underline arm inside the effect= replace):
```js
      if (effect === 'underline') return `[[u:${inner}]]`;
```

At `:310-320` (class-emphasis replace) — only the return line for the class branch changes:
```js
  // Handle emphasis with class= but no effect= (e.g., <emphasis class="emphasis-one">)
  // B4/RC3: [[em:text|class]] carries the class in the marker (API-survivable);
  // sidecar collection is kept unchanged as the legacy-content fallback.
  text = text.replace(/<emphasis([^>]*)>([\s\S]*?)<\/emphasis>/g, (match, attrs, inner) => {
    const parsedAttrs = parseAttributes(attrs);
    if (parsedAttrs.class) {
      collectedEmphasisAttrs.push({ class: parsedAttrs.class });
      return `[[em:${inner}|${parsedAttrs.class}]]`;
    }
    // No class, no effect — default to italic (common in CNXML for bare emphasis)
    return `[[i:${inner}]]`;
  });
```

At `:324-335` (term replace) — only the return line changes; sidecar collection stays byte-identical:
```js
    const termText = stripTags(inner).trim();
    // B4: id rides IN the marker (text-first pipe, like [[xref:text|id]]) so
    // injection restores ids content-anchored, not positionally. class (always
    // co-occurring with id in the corpus) stays in the sidecar, recovered by id.
    return parsedAttrs.id ? `[[term:${termText}|${parsedAttrs.id}]]` : `[[term:${termText}]]`;
```

At `:394-402` (footnote replace) — only the return line changes (keep the leading space):
```js
    const fnText = stripTags(inner).trim();
    return parsedAttrs.id ? ` [[fn:${fnText}|${parsedAttrs.id}]]` : ` [[fn:${fnText}]]`;
```

- [ ] **Step 4: Run the extract suite**

Run: `npx vitest run tools/__tests__/cnxml-extract.test.js`
Expected: PASS. If other extract tests assert `{{term}}`/`{{fn}}`/`++`/`{=` output textually, flip those assertions too (they are emission pins of the producer — same rationale), and say so in the commit message.

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract.test.js
git commit -m "feat(extract): emit id-anchored [[term:|id]]/[[fn:|id]] + [[u:]]/[[em:|class]] markers (B4)"
```

---

### Task 2: Injection — new-format conversions, hasApiMarkers, skip-positional flag

**Files:**
- Modify: `tools/cnxml-inject.js:1177-1181` (hasApiMarkers), new const beside it, insertion block between `:1465` (legacy `[footnote:]`) and `:1467` (`// Restore inline attributes…`), and the positional-block guard at `:1468`
- Test: `tools/__tests__/cnxml-inject.test.js` (new describe blocks ONLY — existing 100 cases untouched)

**Interfaces:**
- Consumes: `reverseInlineMarkup(text, equations, inlineMedia, inlineTables, inlineAttrs, blockEquationIds, blockMediaIds)` — existing signature (Task 3 adds the 8th `context` param; this task does not).
- Produces: `[[term:text|id]]` → `<term class? id>text</term>` (class via sidecar lookup by id); `[[term:text]]` → `<term>text</term>`; `[[fn:…]]` analogous; `[[u:text]]` → `<emphasis effect="underline">…`; `[[em:text|class]]` → `<emphasis class="…">…`. New const `hasIdAnchoredMarkers` gates the positional block (Task 3 hardens its interior).

- [ ] **Step 1: Write the failing tests**

Append to `tools/__tests__/cnxml-inject.test.js`:

```js
// ─── B4: id-anchored bracket markers ──────────────────────────────

describe('reverseInlineMarkup B4 id-anchored markers', () => {
  const emptyEq = {};

  it('converts [[term:text|id]] to <term id>', () => {
    const result = reverseInlineMarkup('Þetta er [[term:seigja|term-00001]] hugtak', emptyEq);
    expect(result).toContain('<term id="term-00001">seigja</term>');
  });

  it('converts [[term:text]] (no payload) to bare <term>', () => {
    const result = reverseInlineMarkup('Þetta er [[term:seigja]] hugtak', emptyEq);
    expect(result).toContain('<term>seigja</term>');
  });

  it('recovers class from the sidecar BY ID, not by position', () => {
    const inlineAttrs = { terms: [{ class: 'no-emphasis', id: 'term-00006' }] };
    const result = reverseInlineMarkup('[[term:vatn|term-00006]]', emptyEq, [], [], inlineAttrs);
    expect(result).toContain('<term class="no-emphasis" id="term-00006">vatn</term>');
  });

  it('ANTI-CASCADE: a dropped marker does not shift downstream ids', () => {
    // Sidecar has three terms; the middle marker was dropped by the API.
    const inlineAttrs = {
      terms: [{ id: 'term-1' }, { id: 'term-2' }, { id: 'term-3' }],
    };
    const text = '[[term:fyrsta|term-1]] og þriðja [[term:þriðja|term-3]]';
    const result = reverseInlineMarkup(text, emptyEq, [], [], inlineAttrs);
    expect(result).toContain('<term id="term-1">fyrsta</term>');
    expect(result).toContain('<term id="term-3">þriðja</term>'); // NOT term-2
    expect(result).not.toContain('term-2');
  });

  it('warns but keeps the marker-carried id when the sidecar lookup misses', () => {
    const inlineAttrs = { terms: [{ id: 'term-1' }] };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = reverseInlineMarkup('[[term:orð|term-9]]', emptyEq, [], [], inlineAttrs);
    expect(result).toContain('<term id="term-9">orð</term>');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('handles nested resolved markup inside term text', () => {
    const result = reverseInlineMarkup('[[term:H[[sub:2]]O|t1]]', emptyEq);
    expect(result).toContain('<term id="t1">H<sub>2</sub>O</term>');
  });

  it('anchors the id on the LAST pipe (pipe inside text survives)', () => {
    const result = reverseInlineMarkup('[[term:a|b vensl|term-7]]', emptyEq);
    expect(result).toContain('<term id="term-7">a|b vensl</term>');
  });

  it('converts [[fn:text|id]] to <footnote id>', () => {
    const result = reverseInlineMarkup('Texti [[fn:athugasemd|fs-idp123]] hér', emptyEq);
    expect(result).toContain('<footnote id="fs-idp123">athugasemd</footnote>');
  });

  it('converts [[fn:text]] to bare <footnote>', () => {
    const result = reverseInlineMarkup('Texti [[fn:athugasemd]] hér', emptyEq);
    expect(result).toContain('<footnote>athugasemd</footnote>');
  });

  it('footnote text containing a resolved xref converts cleanly', () => {
    const result = reverseInlineMarkup('[[fn:Sjá [[xref:Mynd 5|CNX_Fig]] hér|fs-id1]]', emptyEq);
    expect(result).toContain(
      '<footnote id="fs-id1">Sjá <link target-id="CNX_Fig">Mynd 5</link> hér</footnote>'
    );
  });

  it('converts [[u:text]] to underline emphasis', () => {
    const result = reverseInlineMarkup('[[u:lykilatriði]]', emptyEq);
    expect(result).toContain('<emphasis effect="underline">lykilatriði</emphasis>');
  });

  it('converts [[em:text|class]] with the marker-carried class (RC3)', () => {
    const result = reverseInlineMarkup('[[em:R—O—R|emphasis-one]]', emptyEq);
    expect(result).toContain('<emphasis class="emphasis-one">R—O—R</emphasis>');
  });

  it('new-format segment SKIPS the positional attr block entirely', () => {
    // Sidecar entries exist, but the segment is new-format: the attr-less term
    // must NOT consume a positional slot (no id attached to it).
    const inlineAttrs = { terms: [{ id: 'term-1' }, null] };
    const text = '[[term:fyrsta|term-1]] og [[term:annað]]';
    const result = reverseInlineMarkup(text, emptyEq, [], [], inlineAttrs);
    expect(result).toContain('<term id="term-1">fyrsta</term>');
    expect(result).toContain('<term>annað</term>');
  });

  it('legacy {{term}} segments still use the positional path (unchanged)', () => {
    const inlineAttrs = { terms: [{ id: 'term-1' }] };
    const result = reverseInlineMarkup('{{term}}seigja{{/term}}', emptyEq, [], [], inlineAttrs);
    expect(result).toContain('<term id="term-1">seigja</term>');
  });

  it('hasApiMarkers recognizes the new types (no legacy false positives)', () => {
    // A bracket-era segment containing a literal *asterisk* phrase must not
    // get legacy markdown conversion applied.
    const result = reverseInlineMarkup('[[term:orð|t1]] og *stjarna*', emptyEq);
    expect(result).not.toContain('<emphasis effect="italics">stjarna</emphasis>');
  });

  it('assertNoMarkerResidue hard-fails an unconverted [[term: marker', () => {
    expect(() => assertNoMarkerResidue('<para>[[term:orð|t1]]</para>', 'm99999')).toThrow(
      /Marker residue/
    );
  });
});
```

Add `assertNoMarkerResidue` to the test file's import list from `../cnxml-inject.js` (verified: it is in the export block at the file bottom). Add `vi` to the vitest import if absent.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js`
Expected: the new describe FAILS (markers unconverted / residue in output); the existing 100 cases PASS.

- [ ] **Step 3: Implement**

In `tools/cnxml-inject.js`:

(a) Extend `hasApiMarkers` (`:1180-1181`) and add the skip flag beside it:
```js
  const hasApiMarkers =
    /\{\{[ib]\}\}|\{\{[ib]:|\{\{term\}\}|\{\{fn\}\}|\[\[sub:|\[\[sup:|\[\[i:|\[\[b:|\[\[term:|\[\[fn:|\[\[u:|\[\[em:/.test(
      text
    );

  // B4: id-anchored markers make the positional attr restore unnecessary AND
  // unsafe (an attr-less [[term:text]] must not consume a positional slot).
  // One extraction produced the segment, so formats never mix within it.
  const hasIdAnchoredMarkers = /\[\[(?:term|fn):/.test(text);
```

(b) Insert the conversion block between the legacy `[footnote:]` replace (`:1462-1465`) and the `// Restore inline attributes` comment (`:1467`):
```js
  // ── B4: id-anchored bracket markers (term/fn/u/em) ────────────────
  // Text-first pipe like [[xref:text|id]]; the id (an XML NCName) rides in the
  // marker so restoration is content-anchored — a dropped marker can no longer
  // shift downstream ids. Runs AFTER link conversion + resolveBracketEmphasis,
  // so inner markers in the text field have already resolved to XML and the
  // content-exclusion groups below only ever see [[/]]-free text. GREEDY text
  // + trailing id-charset constraint anchors the split on the LAST pipe
  // (MathML restored into term text may legitimately contain |).
  result = result.replace(
    /\[\[term:((?:(?!\[\[|\]\])[\s\S])+)\|([A-Za-z0-9_.:-]+)\]\]/g,
    (match, inner, id) => {
      const entry =
        inlineAttrs && inlineAttrs.terms
          ? inlineAttrs.terms.find((t) => t && t.id === id)
          : null;
      if (inlineAttrs && inlineAttrs.terms && !entry) {
        // Loud miss: either the API corrupted the id or the sidecar is stale.
        console.warn(
          `  Warning: [[term:…|${id}]] id not found in inline-attrs sidecar — ` +
            `keeping the marker-carried id without class`
        );
      }
      const classAttr = entry && entry.class ? ` class="${entry.class}"` : '';
      return `<term${classAttr} id="${id}">${inner}</term>`;
    }
  );
  result = result.replace(/\[\[term:((?:(?!\[\[|\]\])[\s\S])+)\]\]/g, '<term>$1</term>');

  result = result.replace(
    /\[\[fn:((?:(?!\[\[|\]\])[\s\S])+)\|([A-Za-z0-9_.:-]+)\]\]/g,
    '<footnote id="$2">$1</footnote>'
  );
  result = result.replace(/\[\[fn:((?:(?!\[\[|\]\])[\s\S])+)\]\]/g, '<footnote>$1</footnote>');

  result = result.replace(
    /\[\[u:((?:(?!\[\[|\]\])[\s\S])+)\]\]/g,
    '<emphasis effect="underline">$1</emphasis>'
  );
  result = result.replace(
    /\[\[em:((?:(?!\[\[|\]\])[\s\S])+)\|([^\]|]+)\]\]/g,
    '<emphasis class="$2">$1</emphasis>'
  );
```

(c) Gate the positional block (`:1468`): change `if (inlineAttrs) {` to
```js
  if (inlineAttrs && !hasIdAnchoredMarkers) {
```

- [ ] **Step 4: Run the inject suite**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js`
Expected: PASS (100 existing + new describe).

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject.test.js
git commit -m "feat(inject): content-anchored restore for [[term:|id]]/[[fn:|id]]/[[u:]]/[[em:|class]] (B4)"
```

---

### Task 3: Injection — positional hardening + attr-mismatch report channel

**Files:**
- Modify: `tools/cnxml-inject.js` — `reverseInlineMarkup` signature (`:1166-1174`), emphases block (`:1352-1365`), positional block (`:1468-1497`), `buildCnxml` (`:1656`, its `getSeg` at `:1716-1724`, and its `report` return), `main()` after the residue block (`:3984-3999`)
- Test: `tools/__tests__/cnxml-inject.test.js`

**Interfaces:**
- Consumes: Task 2's `hasIdAnchoredMarkers` gate.
- Produces: `reverseInlineMarkup(..., context = null)` 8th param, `context = { segmentId, attrMismatches }`; mismatch records `{ segmentId, family: 'terms'|'footnotes'|'emphases', expected, found }` pushed to `context.attrMismatches`; `buildCnxml` result gains `report.attrMismatches` (array, possibly empty); `main()` prints a per-module warning summary.

- [ ] **Step 1: Write the failing tests**

Append to the B4 describe block from Task 2 (or a sibling describe):

```js
describe('reverseInlineMarkup positional-restore hardening (legacy path)', () => {
  const emptyEq = {};

  it('HARDENING: marker-count mismatch warns and attaches NOTHING (terms)', () => {
    // Sidecar expects 3 terms; the API dropped one marker → 2 survive.
    // Old behavior: term-1/term-2 attached positionally (third lost, and a
    // NON-last drop would mis-id downstream terms). New: no attrs at all.
    const inlineAttrs = {
      terms: [{ id: 'term-1' }, { id: 'term-2' }, { id: 'term-3' }],
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mismatches = [];
    const result = reverseInlineMarkup(
      '{{term}}eitt{{/term}} og {{term}}tvö{{/term}}',
      emptyEq,
      [],
      [],
      inlineAttrs,
      null,
      null,
      { segmentId: 'm1:para:x', attrMismatches: mismatches }
    );
    expect(result).toContain('<term>eitt</term>');
    expect(result).toContain('<term>tvö</term>');
    expect(result).not.toContain('term-1'); // missing attrs beat wrong attrs
    expect(mismatches).toEqual([
      { segmentId: 'm1:para:x', family: 'terms', expected: 3, found: 2 },
    ]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('matched counts attach exactly as before (zero behavior change)', () => {
    const inlineAttrs = { terms: [{ id: 'term-1' }, { class: 'no-emphasis', id: 'term-2' }] };
    const result = reverseInlineMarkup(
      '{{term}}eitt{{/term}} og {{term}}tvö{{/term}}',
      emptyEq,
      [],
      [],
      inlineAttrs
    );
    expect(result).toContain('<term id="term-1">eitt</term>');
    expect(result).toContain('<term class="no-emphasis" id="term-2">tvö</term>');
  });

  it('HARDENING applies to footnotes', () => {
    const inlineAttrs = { footnotes: [{ id: 'fn-1' }, { id: 'fn-2' }] };
    const mismatches = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = reverseInlineMarkup('{{fn}}ein{{/fn}}', emptyEq, [], [], inlineAttrs, null, null, {
      segmentId: 's',
      attrMismatches: mismatches,
    });
    expect(result).toContain('<footnote>ein</footnote>');
    expect(result).not.toContain('fn-1');
    expect(mismatches[0]).toMatchObject({ family: 'footnotes', expected: 2, found: 1 });
    warnSpy.mockRestore();
  });

  it('HARDENING applies to {= class-emphasis (converts without class on mismatch)', () => {
    const inlineAttrs = { emphases: [{ class: 'emphasis-one' }, { class: 'emphasis-one' }] };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = reverseInlineMarkup('{=eitt=}', emptyEq, [], [], inlineAttrs);
    expect(result).toContain('<emphasis>eitt</emphasis>'); // converted, no class, no residue
    expect(result).not.toContain('emphasis-one');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js`
Expected: hardening cases FAIL (current code attaches positionally / signature lacks `context`).

- [ ] **Step 3: Implement**

(a) Signature (`:1166-1174`) — add the trailing param:
```js
function reverseInlineMarkup(
  text,
  equations,
  inlineMedia = [],
  inlineTables = [],
  inlineAttrs = null,
  blockEquationIds = null,
  blockMediaIds = null,
  context = null
) {
```

(b) A small local helper right after the `hasIdAnchoredMarkers` const:
```js
  // B4 hardening: report a positional count mismatch loudly and let the caller
  // aggregate it. Missing attrs beat silently-wrong attrs.
  const reportAttrMismatch = (family, expected, found) => {
    const segLabel = context && context.segmentId ? ` [${context.segmentId}]` : '';
    console.warn(
      `  Warning: inline-attrs count mismatch${segLabel} — ${family}: sidecar has ${expected}, ` +
        `text has ${found}. Attaching NO ${family} attributes for this segment ` +
        `(a dropped/duplicated marker would mis-assign ids positionally).`
    );
    if (context && Array.isArray(context.attrMismatches)) {
      context.attrMismatches.push({ segmentId: context.segmentId, family, expected, found });
    }
  };
```

(c) Emphases block (`:1352-1365`) becomes:
```js
  // Convert class-only emphasis markers {=text=} back to CNXML.
  // Restore class from sidecar by occurrence index — HARDENED: on a count
  // mismatch, convert without class instead of mis-assigning positionally.
  if (inlineAttrs && inlineAttrs.emphases) {
    const found = (result.match(/\{=(.+?)=\}/g) || []).length;
    const expected = inlineAttrs.emphases.length;
    if (found !== expected) {
      reportAttrMismatch('emphases', expected, found);
      result = result.replace(/\{=(.+?)=\}/g, '<emphasis>$1</emphasis>');
    } else {
      let emphasisIndex = 0;
      result = result.replace(/\{=(.+?)=\}/g, (match, inner) => {
        const attrs = inlineAttrs.emphases[emphasisIndex] || null;
        emphasisIndex++;
        if (attrs && attrs.class) {
          return `<emphasis class="${attrs.class}">${inner}</emphasis>`;
        }
        return `<emphasis>${inner}</emphasis>`;
      });
    }
  } else {
    // No sidecar — convert to plain emphasis
    result = result.replace(/\{=(.+?)=\}/g, '<emphasis>$1</emphasis>');
  }
```

(d) Positional block (`:1468-1497`, already gated by Task 2's flag) — wrap each family's attach in a count check:
```js
  if (inlineAttrs && !hasIdAnchoredMarkers) {
    if (inlineAttrs.terms) {
      const found = (result.match(/<term>/g) || []).length;
      const expected = inlineAttrs.terms.length;
      if (found !== expected) {
        reportAttrMismatch('terms', expected, found);
      } else {
        let termIndex = 0;
        result = result.replace(/<term>/g, () => {
          const attrs = inlineAttrs.terms[termIndex] || null;
          termIndex++;
          if (attrs) {
            const parts = ['<term'];
            if (attrs.class) parts.push(` class="${attrs.class}"`);
            if (attrs.id) parts.push(` id="${attrs.id}"`);
            parts.push('>');
            return parts.join('');
          }
          return '<term>';
        });
      }
    }
    if (inlineAttrs.footnotes) {
      const found = (result.match(/<footnote>/g) || []).length;
      const expected = inlineAttrs.footnotes.length;
      if (found !== expected) {
        reportAttrMismatch('footnotes', expected, found);
      } else {
        let footnoteIndex = 0;
        result = result.replace(/<footnote>/g, () => {
          const attrs = inlineAttrs.footnotes[footnoteIndex] || null;
          footnoteIndex++;
          if (attrs && attrs.id) {
            return `<footnote id="${attrs.id}">`;
          }
          return '<footnote>';
        });
      }
    }
  }
```

(e) Thread the context through `buildCnxml` (verified anchors): the `stats` object initialized around `:1683` (the one holding `residueWarnings: []`) gains `attrMismatches: [],`; the report assembly around `:1909` (`residueWarnings: stats.residueWarnings,`) gains `attrMismatches: stats.attrMismatches,`; the function returns `{ cnxml: output, report }` at `:1944` (unchanged). In `getSeg` (`:1716-1724`) pass the 8th arg:
```js
    return reverseInlineMarkup(
      text,
      equations,
      structure.inlineMedia || [],
      structure.inlineTables || [],
      inlineAttrs[segmentId] || null,
      blockEquationIds,
      blockMediaIds,
      { segmentId, attrMismatches: stats.attrMismatches }
    );
```

(f) Surface in `main()` after the residue warnings (`:3995-3999`):
```js
      if (result.report.attrMismatches && result.report.attrMismatches.length > 0) {
        console.error(
          `  WARNING: ${result.report.attrMismatches.length} inline-attr count mismatch(es) — ` +
            `term/footnote ids NOT attached for those segments (see warnings above)`
        );
      }
```

- [ ] **Step 4: Run the suite**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject.test.js
git commit -m "feat(inject): harden positional attr restore — count mismatch warns and attaches nothing (B4)"
```

---

### Task 4: Inject helpers — stripTermMarkersToText, annotateInlineTerms, restoreTermMarkers

**Files:**
- Modify: `tools/cnxml-inject.js:785-803` (stripTermMarkersToText), `:823-885` (annotateInlineTerms), `:201-292` (restoreTermMarkers)
- Test: `tools/__tests__/cnxml-inject.test.js` (stripTermMarkersToText cases live at ~:1293-1317), `tools/__tests__/pipeline-integration.test.js` (annotateInlineTerms cases at ~:621, restoreTermMarkers at ~:481)

**Interfaces:**
- Consumes: existing exports `stripTermMarkersToText`, `annotateInlineTerms`, `restoreTermMarkers`.
- Produces: same signatures; bracket-format awareness. Annotation emitted INSIDE the text field: `[[term:inner (e. enTerm)|id]]`.

- [ ] **Step 1: Write the failing tests**

In `tools/__tests__/cnxml-inject.test.js` (next to the existing stripTermMarkersToText cases):
```js
  it('stripTermMarkersToText unwraps [[term:|id]]/[[fn:|id]]/[[em:|class]] keeping text', () => {
    expect(stripTermMarkersToText('[[term:Viscosity|term-1]]', {})).toBe('viscosity');
    expect(stripTermMarkersToText('[[fn:A note|fs-1]]', {})).toBe('a note');
    expect(stripTermMarkersToText('[[em:R-O-R|emphasis-one]]', {})).toBe('r-o-r');
    expect(stripTermMarkersToText('[[u:Key]]', {})).toBe('key');
    expect(stripTermMarkersToText('[[term:Plain]]', {})).toBe('plain');
  });

  it('stripTermMarkersToText still drops unknown bracket markers wholesale', () => {
    expect(stripTermMarkersToText('[[MEDIA:1]]x', {})).toBe('x');
  });
```

In `tools/__tests__/pipeline-integration.test.js` (next to the existing annotateInlineTerms tests — mirror their Map-building style):
```js
  it('annotateInlineTerms annotates bracket-format terms inside the text field', () => {
    const isSegments = new Map([['s1', 'Þetta er [[term:seigja|term-1]] hugtak']]);
    const enSegments = new Map([['s1', 'This is a [[term:viscosity|term-1]] concept']]);
    const { annotatedCount } = annotateInlineTerms(isSegments, enSegments);
    expect(annotatedCount).toBe(1);
    expect(isSegments.get('s1')).toContain('[[term:seigja (e. viscosity)|term-1]]');
  });

  it('annotateInlineTerms handles bracket EN + legacy {{term}} IS (mixed dialects)', () => {
    const isSegments = new Map([['s1', 'Þetta er {{term}}seigja{{/term}} hugtak']]);
    const enSegments = new Map([['s1', 'This is a [[term:viscosity|term-1]] concept']]);
    annotateInlineTerms(isSegments, enSegments);
    expect(isSegments.get('s1')).toContain('{{term}}seigja (e. viscosity){{/term}}');
  });

  it('restoreTermMarkers strips glossary __artifacts__ when both sides use bracket terms', () => {
    const isSegments = new Map([['s1', '[[term:seigja|t1]] og __aukaorð__']]);
    const enSegments = new Map([['s1', '[[term:viscosity|t1]] and more']]);
    const { strippedCount } = restoreTermMarkers(isSegments, enSegments);
    expect(strippedCount).toBe(1);
    expect(isSegments.get('s1')).toBe('[[term:seigja|t1]] og aukaorð');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js tools/__tests__/pipeline-integration.test.js`
Expected: new cases FAIL. (`[[term:Viscosity|term-1]]` currently hits the `:793` catch-all → empty string.)

- [ ] **Step 3: Implement**

(a) `stripTermMarkersToText` (`:785-793`) — add two rules BEFORE the catch-all:
```js
    .replace(/\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g, '$1')
    .replace(/\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g, '$1')
    // B4: unwrap id-anchored markers to their display text BEFORE the
    // catch-all below deletes unknown [[type:…]] markers wholesale.
    .replace(/\[\[(?:term|fn|em):([^\]|]*)\|[^\]]*\]\]/g, '$1')
    .replace(/\[\[(?:term|fn|u):([^\]]*)\]\]/g, '$1')
    .replace(/\[\[(?!MATH:)[A-Za-z][\w]*:[^\]]*\]\]/g, ''); // drop MEDIA/other, NOT MATH
```

(b) `annotateInlineTerms` (`:827-830`) — add bracket arms as the LAST alternative of each pattern (group numbering: EN bracket text = group 6; IS bracket text = group 4, IS bracket id = group 5):
```js
  // EN markers: {{term}}text{{/term}}, __term__, **bold**, {{b}}bold{{/b}}, [[term:text|id]]
  const enMarkerPattern =
    /(\{\{term\}\}([\s\S]*?)\{\{\/term\}\}|__([^_]+)__|\*\*(.+?)\*\*|\{\{b\}\}(.+?)\{\{\/b\}\}|\[\[term:((?:(?!\[\[|\]\])[\s\S])+?)(?:\|[A-Za-z0-9_.:-]+)?\]\])/g;
  // IS: new {{term}}, legacy __term__, and B4 bracket [[term:text|id]] formats
  const isTermPattern =
    /(\{\{term\}\}([\s\S]*?)\{\{\/term\}\}|__([^_]+)__|\[\[term:((?:(?!\[\[|\]\])[\s\S])+?)(?:\|([A-Za-z0-9_.:-]+))?\]\])/g;
```
EN extraction loop — add after the `enMatch[3]` branch:
```js
      } else if (enMatch[6] !== undefined) {
        // [[term:text|id]] match — text field only
        enTermTexts.push(enMatch[6]);
      }
```
IS replacement callback — new arity and bracket rebuild:
```js
    const annotated = isText.replace(
      isTermPattern,
      (match, _full, newInner, legacyInner, bracketInner, bracketId) => {
        const inner =
          newInner !== undefined ? newInner : legacyInner !== undefined ? legacyInner : bracketInner;
        if (termIndex >= enTermTexts.length) return match;
        const enTermRaw = enTermTexts[termIndex];
        const enTerm = stripTermMarkersToText(enTermRaw, equations); // trim:false — site A's current behavior (#17)
        termIndex++;
        if (inner.toLowerCase() === enTerm) return match;
        annotatedCount++;
        if (bracketInner !== undefined) {
          // B4: annotation lands INSIDE the text field so the id stays opaque
          return bracketId !== undefined
            ? `[[term:${inner} (e. ${enTerm})|${bracketId}]]`
            : `[[term:${inner} (e. ${enTerm})]]`;
        }
        if (newInner !== undefined) {
          return `{{term}}${inner} (e. ${enTerm}){{/term}}`;
        }
        return `__${inner} (e. ${enTerm})__`;
      }
    );
```
(Keep the surrounding `let termIndex = 0;` and the skip-if-identical comment block as-is.)

(c) `restoreTermMarkers` (`:221-223`) — bracket-aware presence checks:
```js
    const enHasNewTerms = enText.includes('{{term}}') || enText.includes('[[term:');
    if (enHasNewTerms) {
      const isHasNewTerms = isText.includes('{{term}}') || isText.includes('[[term:');
```

- [ ] **Step 4: Run both suites**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js tools/__tests__/pipeline-integration.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject.test.js tools/__tests__/pipeline-integration.test.js
git commit -m "feat(inject): bracket-format awareness in term helpers (strip/annotate/restore) (B4)"
```

---

### Task 5: RC4-m68860 — title-only first para in example survives extraction

**Files:**
- Modify: `tools/cnxml-extract.js:1198-1281` (`processExample` donation + para loop) and the standalone-title fallback `:1219-1231`
- Test: `tools/__tests__/cnxml-extract.test.js`

**Interfaces:**
- Consumes: `processExample`'s existing locals (`paras` from `extractElements`, `exampleStructure`, `addSegment`).
- Produces: unchanged donation for title+body first paras; title-only paras never donate — they survive as `{ type:'para', id, title }` content elements (the exact shape the `:1274` branch already produces for non-first title-only paras, so injection/render handle it today).

**Blast-radius facts (census 2026-07-12, baked in — do not re-derive):** the drop class ("first para-with-leading-title is title-only") = **m68860 (1 occurrence, the ONLY efnafraedi-2e module)** + 287 occurrences across 166 edlisfraedi-2e files (physics' "Strategy/Solution" heading style — the current code donates those headings as example titles; this fix also corrects that, register B4-D4). Only m68860 is re-extracted in this arc; physics segments change only on ITS future re-extract.

- [ ] **Step 1: Write the failing tests**

Create `tools/__tests__/cnxml-extract-example-title.test.js`, following the fixture pattern of `tools/__tests__/cnxml-inject-container-table-order.test.js` (which drives `extractSegments(cnxml)` with an inline `<document>` string — verified precedent):

```js
import { describe, it, expect } from 'vitest';
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

const wrapDoc = (inner) => `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Doc</title>
<content>
<section id="s1"><title>S1</title>
${inner}
</section>
</content>
</document>`;

// Recursively find the example element with the given id in the structure tree.
function findExample(node, id) {
  if (node && node.type === 'example' && node.id === id) return node;
  const children = Array.isArray(node) ? node : (node && node.content) || [];
  if (!Array.isArray(children)) return null;
  for (const child of children) {
    const hit = findExample(child, id);
    if (hit) return hit;
  }
  return null;
}

function roundTrip(cnxml) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(cnxml);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  return buildCnxml(structure, parsed, equations, cnxml, {}, inlineAttrs).cnxml;
}

describe('RC4-m68860: title-only first para inside <example>', () => {
  it('keeps a title-only first para as a para element (not donated, not dropped)', () => {
    const cnxml = wrapDoc(`<example id="ex-1">
<para id="p-1"><title>Graphing the Dependence of y on x</title></para>
<para id="p-2">Body text here.</para>
</example>`);
    const { structure } = extractSegments(cnxml);
    const example = findExample(structure.content, 'ex-1');
    expect(example).toBeTruthy();
    // No example-title was fabricated from the para's title
    expect(example.title).toBeUndefined();
    // The para survives with its title attached
    const para1 = example.content.find((el) => el.id === 'p-1');
    expect(para1).toBeDefined();
    expect(para1.title.text).toContain('Graphing the Dependence');
  });

  it('round-trips the title-only para back into the built CNXML', () => {
    const cnxml = wrapDoc(`<example id="ex-1">
<para id="p-1"><title>Graphing the Dependence of y on x</title></para>
<para id="p-2">Body text here.</para>
</example>`);
    const out = roundTrip(cnxml);
    expect(out).toContain('id="p-1"'); // the para is not dropped from the output
  });

  it('title+body first para keeps the existing donation behavior', () => {
    const cnxml = wrapDoc(`<example id="ex-2">
<para id="p-1"><title>Measuring Heat</title>Some body text.</para>
</example>`);
    const { structure } = extractSegments(cnxml);
    const example = findExample(structure.content, 'ex-2');
    expect(example.title.text).toBe('Measuring Heat');
    const para1 = example.content.find((el) => el.id === 'p-1');
    expect(para1.title).toBeUndefined(); // donated, stripped from the para
  });

  it('does NOT fall back to a para-nested title as the example title', () => {
    // With the only <title> living inside a title-only para, the standalone
    // fallback must not steal it (that would duplicate the heading).
    const cnxml = wrapDoc(`<example id="ex-3">
<para id="p-1"><title>Strategy</title></para>
<para id="p-2">Work through the problem.</para>
</example>`);
    const { structure } = extractSegments(cnxml);
    const example = findExample(structure.content, 'ex-3');
    expect(example.title).toBeUndefined();
  });

  it('a direct <title> child still becomes the example title', () => {
    const cnxml = wrapDoc(`<example id="ex-4">
<title>Real Example Title</title>
<para id="p-1"><title>Strategy</title></para>
<para id="p-2">Body.</para>
</example>`);
    const { structure } = extractSegments(cnxml);
    const example = findExample(structure.content, 'ex-4');
    expect(example.title.text).toBe('Real Example Title');
    const para1 = example.content.find((el) => el.id === 'p-1');
    expect(para1.title.text).toBe('Strategy');
  });
});
```

If the structure tree nests examples differently than `findExample` assumes (e.g. section children under a different key), adapt the walker to the actual JSON — inspect it with `console.dir(structure, { depth: null })` in a scratch run, do not weaken the assertions. **Contingency:** if the round-trip case stays red AFTER the extraction fix (Step 3), the gap is in `buildExample` (inject side) not handling `{ type:'para', id, title }` elements without `segmentId` — that would be a real pre-existing inject gap; extend `buildExample` minimally to emit `<para id><title>…</title></para>` for such elements and note it in the commit message.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/cnxml-extract.test.js`
Expected: case 1 FAILS (para dropped + `example.title` fabricated), case 3 FAILS (fallback steals the para title), cases 2 & 4 PASS (pinning current behavior).

- [ ] **Step 3: Implement (three surgical edits in `processExample`)**

(a) Donation loop (`:1203-1217`) — track the donor para and skip title-only paras:
```js
  let exampleTitleFound = false;
  let donorPara = null;
  for (const para of paras) {
    const titleMatch = para.content.match(/^\s*<title>([\s\S]*?)<\/title>/);
    if (titleMatch && !exampleTitleFound) {
      // RC4-m68860: a title-ONLY para is content (a heading), never a donor —
      // donating it both fabricated an example title and dropped the para.
      const rest = para.content.replace(/^\s*<title>[\s\S]*?<\/title>\s*/, '');
      if (!rest.trim()) continue;
      // This is the example's main title (e.g., "Measuring Heat")
      const titleText = extractInlineText(titleMatch[1], mathMap, counters);
      const titleId = addSegment(
        'example-title',
        titleText,
        example.id ? `${example.id}-title` : null
      );
      exampleStructure.title = { segmentId: titleId, text: titleText };
      exampleTitleFound = true;
      donorPara = para;
    }
  }
```

(b) Standalone-title fallback (`:1219-1231`) — only a title OUTSIDE any para counts:
```js
  if (!exampleTitleFound) {
    // RC4-m68860: strip paras first so a para-nested title can't be stolen
    // as the example title (it stays with its para as a para-title).
    const contentWithoutParas = example.content.replace(/<para[^>]*>[\s\S]*?<\/para>/g, '');
    const standaloneTitle = contentWithoutParas.match(/<title>([\s\S]*?)<\/title>/);
    if (standaloneTitle) {
      const titleText = extractInlineText(standaloneTitle[1], mathMap, counters);
      const titleId = addSegment(
        'example-title',
        titleText,
        example.id ? `${example.id}-title` : null
      );
      exampleStructure.title = { segmentId: titleId, text: titleText };
    }
  }
```

(c) Para loop (`:1236-1255`) — donor identity replaces the boolean:
```js
  for (const para of paras) {
    const titleMatch = para.content.match(/^\s*<title>([\s\S]*?)<\/title>/);
    let paraTitle = null;
    let contentWithoutTitle = para.content;

    if (titleMatch) {
      if (para === donorPara) {
        // This para's title was donated as the example title — strip it
        contentWithoutTitle = para.content.replace(/^\s*<title>[\s\S]*?<\/title>\s*/, '');
      } else {
        // This is a different para with its own title (e.g., "Check Your Learning")
        // Preserve this title in the structure
        const titleText = extractInlineText(titleMatch[1], mathMap, counters).trim();
        const titleSegId = addSegment('para-title', titleText, para.id ? `${para.id}-title` : null);
        paraTitle = { segmentId: titleSegId, text: titleText };
        contentWithoutTitle = para.content.replace(/^\s*<title>[\s\S]*?<\/title>\s*/, '');
      }
    }
```
(Delete the now-unused `firstParaWithTitleProcessed` variable. The rest of the loop — text extraction, `:1264` guard, `:1274` title-only branch — is untouched; the title-only para now reaches `:1274` with a `paraTitle` and survives.)

- [ ] **Step 4: Run the extract suite + the DOM-comparison suite**

Run: `npx vitest run tools/__tests__/cnxml-extract.test.js tools/__tests__/cnxml-dom-comparison.test.js`
Expected: PASS. (`cnxml-dom-comparison` runs real committed modules end-to-end from their COMMITTED structure.json, so it must not regress — this fix only changes FUTURE extraction output.)

- [ ] **Step 5: Append register finding B4-D4 to the design doc**

In `docs/plans/2026-07-12-b4-term-fn-bracket-markers-design.md` § Register, append:
```markdown
- **B4-D4 `[fix]`** the example title-donation logic also mis-donated physics-style
  "Strategy/Solution" para-headings: 287 title-only first paras across 166
  edlisfraedi-2e source files were being donated as example titles and dropped as
  paras. The Task-5 fix corrects this class for every FUTURE extraction; physics
  content heals when edlisfraedi is (re-)extracted, not in this arc.
```

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract.test.js docs/plans/2026-07-12-b4-term-fn-bracket-markers-design.md
git commit -m "fix(extract): title-only first para in example survives; donor tracked by identity (RC4-m68860)"
```

---

### Task 6: Consumer sweep — stripMarkers ×3, leak audits ×2, manifest string, pin tests

**Files:**
- Modify: `tools/generate-tm.js:108-123`, `server/services/qaCheckService.js:27-35`, `server/services/concordanceService.js:45-53`, `tools/audit-render-output.js:147-179`, `tools/validate-chapter.js` (leak block shown at §validate above, ~:716-745), `tools/lib/update-translation-errors.js:166`
- Test: `tools/__tests__/generate-tm.test.js`, `server/__tests__/qaCheckService.test.js`, `server/__tests__/concordanceService.test.js`, `tools/__tests__/residue-check.test.js`, `tools/__tests__/verify-reextract-equivalence.test.js`, plus whichever suite covers `audit-render-output`/`validate-chapter` leak checks (add file-local tests mirroring their existing style if none).

**Interfaces:**
- Consumes: nothing from other tasks (marker grammar only).
- Produces: identical two-rule addition in all three `stripMarkers` copies (they are documented mirrors — add the same lines to each, keeping the mirror comments accurate):
```js
      // B4 id-anchored markers: keep the display text (left of the pipe).
      // Placed AFTER the inline rule so nested [[sub:]] inside term text is
      // already unwrapped when this runs.
      .replace(/\[\[(?:term|fn|em):([^\]|]*)\|[^\]]*\]\]/g, '$1')
      .replace(/\[\[(?:term|fn|u):([^\]]*)\]\]/g, '$1')
```
appended as the LAST two rules of each chain (after the `{{x}}…{{/x}}` rule).

- [ ] **Step 1: Write the failing tests**

`tools/__tests__/generate-tm.test.js` (mirror the existing stripMarkers cases at ~:81-110):
```js
  it('strips B4 id-anchored markers to display text', () => {
    expect(stripMarkers('A [[term:viscosity|term-1]] here')).toBe('A viscosity here');
    expect(stripMarkers('Note [[fn:a comment|fs-1]] end')).toBe('Note a comment end');
    expect(stripMarkers('[[em:R-O-R|emphasis-one]]')).toBe('R-O-R');
    expect(stripMarkers('[[u:key]] and [[term:plain]]')).toBe('key and plain');
    expect(stripMarkers('[[term:H[[sub:2]]O|t1]]')).toBe('H2O'); // nested unwraps first
  });
```
`server/__tests__/qaCheckService.test.js` (`stripMarkers`, `checkNumbers` are exported — verified):
```js
  it('stripMarkers unwraps B4 id-anchored markers to display text', () => {
    expect(stripMarkers('A [[term:viscosity|term-1]] here')).toBe('A viscosity here');
    expect(stripMarkers('[[fn:a note|fs-1]] and [[u:key]] and [[em:x|emphasis-one]]')).toBe(
      'a note and key and x'
    );
  });

  it('id digits do not enter the number-consistency check', () => {
    // fs-idm123456 digits must not count as content numbers on either side.
    const findings = checkNumbers(
      'The [[term:rate|fs-idm123456]] doubles at 25 degrees.',
      'Hraðinn [[term:hraði|fs-idm123456]] tvöfaldast við 25 gráður.'
    );
    expect(findings).toEqual([]);
  });
```
(Adapt the `checkNumbers` call to its actual signature as used by the existing suite — the assertion is that NO mismatch finding is produced.)

`server/__tests__/concordanceService.test.js` (`normalizeEn` is exported — verified):
```js
  it('normalizeEn strips B4 markers to lowercase display text', () => {
    expect(normalizeEn('The [[term:Viscosity|term-1]]')).toBe('the viscosity');
  });
```
`tools/__tests__/residue-check.test.js` — PIN (no code change): `normalizeForComparison('[[term:viscosity|term-1]]')` keeps `viscosity`, drops the id.
`tools/__tests__/verify-reextract-equivalence.test.js` — PIN (no code change): `normalizeVisibleText('{{term}}viscosity{{/term}}') === normalizeVisibleText('[[term:viscosity|term-00001]]')`.
Leak audits — a unit case per tool: HTML containing `[[term:x|t1]]` yields a leak finding of type `INLINE-MARKER`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/generate-tm.test.js server/__tests__/qaCheckService.test.js server/__tests__/concordanceService.test.js tools/__tests__/residue-check.test.js tools/__tests__/verify-reextract-equivalence.test.js`
Expected: stripMarkers/leak cases FAIL; the two PIN cases PASS immediately (they prove no code change is needed there — keep them).

- [ ] **Step 3: Implement**

- Add the two rules to all three `stripMarkers` chains (generate-tm, qaCheckService, concordanceService — identical text, appended last).
- `tools/audit-render-output.js` `checkPlaceholderLeaks` — add before the RAW-REF block:
```js
  // B4 inline markers that should have been consumed at inject
  const inlineMarkerLeaks = html.match(/\[\[(?:term|fn|u|em):[^\]]*\]\]/g) || [];
  for (const leak of inlineMarkerLeaks) {
    leaks.push({ type: 'INLINE-MARKER', value: leak.substring(0, 60) });
  }
```
- `tools/validate-chapter.js` — in the leak block, after the `[[EQ:N]]` check:
```js
        // Check for B4 inline markers ([[term:]], [[fn:]], [[u:]], [[em:]])
        const inlineLeaks = content.match(/\[\[(?:term|fn|u|em):[^\]]*\]\]/g) || [];
        if (inlineLeaks.length > 0) {
          issues.push({
            file,
            message: `${inlineLeaks.length} B4 inline marker(s) ([[term:/fn:/u:/em:]]) in output`,
          });
        }
```
- `tools/lib/update-translation-errors.js:166` — extend the descriptive marker-list string to mention `[[term:]]`/`[[fn:]]` (cosmetic; match the sentence style in place).

- [ ] **Step 4: Run the touched suites**

Run: `npx vitest run tools/__tests__/generate-tm.test.js server/__tests__/qaCheckService.test.js server/__tests__/concordanceService.test.js tools/__tests__/residue-check.test.js tools/__tests__/verify-reextract-equivalence.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/generate-tm.js server/services/qaCheckService.js server/services/concordanceService.js tools/audit-render-output.js tools/validate-chapter.js tools/lib/update-translation-errors.js tools/__tests__ server/__tests__
git commit -m "feat(consumers): B4 marker types in stripMarkers x3, leak audits, manifest string"
```

---

### Task 7: Editor panes — highlight + preview for the new types

**Files:**
- Modify: `server/public/js/marker-highlight.js` (sections 2/2b/3 at `:44-64`), `server/public/js/segment-editor.js` preview renderer (`:1440-1474`), `server/public/js/localization-editor.js` preview (`:1320-1358`), `server/services/segmentParser.js:70-95` (comment only)
- Test: `server/__tests__/markerHighlight.test.js` (+ the segment-editor/localization preview test files if they exist — check `server/__tests__/termHighlight.test.js` and siblings for the pattern)

**Interfaces:**
- Consumes: marker grammar only.
- Produces: `highlightMarkersInPlace` handles the four new types preserving the character-count invariant (`stripTags(highlight(t)) === escapeHtml(t)`); both previews render them.

- [ ] **Step 1: Write the failing tests**

`server/__tests__/markerHighlight.test.js` (mirror existing invariant-style cases):
```js
  it('highlights [[term:text|id]] with delimiter spans, text plain', () => {
    const html = highlightMarkersInPlace('A [[term:seigja|term-1]] here');
    expect(html).toContain('marker-hl-delim');
    expect(stripTags(html)).toBe(escapeHtml('A [[term:seigja|term-1]] here'));
  });

  it('preserves the invariant for [[fn:|id]], [[u:]], [[em:|class]] and no-payload forms', () => {
    for (const t of [
      'x [[fn:nóta|fs-1]] y',
      'x [[u:undir]] y',
      'x [[em:R-O-R|emphasis-one]] y',
      'x [[term:plain]] y',
      'x [[fn:plain]] y',
    ]) {
      expect(stripTags(highlightMarkersInPlace(t))).toBe(escapeHtml(t));
    }
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/__tests__/markerHighlight.test.js`
Expected: FAIL — the delimiters are not wrapped (invariant may hold trivially; assert `marker-hl-delim` presence per type so the test is not vacuous — add a per-type `toContain('marker-hl-delim')` loop variant).

- [ ] **Step 3: Implement**

(a) `marker-highlight.js` — in section 2 (pipe forms), after the docref rule:
```js
    // B4 id-anchored pipe markers — text stays plain, delimiters + payload dimmed.
    html = html.replace(
      /\[\[(term|fn|em):([^|\]]+)\|([^\]]+)\]\]/g,
      (_m, k, t, id) => `${delim('[[' + k + ':')}${t}${delim('|' + id + ']]')}`
    );
```
in section 3 (paired-content), after the sup rule:
```js
    html = html.replace(/\[\[term:(.+?)\]\]/g, (_m, t) => `${delim('[[term:')}${t}${delim(']]')}`);
    html = html.replace(/\[\[fn:(.+?)\]\]/g, (_m, t) => `${delim('[[fn:')}${t}${delim(']]')}`);
    html = html.replace(/\[\[u:(.+?)\]\]/g, (_m, t) => `${delim('[[u:')}${t}${delim(']]')}`);
```
(The section-2 pipe rule runs first, so the section-3 no-payload rules only see payload-less markers — same ordering trick the link family uses.)

(b) `segment-editor.js` preview (`:1462-1474` region) — after the `[[sup:]]` rule:
```js
    // B4 id-anchored markers
    html = html.replace(
      /\[\[term:([^|\]]+)\|([^\]]+)\]\]/g,
      '<span class="preview-term" title="$2">$1</span>'
    );
    html = html.replace(/\[\[term:([^\]]+)\]\]/g, '<span class="preview-term">$1</span>');
    html = html.replace(
      /\[\[fn:([^|\]]+)\|([^\]]+)\]\]/g,
      '<span class="xref-chip" title="Neðanmálsgrein: $2">&#8224;$1</span>'
    );
    html = html.replace(
      /\[\[fn:([^\]]+)\]\]/g,
      '<span class="xref-chip" title="Neðanmálsgrein">&#8224;$1</span>'
    );
    html = html.replace(/\[\[u:([^\]]+)\]\]/g, '<u>$1</u>');
    html = html.replace(/\[\[em:([^|\]]+)\|[^\]]+\]\]/g, '<em>$1</em>');
```

(c) `localization-editor.js` — its preview block runs `:1320-1358` (verified); insert after the `++` rule (`html = html.replace(/\+\+(.+?)\+\+/g, '<u>$1</u>');`), keeping the pane's idiom (`<u>` for underline, the red inline-style span it uses for `{=`):
```js
    // B4 id-anchored markers
    html = html.replace(
      /\[\[term:([^|\]]+)\|[^\]]+\]\]/g,
      '<span class="preview-term">$1</span>'
    );
    html = html.replace(/\[\[term:([^\]]+)\]\]/g, '<span class="preview-term">$1</span>');
    html = html.replace(
      /\[\[fn:([^|\]]+)\|[^\]]+\]\]/g,
      '<span class="xref-chip" title="Neðanmálsgrein">†$1</span>'
    );
    html = html.replace(
      /\[\[fn:([^\]]+)\]\]/g,
      '<span class="xref-chip" title="Neðanmálsgrein">†$1</span>'
    );
    html = html.replace(/\[\[u:([^\]]+)\]\]/g, '<u>$1</u>');
    html = html.replace(
      /\[\[em:([^|\]]+)\|[^\]]+\]\]/g,
      '<span style="color:#d32f2f;font-weight:bold">$1</span>'
    );
```
Note while there: this pane's preview appears to lack arms for the `[[i:]]/[[b:]]/[[sub:]]/[[sup:]]/[[xref:]]` family entirely (only MATH/MEDIA/SPACE/BR + legacy markdown are handled at `:1320-1358`). If a search of the file confirms they are absent, REGISTER it as a follow-up finding (`B4-D6`, loc-pane preview bracket-family gap) — do not widen this task by porting them.

(d) `server/services/segmentParser.js:70-95` (`normalizeTermMarkers`) — add one comment line above the function body noting the B4 consequence (no code change):
```js
// B4 note: bracket-era EN segments ([[term:text|id]]) contain no __term__
// markers, so enTermCount is 0 and this repair is a deliberate no-op for them.
```

- [ ] **Step 4: Run the server pane suites**

Run: `npx vitest run server/__tests__/markerHighlight.test.js server/__tests__/termHighlight.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/public/js/marker-highlight.js server/public/js/segment-editor.js server/public/js/localization-editor.js server/services/segmentParser.js server/__tests__
git commit -m "feat(editor): highlight + preview for B4 [[term:]]/[[fn:]]/[[u:]]/[[em:]] markers"
```

---

### Task 8: Survival-probe T-cases (code only — the paid run is post-merge)

**Files:**
- Modify: `tools/test-malstadur-api.js` (`TEST_CASES` array; existing shape shown at `:60-110`)

**Interfaces:**
- Produces: T-cases `T1.14`–`T1.17` runnable via `node tools/test-malstadur-api.js --test T1.14` (needs `MALSTADUR_API_KEY`; ~30 ISK for all four — lead-authorized 2026-07-12, run before the re-MT per spec §10.1).

- [ ] **Step 1: Add the cases (no unit test — this file IS the test harness; verify by syntax check)**

Append to `TEST_CASES`, mirroring the existing structure:
```js
  {
    id: 'T1.14',
    name: 'Id-anchored term marker survival ([[term:text|id]])',
    input:
      'The [[term:viscosity|term-00001]] of a liquid is a measure of its resistance to flow, unlike the [[term:surface tension|fs-idm12345678]] at the interface.',
    checks: [
      {
        name: 'two [[term: markers survive',
        test: (input, output) => (output.match(/\[\[term:/g) || []).length === 2,
      },
      {
        name: 'id term-00001 byte-intact',
        test: (input, output) => output.includes('|term-00001]]'),
      },
      {
        name: 'id fs-idm12345678 byte-intact',
        test: (input, output) => output.includes('|fs-idm12345678]]'),
      },
      { name: 'no backslash escaping', test: (input, output) => !output.includes('\\[\\[') },
      { name: 'text translated', test: (input, output) => output !== input },
    ],
  },
  {
    id: 'T1.15',
    name: 'Id-anchored footnote marker survival ([[fn:text|id]])',
    input:
      'Water boils at 100 degrees. [[fn:At standard atmospheric pressure of 101.325 kPa.|fs-idp2355696]] This varies with altitude.',
    checks: [
      { name: '[[fn: marker survives', test: (input, output) => output.includes('[[fn:') },
      {
        name: 'id fs-idp2355696 byte-intact',
        test: (input, output) => output.includes('|fs-idp2355696]]'),
      },
      { name: 'no backslash escaping', test: (input, output) => !output.includes('\\[\\[') },
    ],
  },
  {
    id: 'T1.16',
    name: 'Underline + class-emphasis marker survival ([[u:]], [[em:|class]])',
    input:
      'The [[u:most important]] rule is that an ether has the structure [[em:R-O-R|emphasis-one]] in general.',
    checks: [
      { name: '[[u: marker survives', test: (input, output) => output.includes('[[u:') },
      { name: '[[em: marker survives', test: (input, output) => output.includes('[[em:') },
      {
        name: 'class payload byte-intact',
        test: (input, output) => output.includes('|emphasis-one]]'),
      },
    ],
  },
  {
    id: 'T1.17',
    name: 'Nested markup inside id-anchored term ([[term:H[[sub:2]]O|id]])',
    input: 'The formula for [[term:water H[[sub:2]]O|term-00099]] is well known.',
    checks: [
      { name: 'outer [[term: survives', test: (input, output) => output.includes('[[term:') },
      { name: 'inner [[sub: survives', test: (input, output) => output.includes('[[sub:2]]') },
      { name: 'id byte-intact', test: (input, output) => output.includes('|term-00099]]') },
    ],
  },
```

- [ ] **Step 2: Syntax check**

Run: `node --check tools/test-malstadur-api.js`
Expected: no output (clean parse). Do NOT run the tool itself (paid API).

- [ ] **Step 3: Commit**

```bash
git add tools/test-malstadur-api.js
git commit -m "test(probe): T1.14-T1.17 survival cases for B4 id-anchored markers (run post-merge, ~30 ISK)"
```

---

### Task 9: m68863 diagnosis (RC4 second member — table-header dup), timeboxed

**Files:**
- Investigate: `books/efnafraedi-2e/{01-source,02-for-mt,02-mt-output,03-translated}/appendices/m68863*`, `tools/cnxml-inject.js` table path (`buildTable`, `:1956-2013` per register C4)
- Possibly modify: `tools/cnxml-inject.js` + `tools/__tests__/cnxml-inject.test.js` (outcome A) or docs only (outcome B)

**Protocol (systematic-debugging, timebox ~45 min of investigation before choosing an outcome):**

- [ ] **Step 1: Reproduce.** Compare the table-header region of `books/efnafraedi-2e/01-source/appendices/m68863.cnxml` against `books/efnafraedi-2e/03-translated/mt-preview/appendices/m68863.cnxml` (committed output — do NOT re-run inject against `books/` in a way that leaves changes; if a fresh inject is needed, run it and `git checkout -- books/` afterward, verifying `git status --porcelain` is clean). Locate the duplicated header row/column the register describes ("m68863 extra table column").
- [ ] **Step 2: Classify the stage.** Check whether the duplication already exists in `02-mt-output/appendices/m68863-segments.is.md` (MT-stage: duplicated segment text) or only appears in `03-translated` (inject-stage: `buildTable`/container splice defect). Grep the source table's header cells in both.
- [ ] **Step 3: Decide by the rule from the spec §7:**
  - **Outcome A (inject-stage):** write a failing unit test in `tools/__tests__/cnxml-inject.test.js` reproducing the duplication with a minimal table fixture, fix the inject path, run the inject + dom-comparison suites, commit as `fix(inject): m68863 table-header duplication (RC4)`. m68863 heals on re-inject — remove it from the re-MT candidate note.
  - **Outcome B (extraction/MT-stage):** no code change; append the finding + evidence to the design doc § Register as `B4-D5` and note “m68863 requires re-MT — bring the +78 ISK ask with the post-merge op”. Commit the doc change.
- [ ] **Step 4: Either way, record the mechanism** (one paragraph, file:line) in the design doc § Register so the post-merge op knows what to verify on m68863.

---

### Task 10: Docs + full-suite gate

**Files:**
- Modify: `CLAUDE.md` (Inline Marker Format table), `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item 5 entry), `docs/plans/2026-07-12-b4-term-fn-bracket-markers-design.md` (§ Delivery outcome stub if any deviations occurred)

- [ ] **Step 1: Update the CLAUDE.md marker table.** In "Inline Marker Format (Bracket Pattern)", add rows for `[[term:text|id]]` / `[[fn:text|id]]` / `[[u:text]]` / `[[em:text|class]]` (CNXML element + example each), move `{{term}}`/`{{fn}}` to the legacy note, and replace the `++text++` row's "No API-safe bracket variant yet" with the `[[u:]]` row. Update the "Key insight" line if it names term/fn as the lossy class.

- [ ] **Step 2: Update the campaign doc.** Mark item 5 with the delivery summary (same style as items 1–4b): scope shipped, suite count, register finds B4-D1..D4 (+D5 if Task 9 outcome B), and the post-merge op pointer (spec §10: probe → re-extract 8 → re-MT ≈2,284 ISK → re-inject → re-render → goldens).

- [ ] **Step 3: Full gate**

Run: `npm test` (repo root)
Expected: all green. Investigate ANY failure — goldens and dom-comparison suites run real committed modules and must be untouched by this PR (zero `books/` diffs: verify with `git status --porcelain books/` → empty).

- [ ] **Step 4: Commit + PR**

```bash
git add CLAUDE.md docs/plans/2026-07-11-pre-semester-coding-campaign.md docs/plans/2026-07-12-b4-term-fn-bracket-markers-design.md
git commit -m "docs: B4 marker table + campaign item-5 delivery entry"
```
Then push and open the PR per the repo's commit-push-pr flow (PR body: spec + plan links, acceptance table from spec §8, explicit "zero books/ changes; re-MT is a post-merge lead-gated op").

---

## Post-merge op (NOT part of this PR — spec §10, lead-gated, own branch)

Probe run (~30 ISK, `MALSTADUR_API_KEY`, T1.14–T1.17 must pass ≈100%) → re-extract the 8 modules (m68764/770 ch10, m68789/791/793 ch12, m68829 ch18, m68847 ch20, m68860 appendices; verify `--chapter N --module mX` sectionOrder behavior first — the STALE-STRUCT lesson) → re-MT ≈2,284 ISK (none locked) → re-inject → re-render → regen goldens m68789/m68791 → gates (order/F8 recheck) → data PR. Clean up the ch12 stray `(b)`/`(c)` segment files (B4-D3) during the re-extract.

## Self-review notes (already applied)

- Spec §5.1 asked for conversion "after the second resolveBracketEmphasis pass" — Tasks 2/3 place it after the legacy `[footnote:]` handler (`:1465`), which is after `:1417` and additionally after legacy links/sub-sup, immediately before the positional block it must gate. This is the same ordering intent, one insertion point instead of two.
- The `[[em:` class group uses `([^\]|]+)` (not the id charset) because class values are freer strings; class is the last field so no ambiguity.
- `annotateInlineTerms` group indices: EN bracket text = 6 (after the 5 existing groups); IS groups renumber to (2 mustache, 3 legacy, 4 bracket-text, 5 bracket-id) — the IS pattern gains its arms in one edit so the callback arity is changed once.
