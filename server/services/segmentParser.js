/**
 * Segment Parser Service
 *
 * Parses segment files (m{NNNNN}-segments.{lang}.md) into structured
 * arrays of segments. Handles both HTML comment markers (<!-- SEG:... -->)
 * and mustache markers ({{SEG:...}}).
 *
 * Segment marker format:
 *   <!-- SEG:moduleId:segmentType:segmentId -->
 *   {{SEG:moduleId:segmentType:segmentId}}
 *
 * Each marker is followed by text content until the next marker or EOF.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
let BOOKS_DIR = path.join(PROJECT_ROOT, 'books');

// Match both marker formats
const SEG_MARKER_REGEX =
  /(?:<!--\s*SEG:([\w]+):([\w-]+):([\w-]+)\s*-->|\{\{SEG:([\w]+):([\w-]+):([\w-]+)\}\})/;
/**
 * Normalize hard line wraps in segment content.
 * Joins single-newline continuation lines into spaces while preserving
 * intentional paragraph breaks (double newlines).
 *
 * @param {string} text - Raw segment content
 * @returns {string} Content with hard wraps normalized
 */
function normalizeWraps(text) {
  return text.replace(/(?<!\n)\n(?!\n)/g, ' ');
}

/**
 * Normalize term markers in IS content based on EN source.
 * MT engines (e.g. malstadur.is) convert __term__ to **term**.
 * This detects excess ** in IS (compared to EN) and converts them back to __.
 *
 * @param {string} enContent - EN source segment content
 * @param {string} isContent - IS translation segment content
 * @returns {string} IS content with term markers normalized
 */
function normalizeTermMarkers(enContent, isContent) {
  if (!enContent || !isContent) return isContent;

  const enTermCount = (enContent.match(/__(.+?)__/g) || []).length;
  if (enTermCount === 0) return isContent;

  const enBoldCount = (enContent.match(/\*\*(.+?)\*\*/g) || []).length;
  const isTermCount = (isContent.match(/__(.+?)__/g) || []).length;
  const isBoldCount = (isContent.match(/\*\*(.+?)\*\*/g) || []).length;

  const missingTerms = enTermCount - isTermCount;
  if (missingTerms <= 0) return isContent;

  const excessBold = isBoldCount - enBoldCount;
  if (excessBold <= 0) return isContent;

  const termsToConvert = Math.min(missingTerms, excessBold);
  let converted = 0;
  return isContent.replace(/\*\*(.+?)\*\*/g, (match, text) => {
    if (converted < termsToConvert) {
      converted++;
      return `__${text}__`;
    }
    return match;
  });
}

/**
 * Parse a segment file into structured segments.
 *
 * @param {string} content - Raw file content
 * @returns {Array<{segmentId: string, moduleId: string, segmentType: string, elementId: string, content: string}>}
 */
function parseSegments(content) {
  const segments = [];
  const lines = content.split('\n');
  let currentSegment = null;
  let contentLines = [];

  for (const line of lines) {
    const match = line.match(SEG_MARKER_REGEX);
    if (match) {
      // Save previous segment
      if (currentSegment) {
        currentSegment.content = normalizeWraps(contentLines.join('\n').trim());
        segments.push(currentSegment);
      }

      // Extract from whichever capture group matched (HTML comment or mustache)
      const moduleId = match[1] || match[4];
      const segmentType = match[2] || match[5];
      const elementId = match[3] || match[6];

      currentSegment = {
        segmentId: `${moduleId}:${segmentType}:${elementId}`,
        moduleId,
        segmentType,
        elementId,
        content: '',
      };
      contentLines = [];

      // Capture any text after the marker on the same line
      const remainder = line.substring(match.index + match[0].length);
      if (remainder.trim()) {
        contentLines.push(remainder.trim());
      }
    } else if (currentSegment) {
      contentLines.push(line);
    }
  }

  // Don't forget the last segment
  if (currentSegment) {
    currentSegment.content = normalizeWraps(contentLines.join('\n').trim());
    segments.push(currentSegment);
  }

  return segments;
}

/**
 * Reassemble segments back into a file string with markers.
 * Uses HTML comment format (the canonical format).
 *
 * @param {Array<{segmentId: string, content: string}>} segments
 * @returns {string}
 */
function assembleSegments(segments) {
  return segments
    .map((seg) => {
      const [moduleId, segmentType, elementId] = seg.segmentId.split(':');
      return `<!-- SEG:${moduleId}:${segmentType}:${elementId} -->\n${seg.content}`;
    })
    .join('\n\n');
}

/**
 * Build file paths for a module's segment files.
 *
 * @param {string} book - Book slug (e.g., 'efnafraedi')
 * @param {number} chapter - Chapter number
 * @param {string} moduleId - Module ID (e.g., 'm68724')
 * @returns {object} Paths to segment files
 */
function getModulePaths(book, chapter, moduleId) {
  const chapterStr = String(chapter).padStart(2, '0');
  const bookDir = path.join(BOOKS_DIR, book);
  const chapterDir = `ch${chapterStr}`;

  return {
    enSource: path.join(bookDir, '02-for-mt', chapterDir, `${moduleId}-segments.en.md`),
    mtOutput: path.join(bookDir, '02-mt-output', chapterDir, `${moduleId}-segments.is.md`),
    faithful: path.join(
      bookDir,
      '03-faithful-translation',
      chapterDir,
      `${moduleId}-segments.is.md`
    ),
    localized: path.join(bookDir, '04-localized-content', chapterDir, `${moduleId}-segments.is.md`),
    structure: path.join(bookDir, '02-structure', chapterDir, `${moduleId}-structure.json`),
    equations: path.join(bookDir, '02-structure', chapterDir, `${moduleId}-equations.json`),
    manifest: path.join(bookDir, '02-structure', chapterDir, `${moduleId}-manifest.json`),
  };
}

/**
 * Load and parse a module's segments for editing.
 * Returns EN source segments paired with IS translation segments.
 *
 * @param {string} book - Book slug
 * @param {number} chapter - Chapter number
 * @param {string} moduleId - Module ID
 * @returns {object} Paired segments and metadata
 */
function loadModuleForEditing(book, chapter, moduleId) {
  const paths = getModulePaths(book, chapter, moduleId);

  // Load EN source (required)
  if (!fs.existsSync(paths.enSource)) {
    throw new Error(`EN source not found: ${paths.enSource}`);
  }
  const enContent = fs.readFileSync(paths.enSource, 'utf-8');
  const enSegments = parseSegments(enContent);

  // Load IS translation (from faithful if exists, else mt-output)
  let isSegments = [];
  let isSource = null;
  if (fs.existsSync(paths.faithful)) {
    isSegments = parseSegments(fs.readFileSync(paths.faithful, 'utf-8'));
    isSource = 'faithful';
  } else if (fs.existsSync(paths.mtOutput)) {
    isSegments = parseSegments(fs.readFileSync(paths.mtOutput, 'utf-8'));
    isSource = 'mt-output';
  }

  // Build lookup of IS segments by segmentId
  const isLookup = {};
  for (const seg of isSegments) {
    isLookup[seg.segmentId] = seg;
  }

  // Load equations if available
  let equations = {};
  if (fs.existsSync(paths.equations)) {
    equations = JSON.parse(fs.readFileSync(paths.equations, 'utf-8'));
  }

  // Load structure for title metadata
  let structure = null;
  if (fs.existsSync(paths.structure)) {
    structure = JSON.parse(fs.readFileSync(paths.structure, 'utf-8'));
  }

  // Load extraction manifest for version tracking
  let manifest = null;
  if (fs.existsSync(paths.manifest)) {
    manifest = JSON.parse(fs.readFileSync(paths.manifest, 'utf-8'));
  }

  // Pair EN and IS segments
  const paired = enSegments.map((en) => ({
    segmentId: en.segmentId,
    moduleId: en.moduleId,
    segmentType: en.segmentType,
    elementId: en.elementId,
    en: en.content,
    is: isLookup[en.segmentId]
      ? normalizeTermMarkers(en.content, isLookup[en.segmentId].content)
      : '',
    hasTranslation: !!isLookup[en.segmentId],
  }));

  return {
    book,
    chapter,
    moduleId,
    isSource,
    title: structure ? structure.title?.text : moduleId,
    segments: paired,
    equations,
    segmentCount: paired.length,
    translatedCount: paired.filter((s) => s.hasTranslation).length,
    extractedAt: manifest?.extractedAt || null,
    sourceHash: manifest?.sourceHash || null,
  };
}

/**
 * Save edited IS segments back to the faithful directory.
 *
 * @param {string} book - Book slug
 * @param {number} chapter - Chapter number
 * @param {string} moduleId - Module ID
 * @param {Array<{segmentId: string, content: string}>} segments - Edited IS segments
 * @returns {string} Path to saved file
 */
function saveModuleSegments(book, chapter, moduleId, segments) {
  const paths = getModulePaths(book, chapter, moduleId);
  const faithfulDir = path.dirname(paths.faithful);

  // Ensure directory exists
  if (!fs.existsSync(faithfulDir)) {
    fs.mkdirSync(faithfulDir, { recursive: true });
  }

  // Create backup if file exists
  if (fs.existsSync(paths.faithful)) {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[T:]/g, '-').substring(0, 19);
    const bakPath = paths.faithful.replace('.is.md', `.${timestamp}.bak`);
    fs.copyFileSync(paths.faithful, bakPath);
  }

  // Atomic write: write to temp file then rename (rename is atomic on Linux within same FS)
  const content = assembleSegments(segments);
  const tmpPath = paths.faithful + '.tmp.' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, paths.faithful);

  return paths.faithful;
}

/**
 * Load a module for localization editing (Pass 2).
 * Returns EN (reference), faithful IS (source), and localized IS (editable).
 *
 * @param {string} book - Book slug
 * @param {number} chapter - Chapter number
 * @param {string} moduleId - Module ID
 * @returns {object} Three-way paired segments and metadata
 */
function loadModuleForLocalization(book, chapter, moduleId) {
  const paths = getModulePaths(book, chapter, moduleId);

  // Load EN source (reference)
  if (!fs.existsSync(paths.enSource)) {
    throw new Error(`EN source not found: ${paths.enSource}`);
  }
  const enSegments = parseSegments(fs.readFileSync(paths.enSource, 'utf-8'));

  // Load faithful IS (required — this is the source for localization)
  if (!fs.existsSync(paths.faithful)) {
    throw new Error(
      `Faithful translation not found for ${moduleId}. Complete Pass 1 before localizing.`
    );
  }
  const faithfulSegments = parseSegments(fs.readFileSync(paths.faithful, 'utf-8'));

  // Load localized IS (optional — may not exist yet)
  let localizedSegments = [];
  let hasLocalized = false;
  if (fs.existsSync(paths.localized)) {
    localizedSegments = parseSegments(fs.readFileSync(paths.localized, 'utf-8'));
    hasLocalized = true;
  }

  // Build lookups
  const faithfulLookup = {};
  for (const seg of faithfulSegments) {
    faithfulLookup[seg.segmentId] = seg;
  }
  const localizedLookup = {};
  for (const seg of localizedSegments) {
    localizedLookup[seg.segmentId] = seg;
  }

  // Load equations if available
  let equations = {};
  if (fs.existsSync(paths.equations)) {
    equations = JSON.parse(fs.readFileSync(paths.equations, 'utf-8'));
  }

  // Load structure for title metadata
  let structure = null;
  if (fs.existsSync(paths.structure)) {
    structure = JSON.parse(fs.readFileSync(paths.structure, 'utf-8'));
  }

  // Three-way pair: EN (reference) | faithful IS (source) | localized IS (editable)
  const paired = enSegments.map((en) => {
    const faithful = faithfulLookup[en.segmentId];
    const localized = localizedLookup[en.segmentId];
    return {
      segmentId: en.segmentId,
      moduleId: en.moduleId,
      segmentType: en.segmentType,
      elementId: en.elementId,
      en: en.content,
      faithful: faithful ? normalizeTermMarkers(en.content, faithful.content) : '',
      localized: localized ? localized.content : '',
      hasFaithful: !!faithful,
      hasLocalized: !!localized,
    };
  });

  // Include file mtime for conflict detection
  let lastModified = null;
  if (hasLocalized) {
    try {
      lastModified = fs.statSync(paths.localized).mtimeMs;
    } catch {
      // stat failed — leave null
    }
  }

  return {
    book,
    chapter,
    moduleId,
    hasLocalized,
    lastModified,
    title: structure ? structure.title?.text : moduleId,
    segments: paired,
    equations,
    segmentCount: paired.length,
    faithfulCount: paired.filter((s) => s.hasFaithful).length,
    localizedCount: paired.filter((s) => s.hasLocalized).length,
  };
}

/**
 * Save localized IS segments to the 04-localized-content directory.
 *
 * @param {string} book - Book slug
 * @param {number} chapter - Chapter number
 * @param {string} moduleId - Module ID
 * @param {Array<{segmentId: string, content: string}>} segments - Localized IS segments
 * @returns {string} Path to saved file
 */
function saveLocalizedSegments(book, chapter, moduleId, segments) {
  const paths = getModulePaths(book, chapter, moduleId);
  const localizedDir = path.dirname(paths.localized);

  // Ensure directory exists
  if (!fs.existsSync(localizedDir)) {
    fs.mkdirSync(localizedDir, { recursive: true });
  }

  // Create backup if file exists
  if (fs.existsSync(paths.localized)) {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[T:]/g, '-').substring(0, 19);
    const bakPath = paths.localized.replace('.is.md', `.${timestamp}.bak`);
    fs.copyFileSync(paths.localized, bakPath);
  }

  // Atomic write: write to temp file then rename (rename is atomic on Linux within same FS)
  const content = assembleSegments(segments);
  const tmpPath = paths.localized + '.tmp.' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, paths.localized);

  return paths.localized;
}

/**
 * Get the mtime (in ms) of the localized file, or null if it doesn't exist.
 *
 * @param {string} book - Book slug
 * @param {number} chapter - Chapter number
 * @param {string} moduleId - Module ID
 * @returns {number|null}
 */
function getLocalizedMtime(book, chapter, moduleId) {
  const paths = getModulePaths(book, chapter, moduleId);
  try {
    return fs.statSync(paths.localized).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * List all modules available for a chapter.
 * Looks in 02-for-mt/ for EN source files.
 *
 * @param {string} book - Book slug
 * @param {number} chapter - Chapter number
 * @returns {Array<{moduleId: string, hasEnSource: boolean, hasMtOutput: boolean, hasFaithful: boolean, hasLocalized: boolean}>}
 */
/**
 * List chapters available for a given book by scanning the 02-for-mt directory.
 *
 * @param {string} book - Book slug (e.g. 'efnafraedi')
 * @returns {number[]} Sorted array of chapter numbers
 */
function listChapters(book) {
  const mtDir = path.join(BOOKS_DIR, book, '02-for-mt');
  if (!fs.existsSync(mtDir)) {
    return [];
  }
  return fs
    .readdirSync(mtDir)
    .filter((d) => /^ch\d+$/.test(d))
    .map((d) => parseInt(d.replace('ch', ''), 10))
    .sort((a, b) => a - b);
}

function listChapterModules(book, chapter) {
  const chapterStr = String(chapter).padStart(2, '0');
  const enDir = path.join(BOOKS_DIR, book, '02-for-mt', `ch${chapterStr}`);
  const mtDir = path.join(BOOKS_DIR, book, '02-mt-output', `ch${chapterStr}`);
  const faithfulDir = path.join(BOOKS_DIR, book, '03-faithful-translation', `ch${chapterStr}`);
  const localizedDir = path.join(BOOKS_DIR, book, '04-localized-content', `ch${chapterStr}`);

  if (!fs.existsSync(enDir)) {
    return [];
  }

  const files = fs.readdirSync(enDir).filter((f) => f.endsWith('-segments.en.md'));

  return files.map((f) => {
    const moduleId = f.replace('-segments.en.md', '');
    return {
      moduleId,
      hasEnSource: true,
      hasMtOutput: fs.existsSync(path.join(mtDir, `${moduleId}-segments.is.md`)),
      hasFaithful: fs.existsSync(path.join(faithfulDir, `${moduleId}-segments.is.md`)),
      hasLocalized: fs.existsSync(path.join(localizedDir, `${moduleId}-segments.is.md`)),
    };
  });
}

/** @internal Test-only: override BOOKS_DIR for isolated tests */
function _setTestBooksDir(dir) {
  BOOKS_DIR = dir;
}

module.exports = {
  normalizeWraps,
  normalizeTermMarkers,
  parseSegments,
  assembleSegments,
  getModulePaths,
  loadModuleForEditing,
  saveModuleSegments,
  loadModuleForLocalization,
  saveLocalizedSegments,
  getLocalizedMtime,
  listChapters,
  listChapterModules,
  SEG_MARKER_REGEX,
  PROJECT_ROOT,
  get BOOKS_DIR() {
    return BOOKS_DIR;
  },
  _setTestBooksDir,
};
