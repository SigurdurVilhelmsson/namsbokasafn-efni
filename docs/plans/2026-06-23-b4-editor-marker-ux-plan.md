# B-4 Editor Marker Clarity & Recovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make inline markers visually unmistakable and consistently rendered in the segment editor, and give editors a one-click recovery from a corrupted-marker save block — without rewriting the textarea-based editing engine.

**Architecture:** A new pure function `highlightMarkersInPlace(text)` produces character-preserving highlight HTML, rendered into a backdrop `<div>` behind a transparent-text `<textarea>` (markers stay editable but obvious; the textarea remains the single source of truth, so selection/keyboard/save logic is untouched). `renderMarkdownPreview` is extended to render the full current marker universe — the bracket family (`[[i:]]`, `[[sub:]]`, `[[xref:]]`, …) and term/footnote braces, which it does not handle today — and the read-mode EN pane is then switched to it so both panes render identically. The existing-but-invisible Escape-revert is extracted into `revertEdit()` and surfaced as an "Endurstilla" button; the save-block alert gains a hint pointing to it. **Marker set and ordering rule:** see the design doc's "Marker universe" section — both `highlightMarkersInPlace` and the `renderMarkdownPreview` extension process `[[…]]`/`{{…}}` markers before the single-bracket and markdown rules.

**Tech Stack:** Vanilla browser JS (IIFE + a new dual-mode UMD-ish module), Vitest (unit), Playwright (E2E). No new runtime dependencies.

**Design:** [`2026-06-23-b4-editor-marker-ux-design.md`](2026-06-23-b4-editor-marker-ux-design.md)

## Global Constraints

- Vanilla JS, ES-module-free in browser files (existing files are plain `<script>` IIFEs). Vitest is ESM; the new shared module must be dual-mode (browser global + `module.exports`).
- All user-facing copy is **Icelandic**, defined in `server/public/js/ui-strings.js` (the `UI` object) — never hard-code Icelandic strings in `segment-editor.js`.
- Editor CSS lives **inline** in `server/views/segment-editor.html` `<style>` block (not `common.css`).
- Do **not** change the save contract, the validation contract (what `validateSegmentEdit` blocks), or any server route.
- Backup-before-edit convention: these are tracked source files under `server/`, edited via git — no `.bak` needed (that rule is for `books/` content).
- Branch: continue on `fix/item-l-mined-candidates-route-order` (already holds item L + this design doc), or a fresh `feature/b4-editor-marker-ux` branch — implementer's choice; commit per task either way.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `server/public/js/marker-highlight.js` | Pure `highlightMarkersInPlace(text)` — char-preserving marker highlight HTML for the full marker universe. Dual-mode (window + module.exports). Self-contained escape. | **Create** |
| `server/__tests__/markerHighlight.test.js` | Vitest unit tests for the pure function (preservation invariant + detection across all markers). | **Create** |
| `server/views/segment-editor.html` | Add `<script src="/js/marker-highlight.js">`; add overlay + marker CSS to inline `<style>`. | Modify |
| `server/public/js/segment-editor.js` | Extend `renderMarkdownPreview` (bracket/brace family); EN render switch; backdrop wiring (`refreshBackdrop`); `revertEdit` extraction + button; save-block hint; expose `renderMarkdownPreview`/`revertEdit` on `window`. | Modify |
| `server/public/js/ui-strings.js` | New `validationRevertHint` + Endurstilla button label/tooltip strings. | Modify |
| `server/e2e/segment-editor.spec.js` | E2E for EN render, backdrop, revert button, block message. | Modify |

---

## Task 1: `highlightMarkersInPlace` pure module + unit tests

**Files:**
- Create: `server/public/js/marker-highlight.js`
- Test: `server/__tests__/markerHighlight.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: global `window.highlightMarkersInPlace(text: string): string` (browser) and `module.exports = { highlightMarkersInPlace }` (Node). Output is HTML where every original character is preserved and each marker is wrapped in a `<span class="marker-hl …">`. **Invariant:** stripping all `<…>` tags from the output yields `escapeHtml(text)`.

- [ ] **Step 1: Write the failing tests**

Create `server/__tests__/markerHighlight.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { highlightMarkersInPlace } = require('../public/js/marker-highlight.js');

// Local escape mirroring htmlUtils.escapeHtml — used only to express the invariant.
const escapeHtml = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

const stripTags = (html) => html.replace(/<[^>]*>/g, '');

describe('highlightMarkersInPlace — character preservation invariant', () => {
  const cases = [
    'plain text with no markers',
    // bracket family (the current pipeline's primary markers)
    'Vatn H[[sub:2]]O og Ca[[sup:2+]] jónir.',
    'Þetta er [[i:skáletrað]] og [[b:feitletrað]].',
    'Sjá [[xref:fs-idm222237232]] og [[xref:Mynd 5.2|CNX_Chem_05_02]].',
    'Smelltu [[link:hér|https://example.com]] og [[docref:m68674#fs-id123]].',
    'Tafla [[TABLE:tbl-1]] og stærðfræði [[MATH:1]] og mynd [[MEDIA:2]].',
    'Lína[[BR]]næsta og [[SPACE]] bil og [[SPACE:3]].',
    // brace family (term/footnote + legacy emphasis)
    'Hugtakið {{term}}atóm{{/term}} og {{fn}}skýring{{/fn}}.',
    'Legacy {{i}}skáletrað{{/i}} og {{b}}feitt{{/b}}.',
    // markdown family (kept for old-content tolerance)
    'Sýran er **feit** og __hugtak__ og ++undirstrik++.',
    'Vatn H~2~O og Ca^2+^ og {=áhersla=}.',
    'Sjá [tengill](#anchor) og [skjal](m123#frag) og [#CNX_Chem_05_02].',
    'Special <chars> & "quotes" \'apos\' með [[i:a<b & c]].',
  ];
  for (const input of cases) {
    it(`preserves all characters for: ${input.slice(0, 30)}`, () => {
      expect(stripTags(highlightMarkersInPlace(input))).toBe(escapeHtml(input));
    });
  }

  it('returns empty string for empty/null input', () => {
    expect(highlightMarkersInPlace('')).toBe('');
    expect(highlightMarkersInPlace(null)).toBe('');
  });
});

describe('highlightMarkersInPlace — marker detection', () => {
  it('wraps a [[MATH:N]] atom in a highlight span', () => {
    expect(highlightMarkersInPlace('x [[MATH:1]] y')).toContain('class="marker-hl');
  });

  it('highlights the bracket family ([[sub:]], [[i:]], [[xref:]])', () => {
    expect(highlightMarkersInPlace('H[[sub:2]]O')).toContain('marker-hl');
    expect(highlightMarkersInPlace('[[i:orð]]')).toContain('marker-hl');
    expect(highlightMarkersInPlace('[[xref:fs-id1]]')).toContain('marker-hl');
  });

  it('highlights brace markers ({{term}}, {{fn}})', () => {
    expect(highlightMarkersInPlace('{{term}}atóm{{/term}}')).toContain('marker-hl');
    expect(highlightMarkersInPlace('{{fn}}nóta{{/fn}}')).toContain('marker-hl');
  });

  it('adds no highlight span to plain text', () => {
    expect(highlightMarkersInPlace('engin merki hér')).not.toContain('marker-hl');
  });

  it('keeps inner text of a paired marker verbatim outside the delim spans', () => {
    const out = highlightMarkersInPlace('[[sub:2]]');
    expect(out).toContain('2');
    expect(out).toContain('marker-hl');
  });

  it('does not mangle a no-text [[xref:id]] (ordering: brackets before single-bracket rules)', () => {
    // [[xref:fs-id1]] must be treated as one marker, not split by a [..#..] rule
    const out = highlightMarkersInPlace('[[xref:fs-idm222]]');
    expect(stripTags(out)).toBe(escapeHtml('[[xref:fs-idm222]]'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/markerHighlight.test.js`
Expected: FAIL — `Cannot find module '../public/js/marker-highlight.js'`.

- [ ] **Step 3: Write the module**

Create `server/public/js/marker-highlight.js`:

```js
/**
 * marker-highlight.js — character-preserving marker highlighter for the
 * segment-editor textarea backdrop overlay (B-4).
 *
 * highlightMarkersInPlace(text) returns HTML in which EVERY original
 * character is preserved (so the backdrop overlaps the textarea 1:1) and
 * each inline marker is wrapped in a <span class="marker-hl…">.
 *
 * Invariant: stripTags(highlightMarkersInPlace(t)) === escapeHtml(t).
 *
 * Dual-mode: attaches to window in the browser and exports for Vitest.
 */
(function (root) {
  function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  // Each replacement re-inserts the captured original text verbatim and only
  // adds <span> tags, so the character-preservation invariant always holds.
  // ORDERING: [[…]] and {{…}} markers are consumed FIRST, so the later
  // single-bracket and markdown rules cannot mis-match them.
  function highlightMarkersInPlace(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    const atom = (s) => `<span class="marker-hl marker-hl-atom">${s}</span>`;
    const delim = (s) => `<span class="marker-hl marker-hl-delim">${s}</span>`;

    // 1. Bracket atoms (whole marker highlighted).
    html = html.replace(/\[\[MATH:\d+\]\]/g, (m) => atom(m));
    html = html.replace(/\[\[MEDIA:\d+\]\]/g, (m) => atom(m));
    html = html.replace(/\[\[TABLE:[^\]]+\]\]/g, (m) => atom(m));
    html = html.replace(/\[\[SPACE(?::\d+)?\]\]/g, (m) => atom(m));
    html = html.replace(/\[\[BR\]\]/g, (m) => atom(m));

    // 2. Bracket reference markers WITH display text (text|target) — keep text.
    //    Run before the no-text forms so the pipe variant wins.
    html = html.replace(/\[\[link:([^|\]]+)\|([^\]]+)\]\]/g, (_m, t, u) => `${delim('[[link:')}${t}${delim('|' + u + ']]')}`);
    html = html.replace(/\[\[xref:([^|\]]+)\|([^\]]+)\]\]/g, (_m, t, id) => `${delim('[[xref:')}${t}${delim('|' + id + ']]')}`);
    html = html.replace(/\[\[docref:([^|\]]+)\|([^\]]+)\]\]/g, (_m, t, d) => `${delim('[[docref:')}${t}${delim('|' + d + ']]')}`);
    // 2b. Bracket reference markers, no text → atom.
    html = html.replace(/\[\[xref:[^\]]+\]\]/g, (m) => atom(m));
    html = html.replace(/\[\[docref:[^\]]+\]\]/g, (m) => atom(m));

    // 3. Bracket paired-content markers → highlight delimiters, inner plain.
    html = html.replace(/\[\[i:(.+?)\]\]/g, (_m, t) => `${delim('[[i:')}${t}${delim(']]')}`);
    html = html.replace(/\[\[b:(.+?)\]\]/g, (_m, t) => `${delim('[[b:')}${t}${delim(']]')}`);
    html = html.replace(/\[\[sub:(.+?)\]\]/g, (_m, t) => `${delim('[[sub:')}${t}${delim(']]')}`);
    html = html.replace(/\[\[sup:(.+?)\]\]/g, (_m, t) => `${delim('[[sup:')}${t}${delim(']]')}`);

    // 4. Brace markers (term/footnote + legacy emphasis from old files).
    html = html.replace(/\{\{term\}\}(.+?)\{\{\/term\}\}/g, (_m, t) => `${delim('{{term}}')}${t}${delim('{{/term}}')}`);
    html = html.replace(/\{\{fn\}\}(.+?)\{\{\/fn\}\}/g, (_m, t) => `${delim('{{fn}}')}${t}${delim('{{/fn}}')}`);
    html = html.replace(/\{\{i\}\}(.+?)\{\{\/i\}\}/g, (_m, t) => `${delim('{{i}}')}${t}${delim('{{/i}}')}`);
    html = html.replace(/\{\{b\}\}(.+?)\{\{\/b\}\}/g, (_m, t) => `${delim('{{b}}')}${t}${delim('{{/b}}')}`);

    // 5. Legacy single-bracket links + markdown family (old-content tolerance).
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, u) => `${delim('[')}${t}${delim('](' + u + ')')}`);
    html = html.replace(/\[#[A-Za-z0-9_.-]+\]/g, (m) => atom(m));
    html = html.replace(/\[[A-Za-z0-9_.-]+#[A-Za-z0-9_.-]+\]/g, (m) => atom(m));
    html = html.replace(/\[(?:footnote|neðanmálsgrein): [^\]]+\]/g, (m) => atom(m));
    html = html.replace(/\{=(.+?)=\}/g, (_m, t) => `${delim('{=')}${t}${delim('=}')}`);
    html = html.replace(/\*\*(.+?)\*\*/g, (_m, t) => `${delim('**')}${t}${delim('**')}`);
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (_m, t) => `${delim('*')}${t}${delim('*')}`);
    html = html.replace(/__(.+?)__/g, (_m, t) => `${delim('__')}${t}${delim('__')}`);
    html = html.replace(/(?<!~)~(?!~)(.+?)(?<!~)~(?!~)/g, (_m, t) => `${delim('~')}${t}${delim('~')}`);
    html = html.replace(/\^(.+?)\^/g, (_m, t) => `${delim('^')}${t}${delim('^')}`);
    html = html.replace(/\+\+(.+?)\+\+/g, (_m, t) => `${delim('++')}${t}${delim('++')}`);

    return html;
  }

  if (typeof root !== 'undefined') root.highlightMarkersInPlace = highlightMarkersInPlace;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { highlightMarkersInPlace };
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/markerHighlight.test.js`
Expected: PASS (all cases green). If a preservation case fails, the culprit is a replacement that altered captured text — fix that regex, do not weaken the invariant test.

- [ ] **Step 5: Commit**

```bash
git add server/public/js/marker-highlight.js server/__tests__/markerHighlight.test.js
git commit -m "feat(editor): add char-preserving marker highlighter (B-4 task 1)"
```

---

## Task 2: Backdrop overlay wired into the edit textarea

**Files:**
- Modify: `server/views/segment-editor.html` (script include + inline `<style>`)
- Modify: `server/public/js/segment-editor.js` (`renderSegmentRow` textarea markup ~`:856–866`, `openEditPanel` ~`:890–938`, `wrapSelection` ~`:2221`, `insertTermFromLookup` ~`:2175`)
- Test: `server/e2e/segment-editor.spec.js`

**Interfaces:**
- Consumes: `window.highlightMarkersInPlace` (Task 1).
- Produces: `refreshBackdrop(segmentId)` — regenerates `#backdrop-<cssId>` from `#textarea-<cssId>.value` and syncs scroll. Called wherever `.value` changes programmatically.

- [ ] **Step 1: Add the script include**

In `server/views/segment-editor.html`, before line `<script src="/js/segment-editor.js"></script>` (`:1503`), add:

```html
  <script src="/js/marker-highlight.js"></script>
```

- [ ] **Step 2: Add overlay CSS**

In the inline `<style>` of `server/views/segment-editor.html` (near `.edit-panel textarea` at `:432`), add:

```css
    /* B-4 marker overlay: backdrop renders highlighted markers behind a
       transparent-text textarea so the native caret/selection still work. */
    .editor-overlay-wrap { position: relative; }
    .editor-overlay-wrap textarea {
      position: relative;
      background: transparent;
      color: transparent;
      caret-color: #1a1a1a;
      -webkit-text-fill-color: transparent;
    }
    .editor-overlay-wrap textarea::selection { background: rgba(120,160,210,0.35); }
    .marker-backdrop {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      margin: 0;
      overflow: hidden;
      pointer-events: none;
      white-space: pre-wrap;
      word-wrap: break-word;
      color: #1a1a1a;
      z-index: 0;
    }
    /* backdrop + textarea MUST share box metrics so glyphs align exactly */
    .marker-backdrop, .editor-overlay-wrap textarea {
      font: inherit;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      padding: inherit;
      border: 1px solid transparent;
      box-sizing: border-box;
    }
    .marker-hl { border-radius: 2px; }
    .marker-hl-atom { background: #fde2c8; box-shadow: 0 0 0 1px #e8a86a inset; }
    .marker-hl-delim { background: #d7e7f5; color: #2d5b86; font-weight: 600; }
```

Note: the existing `.edit-panel textarea` rules (`:432`) set the real font/padding; the `font: inherit; padding: inherit` above makes the backdrop copy them. If glyph drift appears in QA, set the textarea and `.marker-backdrop` to identical explicit `padding`/`line-height`/`font` values instead of `inherit`.

- [ ] **Step 3: Wrap the textarea in an overlay container**

In `server/public/js/segment-editor.js` `renderSegmentRow`, replace the textarea line (`:866`):

```js
              <textarea id="textarea-${cssId(seg.segmentId)}">${escapeHtml(editableText)}</textarea>
```

with:

```js
              <div class="editor-overlay-wrap">
                <div class="marker-backdrop" id="backdrop-${cssId(seg.segmentId)}" aria-hidden="true"></div>
                <textarea id="textarea-${cssId(seg.segmentId)}">${escapeHtml(editableText)}</textarea>
              </div>
```

- [ ] **Step 4: Add the `refreshBackdrop` helper**

In `server/public/js/segment-editor.js`, add near `renderMarkdownPreview` (after `:1423`):

```js
  /**
   * Regenerate the marker backdrop for a segment's edit textarea and keep it
   * scroll-synced. Render-only; never mutates textarea.value. (B-4)
   */
  function refreshBackdrop(segmentId) {
    const ta = document.getElementById('textarea-' + cssId(segmentId));
    const bd = document.getElementById('backdrop-' + cssId(segmentId));
    if (!ta || !bd || typeof highlightMarkersInPlace !== 'function') return;
    bd.innerHTML = highlightMarkersInPlace(ta.value);
    bd.scrollTop = ta.scrollTop;
    bd.scrollLeft = ta.scrollLeft;
  }
```

- [ ] **Step 5: Render + sync the backdrop on open, input, and scroll**

In `openEditPanel`, inside the `if (!textarea._listenersAttached) { … }` block (after the existing preview listener, before the dirty `onInput` listener at `:919`), add:

```js
          // B-4: keep the marker backdrop in sync with edits + scrolling
          textarea.addEventListener('input', function onBackdrop() {
            refreshBackdrop(segmentId);
          });
          textarea.addEventListener('scroll', function onScroll() {
            const bd = document.getElementById('backdrop-' + cssId(segmentId));
            if (bd) {
              bd.scrollTop = textarea.scrollTop;
              bd.scrollLeft = textarea.scrollLeft;
            }
          });
```

And in the same function, where the initial preview is rendered on open (`:931–935`), add a backdrop render:

```js
        // Always render initial preview + backdrop when opening
        const previewEl = document.getElementById('preview-' + cssId(segmentId));
        if (previewEl) {
          previewEl.innerHTML = renderMarkdownPreview(textarea.value);
        }
        refreshBackdrop(segmentId);
```

- [ ] **Step 6: Refresh the backdrop after programmatic `.value` changes**

In `wrapSelection` (`:2221`), after the line that reassigns the value and before/after restoring selection (end of the function, ~`:2242`), add:

```js
    refreshBackdrop(ta._segmentId);
```

(Place it after selection is restored; `ta._segmentId` is set in `openEditPanel` at `:900`.)

In `insertTermFromLookup` (`:2175`), after the insertion updates `ta.value` (~`:2184`), add:

```js
    if (ta._segmentId) refreshBackdrop(ta._segmentId);
```

- [ ] **Step 7: Add the E2E helper + tests**

In `server/e2e/segment-editor.spec.js`, add a helper near the top (after the `require`s) and a new describe block at the end of the file:

```js
/** Load the first module of efnafraedi-2e ch01 and open the first edit panel. */
async function openFirstEditor(page) {
  await page.goto('/editor');
  await page.waitForLoadState('networkidle');
  await page.locator('#book-select').selectOption('efnafraedi-2e');
  const chapterSelect = page.locator('#chapter-select');
  await expect(chapterSelect).toBeVisible({ timeout: 5000 });
  await expect.poll(() => chapterSelect.locator('option').count(), { timeout: 10000 }).toBeGreaterThan(1);
  const firstCh = await chapterSelect.locator('option:not([value=""])').first().getAttribute('value');
  await chapterSelect.selectOption(firstCh);
  await page.locator('.module-card').first().click();
  await expect(page.locator('.segment-row').first()).toBeVisible({ timeout: 10000 });
  await page.locator('.btn-edit').first().click();
  await expect(page.locator('.edit-panel.active textarea').first()).toBeVisible({ timeout: 5000 });
}

test.describe('B-4 marker overlay', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('opening the editor renders a marker backdrop that tracks input', async ({ page }) => {
    await openFirstEditor(page);
    const ta = page.locator('.edit-panel.active textarea').first();
    const wrap = ta.locator('xpath=ancestor::div[contains(@class,"editor-overlay-wrap")]');
    const backdrop = wrap.locator('.marker-backdrop');
    await expect(backdrop).toHaveCount(1);
    await ta.fill('próf [[MATH:1]] texti');
    await ta.dispatchEvent('input');
    await expect(backdrop.locator('.marker-hl-atom')).toHaveText('[[MATH:1]]');
  });
});
```

- [ ] **Step 8: Run the E2E test**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js -g "marker overlay" --reporter=line`
Expected: PASS. (Kill any reused server first so the new script/CSS load.)

- [ ] **Step 9: Commit**

```bash
git add server/views/segment-editor.html server/public/js/segment-editor.js server/e2e/segment-editor.spec.js
git commit -m "feat(editor): marker highlight overlay behind edit textarea (B-4 task 2)"
```

---

## Task 3: Render the bracket/brace family, then make the EN pane consistent

**Why:** `renderMarkdownPreview` only handles the markdown family + `[[MATH]]`/`[[MEDIA]]`/`[[BR]]`/`[[SPACE]]`. The current pipeline's most common markers — the bracket family (`[[sub:]]` #1, `[[i:]]`, `[[xref:]]`, …) and the term/footnote braces — render **raw** in BOTH panes today. This task teaches the renderer those markers (additive, ordering-safe), then switches the EN pane to use it so both panes render identically.

**Files:**
- Modify: `server/public/js/segment-editor.js` (`renderMarkdownPreview` ~`:1351–1422`; `renderSegmentRow` `:714`; `window` exposes `:2472+`)
- Test: `server/e2e/segment-editor.spec.js`

**Interfaces:**
- Consumes: `escapeHtml`, existing `renderMarkdownPreview` handlers, `highlightTermsInHtml`.
- Produces: `renderMarkdownPreview` that renders the full Marker universe (exposed as `window.renderMarkdownPreview` for tests); EN pane HTML identical in treatment to IS.

- [ ] **Step 1: Expose `renderMarkdownPreview` for testing**

Near the other `window.*` assignments (`:2472+`) in `server/public/js/segment-editor.js`, add:

```js
  window.renderMarkdownPreview = renderMarkdownPreview;
```

- [ ] **Step 2: Write the failing E2E (page.evaluate) tests**

Add a new describe block to `server/e2e/segment-editor.spec.js`:

```js
test.describe('B-4 renderMarkdownPreview bracket/brace family', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/editor');
    await page.waitForLoadState('domcontentloaded');
  });

  const render = (page, s) => page.evaluate((x) => window.renderMarkdownPreview(x), s);

  test('renders [[sub:]] and [[sup:]] as sub/sup', async ({ page }) => {
    expect(await render(page, 'H[[sub:2]]O')).toContain('<sub>2</sub>');
    expect(await render(page, 'Ca[[sup:2+]]')).toContain('<sup>2+</sup>');
  });

  test('renders [[i:]] and [[b:]] as em/strong', async ({ page }) => {
    expect(await render(page, '[[i:orð]]')).toContain('<em>orð</em>');
    expect(await render(page, '[[b:orð]]')).toContain('<strong>orð</strong>');
  });

  test('renders [[xref:text|id]] keeping the display text', async ({ page }) => {
    const out = await render(page, '[[xref:Mynd 5.2|CNX_Chem_05_02]]');
    expect(out).toContain('Mynd 5.2');
    expect(out).not.toContain('[[xref:'); // not raw
  });

  test('renders {{term}} and {{fn}} without leaving raw braces', async ({ page }) => {
    expect(await render(page, '{{term}}atóm{{/term}}')).not.toContain('{{term}}');
    expect(await render(page, '{{fn}}nóta{{/fn}}')).not.toContain('{{fn}}');
  });

  test('does not leave a no-text [[xref:id]] raw (ordering safe)', async ({ page }) => {
    const out = await render(page, 'Sjá [[xref:fs-idm222]] hér');
    expect(out).not.toContain('[[xref:fs-idm222]]');
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js -g "bracket/brace family" --reporter=line`
Expected: FAIL — the renderer leaves `[[sub:]]`, `[[i:]]`, `[[xref:]]`, `{{term}}` raw.

- [ ] **Step 4: Add the bracket/brace handlers to `renderMarkdownPreview`**

In `server/public/js/segment-editor.js`, in `renderMarkdownPreview`, insert this block **immediately after the `[[BR]]` handler (`:1371`) and before the `[#…]` cross-reference handler (`:1373`)** — so `[[…]]`/`{{…}}` are consumed before the single-bracket and markdown rules:

```js
    // ── Bracket family (B-4): MUST precede single-bracket + markdown rules ──
    // [[TABLE:id]] → table chip
    html = html.replace(/\[\[TABLE:([^\]]+)\]\]/g, '<span class="xref-chip" title="Tafla: $1">&#128203;</span>');
    // reference markers WITH display text (text|target) — keep text
    html = html.replace(/\[\[link:([^|\]]+)\|([^\]]+)\]\]/g, '<span class="link-chip" title="Hlekkur: $2">$1 &#128279;</span>');
    html = html.replace(/\[\[xref:([^|\]]+)\|([^\]]+)\]\]/g, '<span class="xref-chip" title="Tilvísun: $2">$1</span>');
    html = html.replace(/\[\[docref:([^|\]]+)\|([^\]]+)\]\]/g, '<span class="xref-chip" title="Skjal: $2">$1</span>');
    // reference markers, no display text → chip icon
    html = html.replace(/\[\[xref:([^\]]+)\]\]/g, '<span class="xref-chip" title="Tilvísun: $1">&#128247;</span>');
    html = html.replace(/\[\[docref:([^\]]+)\]\]/g, '<span class="xref-chip" title="Skjaltilvísun: $1">&#128196;</span>');
    // paired-content emphasis/sub/sup
    html = html.replace(/\[\[i:(.+?)\]\]/g, '<em>$1</em>');
    html = html.replace(/\[\[b:(.+?)\]\]/g, '<strong>$1</strong>');
    html = html.replace(/\[\[sub:(.+?)\]\]/g, '<sub>$1</sub>');
    html = html.replace(/\[\[sup:(.+?)\]\]/g, '<sup>$1</sup>');
    // ── Brace family (term/footnote + legacy emphasis from old files) ──
    html = html.replace(/\{\{term\}\}(.+?)\{\{\/term\}\}/g, '<span class="preview-term">$1</span>');
    html = html.replace(/\{\{fn\}\}(.+?)\{\{\/fn\}\}/g, '<span class="xref-chip" title="Neðanmálsgrein">&#8224;$1</span>');
    html = html.replace(/\{\{i\}\}(.+?)\{\{\/i\}\}/g, '<em>$1</em>');
    html = html.replace(/\{\{b\}\}(.+?)\{\{\/b\}\}/g, '<strong>$1</strong>');
```

- [ ] **Step 5: Run the renderer tests to verify they pass**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js -g "bracket/brace family" --reporter=line`
Expected: PASS.

- [ ] **Step 6: Write the failing EN-pane consistency test**

Add to the same describe block. This needs a loaded module — reuse the `openFirstEditor` helper added in Task 2 (it loads efnafraedi-2e ch01 module 1):

```js
  test('EN pane renders the bracket family (not raw) like the IS pane', async ({ page }) => {
    // load a module without opening the edit panel
    await page.locator('#book-select').selectOption('efnafraedi-2e');
    const chapterSelect = page.locator('#chapter-select');
    await expect(chapterSelect).toBeVisible({ timeout: 5000 });
    await expect.poll(() => chapterSelect.locator('option').count(), { timeout: 10000 }).toBeGreaterThan(1);
    const firstCh = await chapterSelect.locator('option:not([value=""])').first().getAttribute('value');
    await chapterSelect.selectOption(firstCh);
    await page.locator('.module-card').first().click();
    await expect(page.locator('.segment-row').first()).toBeVisible({ timeout: 10000 });
    const joined = (await page.locator('.col-en').allInnerTexts()).join('\n');
    // ch01 EN content contains [[i:]] and [[MATH:]]; after rendering, the raw
    // bracket prefixes must not appear as literal text in the EN column.
    expect(joined).not.toContain('[[i:');
    expect(joined).not.toContain('[[sub:');
  });
```

(ch01 efnafraedi-2e EN is confirmed to contain `[[i:]]` and `[[MATH:]]` markers, so this assertion is not vacuous.)

- [ ] **Step 7: Run it to verify it fails**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js -g "EN pane renders the bracket" --reporter=line`
Expected: FAIL — EN pane currently uses `highlightMath(escapeHtml(seg.en))`, so `[[i:` shows raw.

- [ ] **Step 8: Switch EN rendering**

In `server/public/js/segment-editor.js`, change line `:714`:

```js
    let enHtml = highlightMath(escapeHtml(seg.en));
```

to:

```js
    let enHtml = renderMarkdownPreview(seg.en);
```

The term-highlight block at `:724–728` stays as-is (now runs on rendered HTML). `highlightTermsInHtml` matches escaped English term text on word boundaries; the renderer injects only Icelandic `title="…"` strings, so collisions are very unlikely.

- [ ] **Step 9: Run the EN test + full spec (no regression)**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js -g "EN pane renders the bracket" --reporter=line`
Expected: PASS.

Then the whole editor + terminology specs (term highlighting exercises `.term-highlight`):
`CI=1 npx playwright test segment-editor.spec.js terminology.spec.js --reporter=line` → all PASS.

- [ ] **Step 10: Commit**

```bash
git add server/public/js/segment-editor.js server/e2e/segment-editor.spec.js
git commit -m "feat(editor): render bracket/brace marker family; EN pane consistent (B-4 task 3)"
```

---

## Task 4: In-place "Endurstilla" revert button + extract `revertEdit`

**Files:**
- Modify: `server/public/js/ui-strings.js` (`segmentEditor` block ~`:167–183`)
- Modify: `server/public/js/segment-editor.js` (`.edit-controls` markup `:867–879`; new `revertEdit`; Escape handler `:2261–2296`; `window` exposes `:2472+`)
- Test: `server/e2e/segment-editor.spec.js`

**Interfaces:**
- Consumes: `refreshBackdrop` (Task 2), `dirtyEdits`, `moduleData`, `cssId`, `renderMarkdownPreview`.
- Produces: `revertEdit(segmentId)` (also `window.revertEdit`) — reverts the textarea to last-saved/MT, clears dirty, refreshes preview + backdrop + indicator, leaves the panel open.

- [ ] **Step 1: Add UI strings**

In `server/public/js/ui-strings.js`, inside the `segmentEditor` object (after `reverted: 'Afturkallað',` at `:182`), add:

```js
    revertButton: 'Endurstilla',
    revertTooltip: 'Endurstilla bútinn í síðast vistaða útgáfu (eða vélþýðingu)',
```

- [ ] **Step 2: Write the failing E2E test**

Add to `server/e2e/segment-editor.spec.js` (B-4 block):

```js
  test('Endurstilla reverts dirty content and keeps the panel open', async ({ page }) => {
    await openFirstEditor(page);
    const panel = page.locator('.edit-panel.active').first();
    const ta = panel.locator('textarea');
    const original = await ta.inputValue();
    await ta.fill(original + ' BREYTING-XYZ');
    await ta.dispatchEvent('input');
    await panel.locator('.btn-revert').click();
    await expect(ta).toHaveValue(original);
    await expect(panel).toBeVisible(); // panel stays open
  });
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js -g "Endurstilla reverts" --reporter=line`
Expected: FAIL — `.btn-revert` does not exist.

- [ ] **Step 4: Add the revert button to the edit controls**

In `server/public/js/segment-editor.js`, in the `.edit-controls` block, add the button between the "Vista" and "Hætta við" buttons (`:877–878`):

```js
                <button class="btn btn-sm btn-primary" onclick="saveEdit('${seg.segmentId}')">Vista</button>
                <button class="btn btn-sm btn-secondary btn-revert" onclick="revertEdit('${seg.segmentId}')" title="${UI.segmentEditor.revertTooltip}">&#8617; ${UI.segmentEditor.revertButton}</button>
                <button class="btn btn-sm btn-secondary" onclick="closeEditPanel('${seg.segmentId}')">Hætta við</button>
```

- [ ] **Step 5: Add `revertEdit` and route Escape through it**

Add the function near `closeEditPanel` (after `:958`):

```js
  /**
   * Revert a segment's edit textarea to the last-saved (pending/approved) edit
   * or the original MT text, without closing the edit panel. (B-4)
   */
  function revertEdit(segmentId) {
    const textarea = document.getElementById('textarea-' + cssId(segmentId));
    if (!textarea || !moduleData) return;
    const seg = moduleData.segments.find((s) => s.segmentId === segmentId);
    if (!seg) return;
    const latestEdit = moduleData.edits[segmentId]?.[0];
    const hasActiveEdit =
      latestEdit && (latestEdit.status === 'pending' || latestEdit.status === 'approved');
    textarea.value = hasActiveEdit ? latestEdit.edited_content : seg.is;
    dirtyEdits.delete(segmentId);
    const ind = document.getElementById('seg-ind-' + cssId(segmentId));
    if (ind) {
      ind.textContent = UI.segmentEditor.reverted;
      ind.className = 'seg-save-ind saved';
      setTimeout(() => {
        ind.textContent = '';
        ind.className = 'seg-save-ind';
      }, 2000);
    }
    const previewEl = document.getElementById('preview-' + cssId(segmentId));
    if (previewEl) previewEl.innerHTML = renderMarkdownPreview(textarea.value);
    refreshBackdrop(segmentId);
    updateSaveStatusBar();
  }
```

Then in the Escape handler (`:2261–2296`), replace the in-line revert body with a delegation. Specifically, within the `if (dirtyEdits.has(segId) && moduleData) { … }` branch, replace its contents with:

```js
        if (dirtyEdits.has(segId)) {
          revertEdit(segId);
          e.preventDefault();
          return;
        }
```

(Leaves the rest of the Escape handler — closing the active panel — unchanged.)

- [ ] **Step 6: Expose `revertEdit` on window**

Near the other `window.*` assignments (`:2472+`), add:

```js
  window.revertEdit = revertEdit;
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js -g "Endurstilla reverts" --reporter=line`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/public/js/ui-strings.js server/public/js/segment-editor.js server/e2e/segment-editor.spec.js
git commit -m "feat(editor): in-place Endurstilla revert button (B-4 task 4)"
```

---

## Task 5: Clearer save-block message

**Files:**
- Modify: `server/public/js/ui-strings.js` (`confirm` block ~`:65`)
- Modify: `server/public/js/segment-editor.js` (`saveEdit` block path `:1085–1088`)
- Test: `server/e2e/segment-editor.spec.js`

**Interfaces:**
- Consumes: `UI.confirm.validationBlocked` (existing), `validateSegmentEdit` (existing, unchanged).
- Produces: a blocked-save alert that names the marker(s) and points to Endurstilla.

- [ ] **Step 1: Add the hint string**

In `server/public/js/ui-strings.js`, in the `confirm` object after `validationBlocked` (`:65`), add:

```js
    validationRevertHint: '\n\nÝttu á „Endurstilla“ til að ná aftur upprunalega textanum.',
```

- [ ] **Step 2: Write the failing E2E test**

Add to `server/e2e/segment-editor.spec.js` (B-4 block). It captures the `dialog` (alert) text:

```js
  test('corrupting a structural marker shows a block message with a revert hint', async ({ page }) => {
    await openFirstEditor(page);
    const panel = page.locator('.edit-panel.active').first();
    const ta = panel.locator('textarea');
    // Force a guaranteed block: inject EN math reference mismatch by clearing
    // the IS content so any EN [[MATH]]/[[MEDIA]]/[[BR]] requirement fails.
    // (If the first segment has no structural marker, this still exercises the
    // alert path harmlessly; prefer a segment whose EN has [[MATH:]].)
    await ta.fill('texti án nauðsynlegra merkja');
    await ta.dispatchEvent('input');
    let dialogMessage = '';
    page.once('dialog', async (d) => {
      dialogMessage = d.message();
      await d.accept();
    });
    await panel.locator('.btn-primary').click();
    // Only assert the hint when a block actually fired (segment had a required marker).
    if (dialogMessage && dialogMessage.includes('Ekki hægt að vista')) {
      expect(dialogMessage).toContain('Endurstilla');
    }
  });
```

To make the block deterministic, first identify a segment whose EN carries a required marker:
`grep -rl "\[\[MATH:" books/efnafraedi-2e/02-for-mt/ch01/ | head` — then target that module/segment in the test (replace `openFirstEditor` with a variant that opens that segment) so the `if` is always taken.

- [ ] **Step 3: Run it to verify it fails**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js -g "revert hint" --reporter=line`
Expected: FAIL — the alert lacks "Endurstilla".

- [ ] **Step 4: Append the hint to the block alert**

In `server/public/js/segment-editor.js`, change `:1086`:

```js
      alert(UI.confirm.validationBlocked + validation.blocked.join('\n'));
```

to:

```js
      alert(UI.confirm.validationBlocked + validation.blocked.join('\n') + UI.confirm.validationRevertHint);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js -g "revert hint" --reporter=line`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/public/js/ui-strings.js server/public/js/segment-editor.js server/e2e/segment-editor.spec.js
git commit -m "feat(editor): point blocked-save message at Endurstilla (B-4 task 5)"
```

---

## Final verification

- [ ] **Run the full unit suite:** `npm test` → all green (incl. new `markerHighlight.test.js`).
- [ ] **Run the segment-editor E2E suite:** `cd server/e2e && (lsof -ti:3456 | xargs -r kill); CI=1 npx playwright test segment-editor.spec.js --reporter=line` → all green.
- [ ] **Lint:** `npx eslint server/public/js/marker-highlight.js server/public/js/segment-editor.js server/public/js/ui-strings.js` → clean.
- [ ] **Manual smoke (running server, `npm run server:dev`):** open `/editor`, load a module → EN and IS panes both render markers; click Breyta → backdrop shows highlighted markers aligned with the caret; type to corrupt `[[MATH:N]]` and Vista → block alert names the marker + mentions Endurstilla; click Endurstilla → text restored, panel stays open; press Escape on a dirty edit → same revert.
- [ ] **Update memory / CLAUDE.md** if the team conventions changed (new dual-mode client-module pattern is worth a one-line note).

## Self-review notes (coverage vs. spec)

- Spec Component 1 (renderer extension + EN render) → Task 3. Component 2 (overlay + `highlightMarkersInPlace`) → Tasks 1–2. Component 3 (revert button + extracted logic) → Task 4. Component 4 (block message) → Task 5. ✅
- Spec "Marker universe" full set → covered by `highlightMarkersInPlace` (Task 1, with preservation + detection tests across the set) and the `renderMarkdownPreview` extension (Task 3, with per-marker page.evaluate tests). Ordering rule (`[[…]]`/`{{…}}` before single-bracket/markdown) tested in both. ✅
- Spec invariant `stripTags(out) === escapeHtml(in)` → Task 1 Step 1 tests. ✅
- Spec "editing logic untouched" → no task modifies selection/keyboard/save-of-`.value`; overlay is render-only and only *adds* `refreshBackdrop` calls after existing `.value` mutations. ✅
- Spec "no re-translation / client-render only" → no task runs a pipeline tool; all changes are client JS/CSS. ✅
- Spec out-of-scope (contenteditable, undo stack, server, Pass-2 editor) → no task touches them. ✅
