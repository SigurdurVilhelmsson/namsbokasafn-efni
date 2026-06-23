# Terminology Unicode word-boundary fix (design)

**Date:** 2026-06-23
**Origin:** lead observation during testing — terminology "missing-term"
warnings fire for a term present in the translation when the term's
capitalization differs. Investigation showed the real cause is broader (Unicode
`\b`), not capitalization alone.
**Scope:** `server/services/terminologyService.js`. No schema/route/UI change.
This is **PR A**, sequenced before item O (PR B).

## Problem

`findTermsInSegments` checks whether an approved Icelandic translation appears in
the IS text using `buildInflectionRegex` (`terminologyService.js:1420`):
`new RegExp('\\b(?:' + forms.join('|') + ')\\b', 'gi')`.

JavaScript's `\b` is **ASCII-only**: it treats Icelandic special letters
(`þ æ ö ó á í ú ð`, and their capitals) as non-word characters. So a term whose
form starts or ends with such a letter fails the boundary match — e.g.
`\bþungi\b` matches **neither** `Þungi` **nor** lowercase `þungi`. The result is
a **false "missing-term" warning** even though the translation is present.

Evidence (Node):
- `/\bþungi\b/giu.test('Efnið þungi hér')` → `false` (lowercase, still fails)
- `/\böl\b/gi.test('gott öl hér')` → `false`
- ASCII-initial terms (`mól`, `eind`) work in both cases — which masked the bug
  and made it look capitalization-specific.

The same `\b…\b /gi` pattern is used by the EN-side headword regex
(`:1040`, matched against English/ASCII source — not the bug) and the client EN
highlighter (`segment-editor.js:2103`, English source — not the bug).

## Fix

Replace the ASCII `\b` boundary with **Unicode-aware lookarounds** + the `u`
flag, via one shared helper:

```js
/**
 * Build a case-insensitive, Unicode-aware whole-word regex matching any of the
 * given forms. Uses \p{L}/\p{N} lookarounds instead of \b so Icelandic special
 * letters (þ æ ö ó …) form proper word boundaries. Longest form first to avoid
 * partial matches.
 */
function wholeWordRegex(forms) {
  const alts = forms.filter(Boolean).map(escapeRegex).sort((a, b) => b.length - a.length);
  if (alts.length === 0) return /(?!)/; // never matches
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alts.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
}
```

- **IS-side** (`buildInflectionRegex`, `:1420`) → returns
  `wholeWordRegex([icelandic, ...inflections])`. **This is the bug fix.**
- **EN-side** headword regex (`:1040`) → `regex: wholeWordRegex([row.english])`.
  English is ASCII so behavior is unchanged, but this shares one boundary
  definition (DRY) and is robust to any accented term.
- **Unchanged:** the client EN highlighter (`segment-editor.js:2103`) — it
  matches English terms in English (ASCII) text; not the bug, and excluding it
  keeps this PR server-scoped.

### Correctness notes
- The `u` flag is **mandatory** for `\p{L}`/`\p{N}`. It is safe here:
  `escapeRegex` emits valid `u`-mode patterns and the forms are literal words.
- Boundary integrity verified: `wholeWordRegex(['mól'])` does **not** match
  inside `mólekúl`; it does match `Mól`/`mól` as a standalone word.
- `lastIndex` reset behavior is unchanged (callers already set
  `regex.lastIndex = 0` before `.test()`/`.exec()`; the global flag is retained).

## Testing (Vitest, `server/__tests__/terminologyService.test.js`)

Reuse the existing `_setTestDb` harness + helpers (`insertHeadword`,
`insertTranslation`, `addSubject`).

1. **The bug:** an approved IS term `þungi` (chemistry); IS text contains
   `Þungi` (capitalized, sentence start) → `findTermsInSegments` raises **no**
   missing-term issue. Repeat with lowercase `þungi` present → no issue.
2. **More Icelandic-initial forms:** `öl` present as `Öl`; `ólífa` as `Ólífa` →
   no missing-term issue.
3. **Boundary integrity:** approved term `mól`; IS text contains only
   `mólekúl` (no standalone `mól`) → missing-term issue **is** raised (the term
   is genuinely absent; no false positive from a substring match).
4. **ASCII regression guard:** an ASCII term still matches case-insensitively
   (`sýra`/`Sýra`) → no issue.
5. **Unit on `wholeWordRegex`** (if exported, or via the matching behavior):
   matches Icelandic-initial words case-insensitively; rejects substrings.

## Out of scope (YAGNI)

Fuzzy/stem matching (explicitly deferred); the client EN highlighter; any change
to which terms are in scope (item N's subject filtering is unrelated and stays);
normalization of stored term capitalization.
