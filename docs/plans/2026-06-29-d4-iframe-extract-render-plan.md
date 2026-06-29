# D4 — `<iframe>` Extract + Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenStax `<iframe>` embeds (PhET sims, YouTube videos) survive the extract→inject→render pipeline and render as working, accessible, responsive iframes — closing biology's main content gap (51 embeds across 35 files).

**Architecture:** A new offline-once tool (`tools/resolve-embeds.js`) resolves each `openstax.org/l/<slug>` redirector (which itself returns `X-Frame-Options: DENY`) to its embeddable final URL and writes a committed `books/<book>/embed-mapping.json`. Extract captures the `/l/` iframe; inject re-emits it verbatim (CNXML stays faithful); render looks the `/l/` src up in the mapping and emits a responsive lazy `<iframe>` to the resolved URL plus an always-visible fallback link, failing loud on a mapping miss.

**Tech Stack:** Node 22 ESM, `globalThis.fetch`, Vitest. Helpers: `parseAttributes` (`tools/lib/cnxml-parser.js`), `requireBook` (`tools/lib/parseArgs.js`), `getBookRenderConfig` (`tools/lib/book-rendering-config.js`), `escapeAttr`/`escapeXml` (in render/inject respectively).

## Global Constraints

- **`--book` is required** on every tool invocation (D1 enforcement); resolve via `requireBook(args)`. No default-book fallback.
- **Local `npm test` is the authoritative gate** — CI is red until ~2026-07-01 and there is no branch protection. Run `npm test` before each commit's "verify pass" step.
- **Never modify `books/*/01-source/**`** — read-only OpenStax source. The new mapping lives at `books/<book>/embed-mapping.json` (book root, a writable/generated location), never under `01-source/`.
- **One real code path, fail loud** (`feedback-robustness-over-expedience`): render must throw on an unmapped/blocked embed, never emit a blank-box iframe.
- **Discriminator:** a media metadata entry is an **embed** iff it has a truthy `embedSrc` field; otherwise it is an **image** (has `src`). Builders and renderers branch on `embedSrc` presence.
- **ESM only** — `import`/`export`, no `require`.

---

### Task 1: `resolve-embeds.js` — the offline resolver + committed mapping

**Files:**
- Create: `tools/resolve-embeds.js`
- Create: `tools/lib/embed-resolve.js` (pure resolution logic, network-injectable for tests)
- Test: `tools/__tests__/embed-resolve.test.js`

**Interfaces:**
- Produces: `resolveEmbeds(srcs: string[], fetchFn) → Promise<Record<string, {resolved: string, kind: 'youtube'|'phet'|'other', status: 'ok'|'blocked'|'error'}>>` — `fetchFn` defaults to `globalThis.fetch`; injected in tests. `classifyKind(url: string) → 'youtube'|'phet'|'other'`.
- Produces (on disk): `books/<book>/embed-mapping.json`, an object keyed by the original `/l/` src.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/embed-resolve.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { resolveEmbeds, classifyKind } from '../lib/embed-resolve.js';

function fakeFetch(map) {
  return async (url) => {
    const entry = map[url];
    if (!entry) throw new Error(`network error: ${url}`);
    return {
      url: entry.finalUrl,
      status: entry.status ?? 200,
      headers: { get: (h) => entry.headers?.[h.toLowerCase()] ?? null },
    };
  };
}

describe('classifyKind', () => {
  it('classifies youtube embed URLs', () => {
    expect(classifyKind('https://www.youtube.com/embed/abc')).toBe('youtube');
  });
  it('classifies phet URLs', () => {
    expect(classifyKind('https://phet.colorado.edu/sims/html/x_en.html')).toBe('phet');
  });
  it('classifies anything else as other', () => {
    expect(classifyKind('https://example.org/thing')).toBe('other');
  });
});

describe('resolveEmbeds', () => {
  it('resolves a /l/ redirect to its final framable URL', async () => {
    const fetchFn = fakeFetch({
      'https://www.openstax.org/l/diet_detective': {
        finalUrl: 'https://www.youtube.com/embed/xyz',
        headers: {},
      },
    });
    const out = await resolveEmbeds(['https://www.openstax.org/l/diet_detective'], fetchFn);
    expect(out['https://www.openstax.org/l/diet_detective']).toEqual({
      resolved: 'https://www.youtube.com/embed/xyz',
      kind: 'youtube',
      status: 'ok',
    });
  });

  it('marks a target that denies framing as blocked', async () => {
    const fetchFn = fakeFetch({
      'https://www.openstax.org/l/locked': {
        finalUrl: 'https://locked.example/page',
        headers: { 'x-frame-options': 'DENY' },
      },
    });
    const out = await resolveEmbeds(['https://www.openstax.org/l/locked'], fetchFn);
    expect(out['https://www.openstax.org/l/locked'].status).toBe('blocked');
  });

  it('marks a network failure as error, not ok', async () => {
    const fetchFn = fakeFetch({});
    const out = await resolveEmbeds(['https://www.openstax.org/l/missing'], fetchFn);
    expect(out['https://www.openstax.org/l/missing'].status).toBe('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/embed-resolve.test.js`
Expected: FAIL — cannot resolve `../lib/embed-resolve.js`.

- [ ] **Step 3: Write minimal implementation**

Create `tools/lib/embed-resolve.js`:

```javascript
/**
 * Pure embed-resolution logic for tools/resolve-embeds.js.
 * Network is injected so the unit tests run offline.
 */

/** Classify a resolved embed URL by host. */
export function classifyKind(url) {
  try {
    const host = new URL(url).hostname;
    if (host.endsWith('youtube.com') || host.endsWith('youtu.be')) return 'youtube';
    if (host.endsWith('phet.colorado.edu')) return 'phet';
    return 'other';
  } catch {
    return 'other';
  }
}

/** A final target is framable unless it sends X-Frame-Options DENY/SAMEORIGIN. */
function isFramable(headers) {
  const xfo = (headers.get('x-frame-options') || '').toLowerCase();
  return !(xfo.includes('deny') || xfo.includes('sameorigin'));
}

/**
 * Resolve each /l/ src to its final URL + framing status.
 * @param {string[]} srcs - distinct original iframe srcs
 * @param {typeof globalThis.fetch} [fetchFn]
 * @returns {Promise<Record<string,{resolved:string,kind:string,status:string}>>}
 */
export async function resolveEmbeds(srcs, fetchFn = globalThis.fetch) {
  const out = {};
  for (const src of srcs) {
    try {
      const res = await fetchFn(src, { redirect: 'follow', method: 'GET' });
      const resolved = res.url || src;
      const status = res.status >= 200 && res.status < 400 && isFramable(res.headers) ? 'ok' : 'blocked';
      out[src] = { resolved, kind: classifyKind(resolved), status };
    } catch {
      out[src] = { resolved: '', kind: 'other', status: 'error' };
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/embed-resolve.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the CLI wrapper**

Create `tools/resolve-embeds.js` (model the arg/IO shape on `tools/generate-image-mapping.js`):

```javascript
#!/usr/bin/env node
/**
 * resolve-embeds.js
 *
 * Producer of `books/<book>/embed-mapping.json`, consumed by cnxml-render.js.
 * Scans a book's 01-source CNXML for <iframe src="...openstax.org/l/..."> embeds,
 * follows each redirect to its embeddable final URL (the /l/ redirector itself
 * sends X-Frame-Options: DENY, so the original src cannot be framed), and records
 * the resolved URL + framing status. This is the ONLY networked pipeline step;
 * extract/inject/render stay offline and read the committed mapping.
 *
 * Usage: node tools/resolve-embeds.js --book <slug> [--dry-run] [--verbose]
 */
import fs from 'fs';
import path from 'path';
import { parseArgs, requireBook } from './lib/parseArgs.js';
import { resolveEmbeds } from './lib/embed-resolve.js';

const IFRAME_SRC = /<iframe\b[^>]*\bsrc="([^"]+)"/g;

function collectSrcs(sourceDir) {
  const srcs = new Set();
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) walk(p);
      else if (name.endsWith('.cnxml')) {
        const text = fs.readFileSync(p, 'utf8');
        let m;
        while ((m = IFRAME_SRC.exec(text)) !== null) srcs.add(m[1]);
      }
    }
  };
  walk(sourceDir);
  return [...srcs].sort();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  requireBook(args);
  const bookDir = path.join('books', args.book);
  const sourceDir = path.join(bookDir, '01-source');
  const srcs = collectSrcs(sourceDir);
  console.log(`Found ${srcs.length} distinct iframe src(s) in ${args.book}`);

  const mapping = await resolveEmbeds(srcs);

  const blocked = Object.entries(mapping).filter(([, v]) => v.status !== 'ok');
  if (blocked.length) {
    console.error(`WARNING: ${blocked.length} embed(s) did not resolve to a framable target:`);
    for (const [src, v] of blocked) console.error(`  [${v.status}] ${src}`);
  }
  if (args.verbose) {
    for (const [src, v] of Object.entries(mapping)) console.log(`  ${src} -> ${v.resolved} (${v.kind}, ${v.status})`);
  }

  const outPath = path.join(bookDir, 'embed-mapping.json');
  if (args['dry-run']) {
    console.log(JSON.stringify(mapping, null, 2));
    console.log('(dry-run: nothing written)');
    return;
  }
  fs.writeFileSync(outPath, JSON.stringify(mapping, null, 2) + '\n');
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 6: Commit**

```bash
git add tools/lib/embed-resolve.js tools/resolve-embeds.js tools/__tests__/embed-resolve.test.js
git commit -m "feat(d4): resolve-embeds tool + embed-mapping producer (offline /l/ resolution)"
```

---

### Task 2: Extract — capture `<iframe>` metadata (inline + block)

**Files:**
- Modify: `tools/cnxml-extract.js` — inline media in `extractInlineText` (~`:187-206`); block media `case 'media'` (~`:1001-1013`)
- Test: `tools/__tests__/cnxml-extract.test.js` (add cases)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: media metadata objects now carry `embedSrc`, `width`, `height` when the `<media>` child is an `<iframe>`. Image entries are unchanged (`src`, `mimeType`). Consumed by Task 3.

- [ ] **Step 1: Write the failing test**

Add to `tools/__tests__/cnxml-extract.test.js`:

```javascript
import { extractInlineText } from '../cnxml-extract.js';

describe('extract: iframe media capture', () => {
  it('captures an inline <media><iframe> as an embed (embedSrc/width/height)', () => {
    const inlineMedia = new Map();
    const text = extractInlineText(
      'See <media id="m1" alt="diet_detective"><iframe width="660" height="371.4" src="https://www.openstax.org/l/diet_detective"/></media>.',
      new Map(),
      { math: 0, media: 0 },
      inlineMedia
    );
    expect(text).toContain('[[MEDIA:1]]');
    const entry = inlineMedia.get('[[MEDIA:1]]');
    expect(entry.embedSrc).toBe('https://www.openstax.org/l/diet_detective');
    expect(entry.width).toBe('660');
    expect(entry.height).toBe('371.4');
    expect(entry.src).toBe('');
  });
});
```

(Block-`case 'media'` coverage is exercised end-to-end in Task 6's round-trip; the unit test above pins the inline path, the higher-traffic case.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-extract.test.js -t "iframe media capture"`
Expected: FAIL — `entry.embedSrc` is `undefined`.

- [ ] **Step 3: Implement — inline media (in `extractInlineText`)**

In `tools/cnxml-extract.js`, the inline media block currently reads (~`:194-203`):

```javascript
      const imageMatch = mediaContent.match(/<image([^>]*)>/);
      const imageAttrs = imageMatch ? parseAttributes(imageMatch[1]) : {};

      inlineMediaMap.set(placeholder, {
        id: parsedAttrs.id || null,
        class: parsedAttrs.class || null,
        alt: parsedAttrs.alt || imageAttrs.alt || '',
        src: imageAttrs.src || '',
        mimeType: imageAttrs['mime-type'] || null,
      });
```

Replace with:

```javascript
      const imageMatch = mediaContent.match(/<image([^>]*)>/);
      const imageAttrs = imageMatch ? parseAttributes(imageMatch[1]) : {};
      const iframeMatch = mediaContent.match(/<iframe([^>]*)\/?>/);
      const iframeAttrs = iframeMatch ? parseAttributes(iframeMatch[1]) : {};

      inlineMediaMap.set(placeholder, {
        id: parsedAttrs.id || null,
        class: parsedAttrs.class || null,
        alt: parsedAttrs.alt || imageAttrs.alt || '',
        src: imageAttrs.src || '',
        mimeType: imageAttrs['mime-type'] || null,
        embedSrc: iframeAttrs.src || '',
        width: iframeAttrs.width || '',
        height: iframeAttrs.height || '',
      });
```

- [ ] **Step 4: Implement — block media (`case 'media'`)**

In `tools/cnxml-extract.js`, the block media case currently reads (~`:1001-1013`):

```javascript
      case 'media': {
        const mediaAttrs = item.attributes;
        const imageMatch = item.content.match(/<image[^>]*>/);
        const imageAttrs = imageMatch
          ? parseAttributes(imageMatch[0].match(/<image([^>]*)>/)[1])
          : {};
        elements.push({
          type: 'media',
          id: item.id,
          class: mediaAttrs.class || null,
          alt: mediaAttrs.alt || imageAttrs.alt || '',
          src: imageAttrs.src || '',
        });
        break;
      }
```

Replace the `elements.push({...})` with one that also captures iframe metadata:

```javascript
      case 'media': {
        const mediaAttrs = item.attributes;
        const imageMatch = item.content.match(/<image[^>]*>/);
        const imageAttrs = imageMatch
          ? parseAttributes(imageMatch[0].match(/<image([^>]*)>/)[1])
          : {};
        const iframeMatch = item.content.match(/<iframe([^>]*)\/?>/);
        const iframeAttrs = iframeMatch ? parseAttributes(iframeMatch[1]) : {};
        elements.push({
          type: 'media',
          id: item.id,
          class: mediaAttrs.class || null,
          alt: mediaAttrs.alt || imageAttrs.alt || '',
          src: imageAttrs.src || '',
          embedSrc: iframeAttrs.src || '',
          width: iframeAttrs.width || '',
          height: iframeAttrs.height || '',
        });
        break;
      }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-extract.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract.test.js
git commit -m "feat(d4): capture <iframe> embedSrc/width/height in extract (inline + block media)"
```

---

### Task 3: Inject — re-emit `<iframe>` verbatim (`buildMediaElement` + `buildMedia`)

**Files:**
- Modify: `tools/cnxml-inject.js` — `buildMediaElement` (~`:1037`), `buildMedia` (~`:3017`)
- Test: `tools/__tests__/cnxml-inject.test.js` (add cases)

**Interfaces:**
- Consumes: media metadata from Task 2 (`embedSrc`, `width`, `height`).
- Produces: injected CNXML containing `<media …><iframe width=… height=… src="<embedSrc>"/></media>` (the original `/l/` src, verbatim — keeps `03-translated/` faithful). Consumed by Task 5 (render reads this CNXML).

- [ ] **Step 1: Write the failing test**

Add to `tools/__tests__/cnxml-inject.test.js`:

```javascript
import { buildMediaElement, buildMedia } from '../cnxml-inject.js';

describe('inject: iframe media re-emit', () => {
  const embed = {
    id: 'm1', class: null, alt: 'diet_detective',
    embedSrc: 'https://www.openstax.org/l/diet_detective', width: '660', height: '371.4',
  };

  it('buildMediaElement re-emits an inline iframe verbatim', () => {
    const out = buildMediaElement(embed);
    expect(out).toContain('<iframe');
    expect(out).toContain('src="https://www.openstax.org/l/diet_detective"');
    expect(out).toContain('width="660"');
    expect(out).not.toContain('<image');
  });

  it('buildMedia re-emits a block iframe verbatim', () => {
    const out = buildMedia(embed);
    expect(out).toContain('<iframe');
    expect(out).toContain('src="https://www.openstax.org/l/diet_detective"');
    expect(out).not.toContain('<image');
  });
});
```

(`buildMedia` must be exported. If it is not yet in the `export {…}`/`module.exports` list, add it alongside `buildNoteDom` — see `tools/cnxml-inject.js:3553`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js -t "iframe media re-emit"`
Expected: FAIL — `buildMedia` not exported and/or output contains `<image>`.

- [ ] **Step 3: Implement — `buildMediaElement`**

Replace `buildMediaElement` (~`:1037-1045`):

```javascript
function buildMediaElement(media) {
  const idAttr = media.id ? ` id="${media.id}"` : '';
  const classAttr = media.class ? ` class="${media.class}"` : '';
  const altAttr = media.alt ? ` alt="${escapeXml(media.alt)}"` : '';

  if (media.embedSrc) {
    const w = media.width ? ` width="${escapeXml(media.width)}"` : '';
    const h = media.height ? ` height="${escapeXml(media.height)}"` : '';
    return `<media${idAttr}${classAttr}${altAttr}><iframe${w}${h} src="${escapeXml(media.embedSrc)}"/></media>`;
  }

  const mimeType = media.mimeType || inferMimeType(media.src);
  return `<media${idAttr}${classAttr}${altAttr}><image mime-type="${mimeType}" src="${media.src}"/></media>`;
}
```

- [ ] **Step 4: Implement — `buildMedia`**

Replace the body of `buildMedia` (~`:3017`) so the embed branch emits an iframe:

```javascript
function buildMedia(element) {
  const idAttr = element.id ? ` id="${element.id}"` : '';
  const classAttr = element.class ? ` class="${element.class}"` : '';
  const alt = element.alt ? ` alt="${escapeXml(element.alt)}"` : '';

  const lines = [];
  lines.push(`<media${idAttr}${classAttr}${alt}>`);

  if (element.embedSrc) {
    const w = element.width ? ` width="${escapeXml(element.width)}"` : '';
    const h = element.height ? ` height="${escapeXml(element.height)}"` : '';
    lines.push(`<iframe${w}${h} src="${escapeXml(element.embedSrc)}"/>`);
  } else if (element.src) {
    const mimeType = inferMimeType(element.src);
    lines.push(`<image mime-type="${mimeType}" src="${element.src}"/>`);
  }

  lines.push('</media>');
  return lines.join('\n');
}
```

- [ ] **Step 5: Export `buildMedia` (if not already)**

In the export list near `tools/cnxml-inject.js:3553`, ensure `buildMedia` and `buildMediaElement` are exported alongside `buildNoteDom`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject.test.js
git commit -m "feat(d4): re-emit <iframe> verbatim in inject (buildMediaElement + buildMedia)"
```

---

### Task 4: Shared render helper — `tools/lib/embed-mapping.js`

**Files:**
- Create: `tools/lib/embed-mapping.js`
- Test: `tools/__tests__/embed-mapping.test.js`

**Interfaces:**
- Produces:
  - `loadEmbedMapping(bookSlug: string) → Record<string, {resolved,kind,status}>` — reads `books/<bookSlug>/embed-mapping.json`; returns `{}` if the file is absent.
  - `renderEmbedHtml({ embedSrc, width, height, title, embedMap }) → string` — returns responsive-iframe + fallback-link HTML for an `ok` entry; **throws** if `embedSrc` is missing from `embedMap` or its `status !== 'ok'`.
- Consumed by Task 5 (both `cnxml-render.js` and `cnxml-elements.js`).

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/embed-mapping.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { renderEmbedHtml } from '../lib/embed-mapping.js';

const embedMap = {
  'https://www.openstax.org/l/diet_detective': {
    resolved: 'https://www.youtube.com/embed/xyz', kind: 'youtube', status: 'ok',
  },
  'https://www.openstax.org/l/locked': {
    resolved: 'https://locked.example/p', kind: 'other', status: 'blocked',
  },
};

describe('renderEmbedHtml', () => {
  it('emits a responsive lazy iframe to the RESOLVED url plus a fallback link', () => {
    const html = renderEmbedHtml({
      embedSrc: 'https://www.openstax.org/l/diet_detective',
      width: '660', height: '371.4', title: 'diet detective', embedMap,
    });
    expect(html).toContain('class="embed-responsive"');
    expect(html).toContain('src="https://www.youtube.com/embed/xyz"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('title="diet detective"');
    expect(html).toContain('class="embed-fallback"');
    expect(html).toContain('href="https://www.youtube.com/embed/xyz"');
    // never leak the un-framable /l/ redirector into an iframe
    expect(html).not.toContain('openstax.org/l/');
  });

  it('throws (fail loud) when the src is not in the mapping', () => {
    expect(() => renderEmbedHtml({ embedSrc: 'https://www.openstax.org/l/unknown', embedMap }))
      .toThrow(/Unresolved embed/);
  });

  it('throws when the mapped target is blocked', () => {
    expect(() => renderEmbedHtml({ embedSrc: 'https://www.openstax.org/l/locked', embedMap }))
      .toThrow(/Unresolved embed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/embed-mapping.test.js`
Expected: FAIL — cannot resolve `../lib/embed-mapping.js`.

- [ ] **Step 3: Write minimal implementation**

Create `tools/lib/embed-mapping.js`:

```javascript
import fs from 'fs';
import path from 'path';

/** Minimal HTML attribute escape (mirrors render's escapeAttr). */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Load a book's committed embed mapping. Returns {} when absent. */
export function loadEmbedMapping(bookSlug) {
  const p = path.join('books', bookSlug, 'embed-mapping.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Render a responsive lazy iframe + always-visible fallback link.
 * Throws (fail loud) on an unmapped or non-ok embed — never emit a blank box.
 */
export function renderEmbedHtml({ embedSrc, width, height, title, embedMap }) {
  const entry = embedMap && embedMap[embedSrc];
  if (!entry || entry.status !== 'ok' || !entry.resolved) {
    throw new Error(
      `Unresolved embed: ${embedSrc} — run \`node tools/resolve-embeds.js --book <slug>\` ` +
        `to (re)generate embed-mapping.json`
    );
  }
  const w = width ? ` width="${esc(width)}"` : '';
  const h = height ? ` height="${esc(height)}"` : '';
  const t = title ? ` title="${esc(title)}"` : '';
  return (
    `<div class="embed-responsive">` +
    `<iframe src="${esc(entry.resolved)}"${t}${w}${h} loading="lazy" allowfullscreen></iframe>` +
    `</div>` +
    `<p class="embed-fallback"><a href="${esc(entry.resolved)}" target="_blank" rel="noopener">Opna í nýjum glugga</a></p>`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/embed-mapping.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/embed-mapping.js tools/__tests__/embed-mapping.test.js
git commit -m "feat(d4): shared embed-mapping render helper (responsive iframe + fallback, fail-loud)"
```

---

### Task 5: Render — wire the iframe branch into the three render sites

**Files:**
- Modify: `tools/cnxml-render.js` — load mapping (in `main()` ~`:3233`, `renderCnxmlToHtml` ~`:413`); `renderMedia` (~`:1248`); figure media path (~`:1201-1219`)
- Modify: `tools/lib/cnxml-elements.js` — inline media regex (~`:788`)
- Test: `tools/__tests__/cnxml-render.test.js` (add cases)

**Interfaces:**
- Consumes: injected CNXML containing `<media><iframe src="/l/…">` (Task 3); `renderEmbedHtml`/`loadEmbedMapping` (Task 4).
- Produces: HTML with `<div class="embed-responsive"><iframe src="<resolved>" …></div>` + fallback `<p>`. The embed map is threaded via `context.embedMap` so `cnxml-elements.js` can use it.

- [ ] **Step 1: Write the failing test**

Add to `tools/__tests__/cnxml-render.test.js`:

```javascript
import { renderCnxmlToHtml } from '../cnxml-render.js';

describe('render: iframe embeds', () => {
  const embedMap = {
    'https://www.openstax.org/l/diet_detective': {
      resolved: 'https://www.youtube.com/embed/xyz', kind: 'youtube', status: 'ok',
    },
  };

  it('renders a standalone <media><iframe> as a resolved responsive iframe + fallback', () => {
    const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml"><content>
      <media id="m1" alt="diet_detective"><iframe width="660" height="371.4"
        src="https://www.openstax.org/l/diet_detective"/></media>
    </content></document>`;
    const { html } = renderCnxmlToHtml(cnxml, { bookSlug: 'liffraedi-2e', chapter: 29, embedMap });
    expect(html).toContain('class="embed-responsive"');
    expect(html).toContain('src="https://www.youtube.com/embed/xyz"');
    expect(html).toContain('class="embed-fallback"');
    expect(html).not.toContain('openstax.org/l/');
  });
});
```

(Confirm the exact `renderCnxmlToHtml(cnxml, options)` option names while implementing — `bookSlug`/`chapter` mirror existing call sites; add `embedMap` as a new option so the test can inject without a file. The CLI path loads it from disk in Step 3.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-render.test.js -t "iframe embeds"`
Expected: FAIL — output still contains `openstax.org/l/` (or no `embed-responsive`).

- [ ] **Step 3: Implement — load + thread the mapping**

At the top of `tools/cnxml-render.js`, import the helper and add a module global:

```javascript
import { loadEmbedMapping, renderEmbedHtml } from './lib/embed-mapping.js';
let EMBED_MAP = {};
```

In `main()` (after `BOOK_SLUG = args.book;`, ~`:3235`):

```javascript
  EMBED_MAP = loadEmbedMapping(BOOK_SLUG);
```

In `renderCnxmlToHtml(cnxml, options = {})` (~`:413`), accept an injected map (test path) and fall back to the global; thread it onto the render context:

```javascript
  if (options.embedMap) EMBED_MAP = options.embedMap;
```

**Add `embedMap: EMBED_MAP` to all THREE `const context = {…}` blocks** — `tools/cnxml-render.js:471`, `:2341`, and the options object at `:3868` (each already carries `bookSlug: BOOK_SLUG`; add the line right after it). The iframe render path uses only `embedMap` (not `bookSlug`/`chapter`), but `processInlineContent`→`cnxml-elements.js` reads `context.embedMap`, and a media renderer can be reached from any of the three contexts — so **all three must carry it** or fail-loud throws on whichever path's context is missing it.

**Test-isolation note:** `EMBED_MAP` is a module global; `options.embedMap` overwrites it per call. Every render test that exercises an embed MUST pass `embedMap` (the tests in this plan do). Tests that don't touch embeds are unaffected (no embed → no lookup).

- [ ] **Step 4: Implement — `renderMedia` (standalone block)**

In `renderMedia` (~`:1248`), before the image-match block, add an iframe branch:

```javascript
function renderMedia(media, context) {
  const id = media.id || null;
  const className = media.attributes.class || null;
  const alt = media.attributes.alt || '';

  const iframeMatch = media.content.match(/<iframe([^>]*)\/?>/);
  if (iframeMatch) {
    const a = parseAttributes(iframeMatch[1]);
    return renderEmbedHtml({
      embedSrc: a.src || '', width: a.width || '', height: a.height || '',
      title: alt.replace(/[_-]+/g, ' '),
      embedMap: context.embedMap || EMBED_MAP,
    });
  }

  // Extract image src from content
  const imageMatch = media.content.match(/<image([^>]*)\/?>(?:<\/image>)?/);
  // ... unchanged below ...
```

- [ ] **Step 5: Implement — inline media (`cnxml-elements.js`)**

In `tools/lib/cnxml-elements.js`, just before the existing inline `<media><image>` replace (~`:788`), add an inline `<media><iframe>` replace. Import `renderEmbedHtml` at the top of the file.

```javascript
  // Convert inline <media><iframe> embeds (PhET/YouTube) to resolved responsive iframes
  result = result.replace(
    /<media\s([^>]*)>\s*<iframe([^>]*)\/?>\s*<\/media>/g,
    (match, mediaAttrsStr, iframeAttrsStr) => {
      const alt = (mediaAttrsStr.match(/alt="([^"]*)"/) || [, ''])[1];
      const src = (iframeAttrsStr.match(/src="([^"]*)"/) || [, ''])[1];
      const width = (iframeAttrsStr.match(/width="([^"]*)"/) || [, ''])[1];
      const height = (iframeAttrsStr.match(/height="([^"]*)"/) || [, ''])[1];
      return renderEmbedHtml({
        embedSrc: src, width, height,
        title: alt.replace(/[_-]+/g, ' '),
        embedMap: context.embedMap || {},
      });
    }
  );
```

- [ ] **Step 6: Implement — figure media path**

In the figure renderer (~`:1201-1219`), after computing `mediaContent`, add an iframe branch mirroring Step 4 before the `imageMatch` block (figures rarely wrap iframes in biology, but this keeps the family complete and physics-safe):

```javascript
    const iframeMatch = mediaContent.match(/<iframe([^>]*)\/?>/);
    if (iframeMatch) {
      const a = parseAttributes(iframeMatch[1]);
      lines.push(renderEmbedHtml({
        embedSrc: a.src || '', width: a.width || '', height: a.height || '',
        title: (mediaAttrs.alt || '').replace(/[_-]+/g, ' '),
        embedMap: context.embedMap || EMBED_MAP,
      }));
    } else if (imageMatch) {
      // ... existing image branch ...
    }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tools/__tests__/cnxml-render.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tools/cnxml-render.js tools/lib/cnxml-elements.js tools/__tests__/cnxml-render.test.js
git commit -m "feat(d4): render <iframe> embeds as resolved responsive iframes (3 render sites)"
```

---

### Task 6: End-to-end — biology mapping + characterization, full suite green

**Files:**
- Create: `books/liffraedi-2e/embed-mapping.json` (generated by the Task 1 tool, committed)
- Modify: `tools/__tests__/render-characterization.test.js` (add a biology iframe case)
- Test: round-trip via the characterization spec + full `npm test`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a committed biology embed mapping and a regression test pinning extract→inject→render iframe survival.

- [ ] **Step 1: Generate the biology mapping (networked, one-time — NOT for an offline executor)**

> ⚠️ This single step needs network access (it follows the `/l/` redirects). Do not dispatch it to an offline subagent; run it in an environment with network. Every other step is offline.

Run: `node tools/resolve-embeds.js --book liffraedi-2e --verbose`
Expected: `Found 44 distinct iframe src(s)…` (51 occurrences across ~44 distinct slugs) and `Wrote books/liffraedi-2e/embed-mapping.json`. Inspect the file — every entry should be `status: "ok"` with a `youtube.com/embed` or `phet…` resolved URL. Investigate (do not commit `ok`-faking) any `blocked`/`error` entries; if a slug is genuinely dead, leave it recorded as non-`ok` (render will fail loud on it, surfacing the dead link for editorial follow-up — log it to the out-of-scope register).

- [ ] **Step 2: Write the failing characterization test**

Add to `tools/__tests__/render-characterization.test.js` a biology case using inline CNXML + an injected `embedMap` (no network, no file dependency):

```javascript
it('liffraedi-2e: renders an inline PhET/YouTube iframe embed', () => {
  const embedMap = {
    'https://www.openstax.org/l/diet_detective': {
      resolved: 'https://www.youtube.com/embed/xyz', kind: 'youtube', status: 'ok',
    },
  };
  const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml"><content>
    <note id="n1" class="interactive"><para id="p1">Horfðu á myndbandið
      <media id="m1" alt="diet_detective"><iframe width="660" height="371.4"
        src="https://www.openstax.org/l/diet_detective"/></media>.</para></note>
  </content></document>`;
  const { html } = renderCnxmlToHtml(cnxml, { bookSlug: 'liffraedi-2e', chapter: 29, embedMap });
  expect(html).toContain('class="embed-responsive"');
  expect(html).toContain('https://www.youtube.com/embed/xyz');
  expect(html).not.toContain('openstax.org/l/');
});
```

- [ ] **Step 3: Run it to verify pass (proves the inline-in-note path works end to end)**

Run: `npx vitest run tools/__tests__/render-characterization.test.js -t "iframe embed"`
Expected: PASS.

> **Why this test is the real arbiter (Task 3 green ≠ biology proven).** `buildNoteDom` (`cnxml-inject.js:2820`) replaces each note `<para>` via `getSeg()` (its translated text carries `[[MEDIA:n]]`, restored by `reverseInlineMarkup` → `buildMediaElement`, fixed in Task 3) — so **inline-in-note** embeds (most of biology's) flow through Task 3. But a `<media>` placed **directly in a note** (not inside a para) is *preserved verbatim from the original CNXML* by `buildNoteDom` (it keeps non-para/list/figure children untouched) — it never reaches `buildMedia`, so **render** (Task 5's `renderMedia`) is what handles it. This characterization spec exercises the real note→para→media pipeline; if it FAILS with the embed leaking as raw CNXML or a placeholder, trace which path the fixture took (`getSeg`/`reverseInlineMarkup` for inline; the preserved-CNXML render path for block) and fix there.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all green. Pay attention to `css-contract.test.js` and the per-book characterization specs (D6) — re-rendering other books now emits their embeds too; confirm no regression.

- [ ] **Step 5: Commit**

```bash
git add books/liffraedi-2e/embed-mapping.json tools/__tests__/render-characterization.test.js
git commit -m "test(d4): biology embed-mapping + iframe characterization (extract→inject→render)"
```

---

### Task 7: Docs, roadmap, memory, and [VEFUR] handoff

**Files:**
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (mark D4 done; record any out-of-scope finds)
- Modify: project memory `MEMORY.md` + a topic file (D4 outcome, next item)
- Modify: `CLAUDE.md` workflow table if a new tool command is worth surfacing (`resolve-embeds.js`)

- [ ] **Step 1: Mark D4 done in the roadmap**

In `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`, change the D4 heading to `✅ DONE (PR #NNN)` with a one-line shipped summary (mirror the D6 entry style), and append any issues discovered to the Out-of-scope register per `feedback-log-out-of-scope-issues`.

- [ ] **Step 2: Document the [VEFUR] CSS handoff**

The render emits `.embed-responsive` (aspect-ratio iframe wrapper) and `.embed-fallback` (the "Opna í nýjum glugga" link). These need selectors in namsbokasafn-vefur `static/styles/content.css`. **Do not edit vefur here.** Record the handoff: read vefur's `CLAUDE.md` + memory index first, then add to vefur's memory `css-cross-book-gaps`. Add a suggested rule for the lead:

```css
.embed-responsive { position: relative; aspect-ratio: 16 / 9; max-width: 100%; }
.embed-responsive iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.embed-fallback { margin-top: .25rem; font-size: .9em; }
```

- [ ] **Step 3: Update memory**

Update the project `MEMORY.md` "NEXT SESSION pickup" to mark D4 done and set the next item to **D7** (with #14/#33 remaining). Add a topic file capturing the decisive `/l/`-redirect-DENY finding and the resolver-mapping architecture.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md CLAUDE.md
git commit -m "docs(d4): mark D4 done, record [VEFUR] embed-CSS handoff + out-of-scope finds"
```

- [ ] **Step 5: Open the PR**

```bash
git push -u origin feat/d4-iframe-extract-render
gh pr create --title "D4: <iframe> extract + render (resolve /l/ → embeddable URL)" --body "<summary + test evidence + live-recheck note>"
```

---

## Manual / live acceptance (post-merge, not a unit gate)

1. Deploy + re-render biology: `node tools/cnxml-render.js --book liffraedi-2e --chapter 29` (and any other chapters with embeds), then sync to vefur (`node scripts/sync-content.js` from vefur — auto-sync Action is unconfigured).
2. Open module m66594 on namsbokasafn.is; confirm the `diet_detective` video iframe **actually plays** (not just that the `<iframe>` element exists) and the fallback link works. Note: a `status:"ok"` entry is header-framable but a specific YouTube video can still refuse embedding with no header signal ("Video unavailable") — the fallback link is the mitigation, so spot-check a few embeds play.
3. Confirm the [VEFUR] CSS makes the embed responsive (no overflow on mobile width).

## Self-review notes (author)

- **Spec coverage:** resolver tool + committed mapping (Task 1) ✓; extract inline+block (Task 2) ✓; inject faithful re-emit, both builders (Task 3) ✓; shared render helper + fail-loud (Task 4) ✓; three render sites + mapping threading (Task 5) ✓; biology mapping + characterization + regression (Task 6) ✓; [VEFUR] handoff + docs (Task 7) ✓. Two-tier acceptance ✓ (unit in Tasks 4–6, live in Manual section).
- **Type consistency:** `embedSrc`/`width`/`height` discriminator used identically in extract (Task 2), inject builders (Task 3), and render sites (Task 5); `renderEmbedHtml({embedSrc,width,height,title,embedMap})` signature identical across Tasks 4–6; `loadEmbedMapping(bookSlug)`/mapping shape `{resolved,kind,status}` identical in Tasks 1, 4, 5.
- **Known follow-up flagged, not silently dropped:** iframe `title` uses humanized `@alt` (slug), not wrapping-`<para>` text — threading para context through the inline-media regex is larger than D4 warrants; logged as an out-of-scope refinement (Task 7). Surface to the user.
