# Fix the `<link document="D">text</link>` render leak + a general raw-CNXML-leak guard

**Date:** 2026-07-08 · **Branch:** `fix/chem-cnxml-link-leak` · Roadmap #10 (reframed).

## What this is (and how it got here)

Roadmap #10 was "source↔output link-target parity gate," motivated by "m68692 dead
local link." **Pipeline probing falsified that premise:** m68692's link renders
correctly to `/vidauki/A` (the dropped `document=` is inert; the appendix fallback
resolves the bare `target-id`), and there are **0 genuinely dead local links**
book-wide. A parity gate would find nothing.

The probe surfaced a **different, real, reader-facing bug** instead:
`processInlineContent` (`tools/lib/cnxml-elements.js`) has five `<link>` arms
(self-closing×3, paired-both-attrs, paired-target-only) but **none for paired
document-only** `<link document="D">text</link>`. That shape falls through all
five and **leaks raw CNXML `<link>` markup into published HTML**. Verified against
the *current* renderer (not stale output): **67 occurrences across 19 modules /
12 chapters; 25 live published pages** carry a raw leak (e.g.
`05-publication/mt-preview/chapters/05/5-3-vermi.html`: `<link document="m68865">viðauka G`).

These are the A1-deferred appendix cross-references *actually occurring*. The A1
fix (2026-06-22, `docs/plans/2026-06-22-a1-appendix-crossref-design.md`) resolved
the one dead *target-id* anchor and deferred the general mechanism as YAGNI on the
premise that "zero appendix cross-page links exist" — but that audit counted only
dead target-id anchors and **structurally missed the document-only class** (no
anchor → it leaks instead of dead-anchoring).

## Scope

**Two independent defects; this arc fixes only the first (lead-confirmed 2026-07-08):**

- **Piece 1 (IN SCOPE) — kill the leak.** Add the missing renderer arm so
  `<link document="D">text</link>` renders as processed text (or an `<a>` when the
  `document=` resolves), never raw markup. Mirrors the existing arms' `href:null`
  handling. Small, additive, safe.
- **Piece 2 (OUT OF SCOPE — logged for a lead call) — make appendix `document=`
  links clickable** (resolve to `/{book}/vidauki/{letter}`). This changes
  `resolveCrossModuleHref` for *all* arms' appendix behavior, **revives the
  lead-deferred A1 general mechanism** (whose premise this arc shows was
  incomplete), and depends on an **unverified vefur route** (does
  `/{book}/vidauki/{letter}` prerender for prose appendices B/G?). Reopening a
  lead decision + a cross-repo dependency does not belong in a render-fix arc.
  → roadmap register + `chemistry-clean-slate` memory.

**No `05-publication/` re-render in this PR** (lead-confirmed). The code fix reaches
readers on the lead's already-owed full re-render + Phase-6 sync (which also delivers
F2/F1b/#14). Re-rendering here would be a 12-chapter diff entangled with #14's
un-re-rendered MJX-id churn. The fix is proved in-branch by a **fresh-render** guard,
not by committing re-rendered pages.

## Probe evidence (verified — do not re-derive)

- **m68692 is not dead:** `resolveCrossModuleHref(null,'fs-idm379479808',ctx)` →
  `href:"/efnafraedi-2e/vidauki/A"` (appendix fallback, `cnxml-elements.js:100`).
  `resolveCrossModuleHref('m68859',…)` → `href:null` (the `document=` path skips the
  appendix fallback because `ownerModule` is set). 0 dead local links book-wide.
- **The leak is live:** `processInlineContent('… <link document="m68865">viðauka G</link> …', ctx)`
  returns the string with the raw `<link>` intact. The five arms
  (`cnxml-elements.js:726–787`) have no paired-document-only case.
- **Population:** the regex `/<link\s+document="([^"]*)"\s*>([\s\S]*?)<\/link>/g`
  matches exactly the 67 leaking links (19 modules, chapters ch01/05/07/09/13/14/15/16/17/18/19/21).
- **Guard must be attribute-scoped:** published `<head>` legitimately contains
  `<link rel="stylesheet" href="/styles/content.css">`. The leak signature is
  CNXML-specific (`<link document=` / `<link target-id=`), never bare `<link`.
- **`cnxml-render-fidelity-check.js` is a standalone CLI** (`npm run fidelity:render`),
  NOT in the `npm test` gate — so a committed-output scan there can report the 25
  pre-existing leaks (cleared by the lead's re-render) without turning `npm test` red.

## Design

### 1. Fix — add the missing renderer arm (`tools/lib/cnxml-elements.js`)

In `processInlineContent`, after arm 4 (`<link document="D" target-id="X">text</link>`,
both attrs — must run first) and before arm 5 (target-only), add arm for
**paired document-only**:

```js
// 4b. <link document="D">text</link>  (closing tag, document only — no target-id)
result = result.replace(
  /<link\s+document="([^"]*)"\s*>([\s\S]*?)<\/link>/g,
  (match, doc, inner) => {
    const { href } = resolveCrossModuleHref(doc, null, context);
    const text = inner.trim();
    const label =
      text ||
      context.moduleSections?.[doc]?.titleIs ||
      context.crossModuleSections?.[doc]?.titleIs ||
      doc;
    if (href === null) {
      return text ? processInlineContent(text, context) : escapeHtml(label);
    }
    return `<a href="${escapeAttr(href)}">${text ? processInlineContent(text, context) : escapeHtml(label)}</a>`;
  }
);
```

Rationale: mirrors arm 2 (self-closing document-only `href:null`→escaped label) and
arm 4 (paired text handling). The strict `\s*>` (not `[^>]*>`) matches exactly the
leaking population and cannot swallow a both-attr link (arm 4 already ran; and a
both-attr link has `target-id` before `>`, so `\s*>` fails on it). For an appendix
`document=` (`href:null`) → renders the text (no leak, non-clickable — piece 2
deferred). For a resolvable module `document=` → `<a>`.

### 2. Shared leak-detector helper — `findRawCnxmlLeaks(html) → string[]`

One small pure function **exported from `tools/cnxml-render-fidelity-check.js`**
(co-located with its CLI consumer; the unit test imports it from there) returning
the list of raw-CNXML fragments found in an HTML string. Curated, attribute-scoped patterns for CNXML elements
that must NEVER survive render — chosen to exclude HTML-valid names
(`title`, `table`, head-`link`):

```js
const RAW_CNXML_LEAK_PATTERNS = [
  /<link\s+(?:document|target-id)=/g, // NOT bare <link (head stylesheet is valid)
  /<term[\s>]/g,
  /<emphasis[\s>]/g,
  /<entry[\s/>]/g,
  /<row[\s/>]/g,
  /<colspec[\s/>]/g,
  /<foreign[\s>]/g,
  /<footnote[\s>]/g,
  /<newline\s*\/?>/g,
];
```

This is the general form of the guard the advisor called for: it would have caught
**both** this `<link>` leak and the earlier `<entry>`/`<row>` arc (#2). The list is
a documented allow-by-omission — extend it as new CNXML-only tags are found; it must
never include an HTML-valid tag name.

### 3. Regression guard — unit test (in the `npm test` gate)

New `tools/__tests__/cnxml-render-no-raw-cnxml.test.js`:

- **Fix proof:** `processInlineContent('x <link document="m68865">viðauka G</link> y', ctx)`
  contains no `<link ` and renders the text `viðauka G`.
- **Helper coverage:** `findRawCnxmlLeaks` flags a string containing each curated
  pattern, and returns `[]` for clean HTML *including* a legit
  `<link rel="stylesheet" …>` (proves the head-stylesheet is not a false positive).
- **Real-module fresh render:** render a formerly-leaking module (e.g. m68727)
  fresh via the render helper and assert `findRawCnxmlLeaks(html)` is empty. This
  proves the fix on real content without committing re-rendered pages.

Ships green immediately (post-fix). This is the durable regression guard.

### 4. Shipped-output scan — wire into `cnxml-render-fidelity-check.js` (CLI, not gated)

Add `findRawCnxmlLeaks` to the per-chapter `checkChapter` scan (alongside the
existing C0-control-char / cross-stage checks). Running `npm run fidelity:render`
will then **report the 25 pre-existing leaking pages** as findings — expected until
the lead's re-render, after which it reports 0. Its own unit test (in
`cnxml-render-fidelity-check.test.js`) exercises the function with controlled
leak/clean inputs (green). This is the "catches shipped leaks" layer; it does not
affect `npm test`.

## Verification & sequencing

TDD each: (1) fix arm + its unit assertion; (2) `findRawCnxmlLeaks` helper + tests;
(3) real-module fresh-render assertion; (4) wire into `checkChapter` + its test.
`npm test` from repo ROOT stays green. Confirm the existing
`cnxml-render-fidelity-check.test.js` fixtures don't contain a curated pattern
(they shouldn't — controlled inputs).

## Success criteria

- `processInlineContent` never emits raw `<link document=`/`<link target-id=`;
  the paired-document-only shape renders as processed text (or `<a>` when resolvable).
- `findRawCnxmlLeaks` exists, is attribute-scoped (no head-stylesheet false positive),
  and is covered by tests; wired into `checkChapter`.
- A real formerly-leaking module renders leak-free on a fresh render (asserted).
- `npm test` green from repo root; **zero `05-publication/` changes** in this PR.
- Piece 2 (appendix `document=` resolution) + the 25-pages-clear-on-re-render note
  logged to the roadmap register + memory.
