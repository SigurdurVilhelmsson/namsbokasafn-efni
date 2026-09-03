/**
 * Render Service
 *
 * Provides in-process CNXML → HTML rendering for live preview.
 * Uses dynamic import() to load the ESM rendering pipeline from tools/.
 *
 * The rendering module includes MathJax which initializes asynchronously
 * on first import (~2-3s). Subsequent renders are fast (~50-200ms).
 */

const fs = require('fs');
const path = require('path');
const log = require('../lib/logger');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Lazy-loaded ESM module (cached after first import)
let _renderModule = null;
let _initPromise = null;

/**
 * Load the ESM rendering module (lazy, cached).
 * First call takes ~2-3s (MathJax font initialization).
 * Subsequent calls return immediately.
 */
function getRenderer() {
  if (_renderModule) return Promise.resolve(_renderModule);
  if (_initPromise) return _initPromise;

  _initPromise = import(path.join(PROJECT_ROOT, 'tools', 'cnxml-render.js'))
    .then((mod) => {
      _renderModule = mod;
      _initPromise = null;
      log.info('Render module loaded (MathJax initialized)');
      return mod;
    })
    .catch((err) => {
      _initPromise = null;
      log.error({ err }, 'Failed to load render module');
      throw err;
    });

  return _initPromise;
}

/**
 * Render a single module's translated CNXML to HTML.
 *
 * @param {string} book - Book slug (e.g., 'efnafraedi-2e')
 * @param {number|string} chapter - Chapter number or 'appendices'
 * @param {string} moduleId - Module ID (e.g., 'm68664')
 * @param {string} [track='faithful'] - Translation track
 * @returns {Promise<{html: string, pageData: object}>}
 */
async function renderModule(book, chapter, moduleId, track = 'faithful') {
  const { renderCnxmlToHtml } = await getRenderer();
  const { getBookRenderConfig } = await import(
    path.join(PROJECT_ROOT, 'tools', 'lib', 'book-rendering-config.js')
  );

  // Resolve chapter directory
  const chapterStr =
    chapter === 'appendices' || chapter === -1
      ? 'appendices'
      : `ch${String(chapter).padStart(2, '0')}`;

  // Read translated CNXML
  const cnxmlPath = path.join(
    PROJECT_ROOT,
    'books',
    book,
    '03-translated',
    track,
    chapterStr,
    `${moduleId}.cnxml`
  );

  if (!fs.existsSync(cnxmlPath)) {
    throw new Error(`Translated CNXML not found: ${cnxmlPath}`);
  }

  const cnxml = fs.readFileSync(cnxmlPath, 'utf-8');

  const { loadEmbedMapping } = await import(
    path.join(PROJECT_ROOT, 'tools', 'lib', 'embed-mapping.js')
  );

  // Per-module English term maps for data-en on <dfn>.
  // 🔴 Loaded HERE, not inside the renderer: cnxml-render.js's BOOKS_DIR is a bare
  // relative literal set only in its main(), which this path never calls — and the
  // server runs with cwd=server/, where 'books/…' resolves to server/books/… and
  // misses for every book. The loader itself resolves against import.meta.url.
  // Same reason `embedMap` is passed in rather than looked up.
  const { loadChapterTermEnglish } = await import(
    path.join(PROJECT_ROOT, 'tools', 'lib', 'term-english-map.js')
  );
  const termEnglishByModule = loadChapterTermEnglish(book, chapterStr).byModule;

  // Load book config for note labels, section types, etc.
  // getBookRenderConfig throws if the book has no book-config.json — surface it
  // as a clean, book-scoped error rather than an unhandled throw.
  let bookConfig;
  try {
    bookConfig = getBookRenderConfig(book);
  } catch (err) {
    throw new Error(`Cannot render "${book}": ${err.message}`);
  }

  // Render with minimal options (no chapter-wide numbering for preview)
  const result = renderCnxmlToHtml(cnxml, {
    lang: 'is',
    chapter: chapter === 'appendices' ? -1 : Number(chapter),
    moduleId,
    track,
    bookConfig,
    embedMap: loadEmbedMapping(book),
    // THIS module's map only — never the chapter-wide union: `term-0000N` is
    // OpenStax's own id and restarts in every module.
    termEnglish: termEnglishByModule.get(moduleId) || null,
    // Chapter-wide numbering maps — empty for preview (shows "?" for cross-refs)
    chapterFigureNumbers: new Map(),
    chapterTableNumbers: new Map(),
    chapterEquationNumbers: new Map(),
    chapterExampleNumbers: new Map(),
    chapterExerciseNumbers: new Map(),
    chapterSectionTitles: new Map(),
  });

  return result;
}

/**
 * Pre-warm the renderer (optional — call at startup to avoid
 * cold start on first preview request).
 */
async function warmUp() {
  try {
    await getRenderer();
    log.info('Render service warmed up');
  } catch {
    // Non-fatal — will retry on first request
  }
}

module.exports = { renderModule, warmUp };
