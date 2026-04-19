# Organic Chemistry Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rendering pipeline handle lifraen-efnafraedi's newer OpenStax format: inline section exercises, linked key-terms, and external exercise content via os-embed resolution.

**Architecture:** Three independent fixes. Fix 3 (section exercises) is a config change + 2-line render logic. Fix 2 (key-terms) is a fallback code path in the glossary compilation. Fix 1 (exercise resolver) is a new CLI tool + render integration. All detect format automatically — no breaking changes to older books.

**Tech Stack:** Node.js (ES modules), OpenStax Exercises API, vanilla HTML rendering

**Spec:** `docs/superpowers/specs/2026-03-30-organic-chemistry-compat-design.md`

---

### Task 1: Per-book section exercise handling

**Files:**
- Modify: `tools/lib/book-rendering-config.js`
- Modify: `tools/cnxml-render.js`

- [ ] **Step 1: Read the current config and render code**

Read `tools/lib/book-rendering-config.js` lines 223-267 (ORGANIC_CHEMISTRY_CONFIG) and `tools/cnxml-render.js` lines 476-510 (renderContent function where excludedSectionClasses is applied).

- [ ] **Step 2: Add sectionExercises option to organic chemistry config**

In `tools/lib/book-rendering-config.js`, add `sectionExercises: 'both'` to the ORGANIC_CHEMISTRY_CONFIG object (inside the config, alongside `excludedSectionClasses`):

```javascript
const ORGANIC_CHEMISTRY_CONFIG = {
  // ... existing properties ...

  // 'both' = keep exercises inline in sections AND compile to EOC page
  // 'compiled' (default for other books) = strip from sections, compile only
  sectionExercises: 'both',

  excludedSectionClasses: [
    'summary',
    'key-terms',
    'section-exercises',
    'additional-problems',
    'chemistry-matters',
  ],
  // ...
};
```

- [ ] **Step 3: Update renderContent to check sectionExercises config**

In `tools/cnxml-render.js`, find the `renderContent()` function (around line 476). The code currently builds `EXCLUDED_SECTION_CLASSES` from config:

```javascript
const EXCLUDED_SECTION_CLASSES = BOOK_CONFIG
  ? BOOK_CONFIG.excludedSectionClasses
  : ['summary', 'key-equations', 'exercises'];
```

Replace with:

```javascript
let EXCLUDED_SECTION_CLASSES = BOOK_CONFIG
  ? [...BOOK_CONFIG.excludedSectionClasses]
  : ['summary', 'key-equations', 'exercises'];

// If sectionExercises is 'both', keep section-exercises inline (don't exclude them)
if (BOOK_CONFIG && BOOK_CONFIG.sectionExercises === 'both') {
  EXCLUDED_SECTION_CLASSES = EXCLUDED_SECTION_CLASSES.filter(
    (cls) => cls !== 'section-exercises'
  );
}
```

This removes `section-exercises` from the exclusion list for organic chemistry, so exercises remain inline in each section page. The end-of-chapter compilation still works because `extractEndOfChapterSections()` reads from the CNXML directly, not from what renderContent outputs.

- [ ] **Step 4: Verify with organic chemistry ch03**

```bash
node tools/cnxml-render.js --book lifraen-efnafraedi --chapter 3 --module m00035
```

Then check the rendered section 3.4 HTML for inline exercises:

```bash
grep -c 'class="exercise\|exer-\|class="problem"' books/lifraen-efnafraedi/05-publication/mt-preview/chapters/03/3-4-nafngiftir-alkana.html
```

Expected: > 0 (should have 4 exercises).

- [ ] **Step 5: Verify efnafraedi-2e is unchanged**

```bash
node tools/cnxml-render.js --book efnafraedi-2e --chapter 1
grep -c 'class="exercise\|class="problem"' books/efnafraedi-2e/05-publication/mt-preview/chapters/01/1-4-maelingar.html
```

Expected: 0 (exercises still compiled, not inline).

- [ ] **Step 6: Run tests and commit**

```bash
npm test
git add tools/lib/book-rendering-config.js tools/cnxml-render.js
git commit -m "feat(render): keep section exercises inline for organic chemistry"
```

---

### Task 2: Key terms fallback renderer

**Files:**
- Modify: `tools/cnxml-render.js`

- [ ] **Step 1: Read the current glossary compilation code**

Read `tools/cnxml-render.js` lines 3146-3205 (the glossary compilation block) and lines 3104-3145 (the end-of-chapter section rendering loop). Understand:
- The condition at line 3153: `if (chapterGlossary.length > 0)`
- How `writeCompiledGlossary()` writes to `{chapter}-key-terms.html`
- How `extractEndOfChapterSections()` at line 1940-1966 extracts `<section class="key-terms">`
- How `buildHtmlDocument()` creates a full page

- [ ] **Step 2: Add fallback after the glossary condition**

After the `if (chapterGlossary.length > 0) { ... } else if (args.verbose) { ... }` block (around line 3204), add a fallback that looks for a `<section class="key-terms">` in the end-of-chapter sections:

```javascript
      // Fallback: if no <glossary> definitions found, check for <section class="key-terms">
      // (used by newer OpenStax books like Organic Chemistry)
      if (chapterGlossary.length === 0) {
        const lastModuleId = allModules[allModules.length - 1];
        const lastModulePath = translatedCnxmlPath(args.track, chapterDir, lastModuleId);

        if (fs.existsSync(lastModulePath)) {
          const lastCnxml = fs.readFileSync(lastModulePath, 'utf-8');
          const keyTermsMatch = lastCnxml.match(
            /<section\s+[^>]*class="key-terms"[^>]*>([\s\S]*?)<\/section>/
          );

          if (keyTermsMatch) {
            // Extract list items — each is a <link> to a term in another module
            const items = extractNestedElements(keyTermsMatch[1], 'item');
            const termLines = [];

            for (const item of items) {
              // item.content is like: <link document="m00032" target-id="term-00006">alcohol</link>
              const linkMatch = item.content.match(
                /<link\s+document="([^"]+)"(?:\s+target-id="([^"]+)")?[^>]*>([^<]+)<\/link>/
              );
              if (linkMatch) {
                const termText = linkMatch[3].trim();
                // Link to the module's section page
                const moduleId = linkMatch[1];
                const sectionInfo = moduleSections[moduleId];
                const sectionSlug = sectionInfo
                  ? getOutputFilename(moduleId, args.chapter, moduleSections).replace('.html', '')
                  : moduleId;
                termLines.push(
                  `<li><a href="/content/${BOOK_SLUG}/chapters/${chapterStr}/${sectionSlug}.html">${escapeHtml(termText)}</a></li>`
                );
              } else {
                // Plain text item without link
                const plainText = item.content.replace(/<[^>]+>/g, '').trim();
                if (plainText) {
                  termLines.push(`<li>${escapeHtml(plainText)}</li>`);
                }
              }
            }

            if (termLines.length > 0) {
              const keyTermsHtml = `<section class="key-terms-section">\n<h2>Lykilhugtök</h2>\n<ul class="key-terms-list">\n${termLines.join('\n')}\n</ul>\n</section>`;

              const fullKeyTermsHtml = buildHtmlDocument({
                title: 'Lykilhugtök',
                lang: args.lang,
                content: keyTermsHtml,
                pageData: {
                  moduleId: `${chapterStr}-key-terms`,
                  chapter: args.chapter,
                  section: `${args.chapter}.0`,
                  title: 'Lykilhugtök',
                  equations: [],
                  terms: {},
                },
                sectionNumber: `${args.chapter}.0`,
                isIntro: true,
              });

              const keyTermsPath = writeCompiledGlossary(args.chapter, args.track, fullKeyTermsHtml);
              writtenFiles.push(keyTermsPath);
              console.log(`Lykilhugtök: Rendered ${termLines.length} linked terms to HTML (section-based fallback)`);
              console.log(`  → ${keyTermsPath}`);
            }
          }
        }
      }
```

Note: `extractNestedElements`, `escapeHtml`, `buildHtmlDocument`, `writeCompiledGlossary`, `getOutputFilename`, `moduleSections`, `chapterStr`, `chapterDir`, `BOOK_SLUG`, and `args` are all available in the surrounding scope.

- [ ] **Step 3: Verify with organic chemistry ch03**

```bash
node tools/cnxml-render.js --book lifraen-efnafraedi --chapter 3
ls books/lifraen-efnafraedi/05-publication/mt-preview/chapters/03/3-key-terms.html
```

Expected: File exists. Check content:

```bash
grep -c '<li>' books/lifraen-efnafraedi/05-publication/mt-preview/chapters/03/3-key-terms.html
```

Expected: ~30+ terms (the ch03 key-terms section has many items).

- [ ] **Step 4: Verify efnafraedi-2e still uses glossary path**

```bash
node tools/cnxml-render.js --book efnafraedi-2e --chapter 1 --verbose 2>&1 | grep -i "glossary\|lykilhugt"
```

Expected: "Lykilhugtök: Rendered N definitions to HTML" (glossary path, not fallback).

- [ ] **Step 5: Run tests and commit**

```bash
npm test
git add tools/cnxml-render.js
git commit -m "feat(render): add key-terms fallback for section-based format"
```

---

### Task 3: Exercise content resolver tool

**Files:**
- Create: `tools/resolve-os-embed.js`

- [ ] **Step 1: Create the resolver tool**

Create `tools/resolve-os-embed.js` as an ES module CLI tool. Follow the pattern of other tools in the `tools/` directory (e.g., `api-translate.js` for CLI arg parsing with `parseArgs`).

```javascript
#!/usr/bin/env node

/**
 * resolve-os-embed.js — Fetch exercise content from OpenStax Exercises API
 *
 * Resolves <link class="os-embed" url="#exercise/{nickname}"/> references
 * by fetching content from the public OpenStax Exercises API and caching
 * the results locally.
 *
 * Usage:
 *   node tools/resolve-os-embed.js --book lifraen-efnafraedi
 *   node tools/resolve-os-embed.js --book lifraen-efnafraedi --chapter 3
 *   node tools/resolve-os-embed.js --book lifraen-efnafraedi --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = path.join(__dirname, '..', 'books');
const API_BASE = 'https://exercises.openstax.org/api/exercises';
const RATE_LIMIT_MS = 200; // 5 requests/sec max

// ─── CLI args ────────────────────────────────────────────────

const args = process.argv.slice(2);
const bookArg = args.find((a, i) => args[i - 1] === '--book') || '';
const chapterArg = args.find((a, i) => args[i - 1] === '--chapter');
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

if (!bookArg) {
  console.error('Usage: node tools/resolve-os-embed.js --book <slug> [--chapter <num>] [--dry-run] [--verbose]');
  process.exit(1);
}

// ─── Scan for os-embed references ────────────────────────────

function findOsEmbedRefs(bookSlug, chapter) {
  const sourceDir = path.join(BOOKS_DIR, bookSlug, '01-source');
  const refs = new Set();

  const chapterDirs = chapter
    ? [`ch${String(chapter).padStart(2, '0')}`]
    : fs.readdirSync(sourceDir).filter((d) => d.startsWith('ch') || d === 'appendices');

  for (const chDir of chapterDirs) {
    const dirPath = path.join(sourceDir, chDir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.cnxml'));
    for (const file of files) {
      const cnxml = fs.readFileSync(path.join(dirPath, file), 'utf-8');
      const pattern = /url="#exercise\/([^"]+)"/g;
      let match;
      while ((match = pattern.exec(cnxml)) !== null) {
        refs.add(match[1]);
      }
    }
  }

  return [...refs].sort();
}

// ─── Fetch from API ──────────────────────────────────────────

async function fetchExercise(nickname) {
  const url = `${API_BASE}?q=nickname:${encodeURIComponent(nickname)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error ${response.status} for ${nickname}`);
  }
  return response.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Download images ─────────────────────────────────────────

async function downloadImage(imageUrl, destPath) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    console.warn(`  Warning: failed to download image: ${imageUrl}`);
    return false;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return true;
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const refs = findOsEmbedRefs(bookArg, chapterArg);
  console.log(`Found ${refs.length} unique os-embed exercise references`);

  if (refs.length === 0) {
    console.log('No os-embed references found. Nothing to do.');
    return;
  }

  // Cache directory
  const cacheDir = path.join(BOOKS_DIR, bookArg, '01-source', 'exercises');
  const mediaDir = path.join(BOOKS_DIR, bookArg, '01-source', 'media');

  if (dryRun) {
    console.log(`\nDry run — would fetch ${refs.length} exercises to ${cacheDir}`);
    for (const ref of refs.slice(0, 10)) console.log(`  ${ref}`);
    if (refs.length > 10) console.log(`  ... and ${refs.length - 10} more`);
    return;
  }

  fs.mkdirSync(cacheDir, { recursive: true });

  let fetched = 0;
  let cached = 0;
  let failed = 0;

  for (const nickname of refs) {
    const cachePath = path.join(cacheDir, `${nickname}.json`);

    // Skip if already cached
    if (fs.existsSync(cachePath)) {
      cached++;
      if (verbose) console.log(`  [cached] ${nickname}`);
      continue;
    }

    try {
      const data = await fetchExercise(nickname);

      if (!data.items || data.items.length === 0) {
        console.warn(`  [empty] ${nickname} — no items returned`);
        failed++;
        continue;
      }

      const exercise = data.items[0];

      // Download exercise images
      if (exercise.images && exercise.images.length > 0) {
        for (const img of exercise.images) {
          const imgUrl = img.url;
          const imgName = path.basename(new URL(imgUrl).pathname);
          const destPath = path.join(mediaDir, imgName);
          if (!fs.existsSync(destPath)) {
            await downloadImage(imgUrl, destPath);
            if (verbose) console.log(`    Downloaded image: ${imgName}`);
          }
        }
      }

      // Cache the exercise data
      fs.writeFileSync(cachePath, JSON.stringify(exercise, null, 2));
      fetched++;
      console.log(`  [fetched] ${nickname} (${exercise.questions?.length || 0} questions)`);

      // Rate limit
      await sleep(RATE_LIMIT_MS);
    } catch (err) {
      console.error(`  [error] ${nickname}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${fetched} fetched, ${cached} cached, ${failed} failed (${refs.length} total)`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Test the tool with a dry run**

```bash
node tools/resolve-os-embed.js --book lifraen-efnafraedi --chapter 3 --dry-run
```

Expected: "Found N unique os-embed exercise references" and a list of nicknames.

- [ ] **Step 3: Fetch exercises for chapter 3**

```bash
node tools/resolve-os-embed.js --book lifraen-efnafraedi --chapter 3 --verbose
```

Expected: JSON files cached in `books/lifraen-efnafraedi/01-source/exercises/`. Verify:

```bash
ls books/lifraen-efnafraedi/01-source/exercises/*.json | wc -l
```

- [ ] **Step 4: Commit the tool and cached data**

```bash
git add tools/resolve-os-embed.js
git commit -m "feat(tools): add os-embed exercise resolver for OpenStax API"
```

---

### Task 4: Render-time os-embed resolution

**Files:**
- Modify: `tools/cnxml-render.js`

- [ ] **Step 1: Read the exercise rendering code**

Read `tools/cnxml-render.js`:
- `renderExercise()` (lines 1346-1462) — how exercises are rendered
- `renderPara()` (lines 916-920) — how paras with os-embed content are rendered
- `processInlineContent()` — from `tools/lib/cnxml-elements.js`

The key: when a `<para>` inside a `<problem>` contains `<link class="os-embed" url="#exercise/..."/>`, we need to replace that with actual exercise content from the cached JSON.

- [ ] **Step 2: Add os-embed resolution helper**

In `tools/cnxml-render.js`, add a helper function near the top (after imports, before render functions):

```javascript
/**
 * Look up cached exercise content for an os-embed reference.
 * Returns { stimulus, questions } or null if not cached.
 */
function resolveOsEmbed(nickname) {
  // BOOKS_DIR in cnxml-render.js points to books/{bookSlug} (set at module init)
  const cachePath = path.join(BOOKS_DIR, '01-source', 'exercises', `${nickname}.json`);
  if (!fs.existsSync(cachePath)) return null;

  try {
    const exercise = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
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
}
```

Note: `BOOKS_DIR` is already available in the module scope (it's set at the top of the file based on the current book).

- [ ] **Step 3: Modify exercise problem rendering to resolve os-embed**

In the `renderExercise()` function, find where problem content is rendered (inside `renderSectionContent`). The paras extracted from the problem may contain os-embed links. Add resolution before the normal rendering.

Find the problem rendering block:
```javascript
  // Problem
  const problemMatch = exercise.content.match(/<problem([^>]*)>([\s\S]*?)<\/problem>/);
  if (problemMatch) {
```

After extracting problemMatch, check if the problem content contains an os-embed link:

```javascript
  if (problemMatch) {
    const problemId = parseAttributes(problemMatch[1]).id;
    const problemContent = problemMatch[2];

    // Check for os-embed exercise reference
    const osEmbedMatch = problemContent.match(/url="#exercise\/([^"]+)"/);
    if (osEmbedMatch) {
      const resolved = resolveOsEmbed(osEmbedMatch[1]);
      if (resolved) {
        lines.push(`  <div${problemId ? ` id="${escapeAttr(problemId)}"` : ''} class="problem">`);
        // Render stimulus (problem text)
        if (resolved.stimulus) {
          lines.push(`    <p>${resolved.stimulus}</p>`);
        }
        // Render each question as a sub-part
        const partLabels = ['(a)', '(b)', '(c)', '(d)', '(e)', '(f)'];
        for (let i = 0; i < resolved.questions.length; i++) {
          const q = resolved.questions[i];
          const label = resolved.questions.length > 1 ? `<strong>${partLabels[i] || `(${i + 1})`}</strong> ` : '';
          // stem_html may contain <img> tags — render as-is (images are from exercises.openstax.org)
          lines.push(`    <div class="exercise-part">${label}${q.stem}</div>`);
        }
        lines.push('  </div>');

        // Render solutions if public
        if (resolved.solutionsPublic && resolved.questions.some((q) => q.solutions.length > 0)) {
          lines.push('  <div class="solution">');
          for (let i = 0; i < resolved.questions.length; i++) {
            const q = resolved.questions[i];
            if (q.solutions.length > 0) {
              const label = resolved.questions.length > 1 ? `<strong>${partLabels[i] || `(${i + 1})`}</strong> ` : '';
              lines.push(`    <p>${label}${q.solutions[0]}</p>`);
            }
          }
          lines.push('  </div>');
        }

        lines.push('</div>');
        return lines.join('\n');
      }
    }

    // Normal rendering (no os-embed or not resolved)
    lines.push(`  <div${problemId ? ` id="${escapeAttr(problemId)}"` : ''} class="problem">`);
    renderSectionContent(problemContent);
    lines.push('  </div>');
  }
```

This is a targeted change to the existing `renderExercise()` function — when an os-embed link is found AND cached content exists, render the resolved content instead of the raw link.

- [ ] **Step 4: Verify exercises render with content**

First ensure exercises are cached (Task 3 should have done this for ch03). Then re-render:

```bash
node tools/cnxml-render.js --book lifraen-efnafraedi --chapter 3
```

Check that section exercises now have content:

```bash
grep -A3 'class="exercise-part"' books/lifraen-efnafraedi/05-publication/mt-preview/chapters/03/3-4-nafngiftir-alkana.html | head -15
```

Expected: HTML with actual exercise text and images instead of raw os-embed links.

Also check the compiled exercises page:

```bash
grep -c 'class="exercise-part"\|stimulus' books/lifraen-efnafraedi/05-publication/mt-preview/chapters/03/3-exercises.html
```

Expected: > 0.

- [ ] **Step 5: Verify efnafraedi-2e is unaffected**

```bash
node tools/cnxml-render.js --book efnafraedi-2e --chapter 1
grep -c 'os-embed\|exercise-part' books/efnafraedi-2e/05-publication/mt-preview/chapters/01/*.html
```

Expected: 0 os-embed, 0 exercise-part (older book has inline content rendered normally).

- [ ] **Step 6: Run tests and commit**

```bash
npm test
git add tools/cnxml-render.js
git commit -m "feat(render): resolve os-embed exercise references from cached API data"
```

---

### Task 5: Fetch all exercises and full re-render

- [ ] **Step 1: Fetch all exercises for the entire book**

```bash
node tools/resolve-os-embed.js --book lifraen-efnafraedi --verbose
```

Expected: ~400+ unique exercises fetched and cached. This may take several minutes due to rate limiting.

- [ ] **Step 2: Re-render all translated chapters**

```bash
for ch in $(ls -d books/lifraen-efnafraedi/02-for-mt/ch* | sed 's/.*ch0*//' | sort -n); do
  echo "Ch $ch..." && node tools/cnxml-render.js --book lifraen-efnafraedi --chapter $ch 2>&1 | grep -E "Rendered|Error|Lykilhugtök" | head -3
done
```

- [ ] **Step 3: Verify all three fixes**

```bash
echo "=== Key Terms page ===" && ls books/lifraen-efnafraedi/05-publication/mt-preview/chapters/03/3-key-terms.html && grep -c '<li>' books/lifraen-efnafraedi/05-publication/mt-preview/chapters/03/3-key-terms.html && echo "terms"

echo "=== Inline exercises in section 3.4 ===" && grep -c 'class="exercise-part"\|class="problem"' books/lifraen-efnafraedi/05-publication/mt-preview/chapters/03/3-4-nafngiftir-alkana.html && echo "exercise elements"

echo "=== EOC exercises page ===" && grep -c 'class="exercise-part"\|class="problem"' books/lifraen-efnafraedi/05-publication/mt-preview/chapters/03/3-exercises.html && echo "exercise elements"

echo "=== Additional problems ===" && grep -c 'class="exercise-part"\|class="problem"' books/lifraen-efnafraedi/05-publication/mt-preview/chapters/03/3-additional-problems.html && echo "exercise elements"
```

- [ ] **Step 4: Commit cached exercises and re-rendered content**

```bash
git add books/lifraen-efnafraedi/01-source/exercises/
git commit -m "data(exercises): cache resolved exercise content from OpenStax API"

git add books/lifraen-efnafraedi/05-publication/
git commit -m "chore: re-render lifraen-efnafraedi with resolved exercises, key-terms, inline exercises"
```

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: All tests pass. No regressions in other books.
