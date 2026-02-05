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

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const BOOKS_DIR = path.join(PROJECT_ROOT, 'books');

// Match both marker formats
const SEG_MARKER_REGEX =
  /(?:<!--\s*SEG:([\w]+):([\w-]+):([\w-]+)\s*-->|\{\{SEG:([\w]+):([\w-]+):([\w-]+)\}\})/;
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
        currentSegment.content = contentLines.join('\n').trim();
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
    } else if (currentSegment) {
      contentLines.push(line);
    }
  }

  // Don't forget the last segment
  if (currentSegment) {
    currentSegment.content = contentLines.join('\n').trim();
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
    faithful: path.join(bookDir, '03-faithful', chapterDir, `${moduleId}-segments.is.md`),
    localized: path.join(bookDir, '04-localized', chapterDir, `${moduleId}-segments.is.md`),
    structure: path.join(bookDir, '02-structure', chapterDir, `${moduleId}-structure.json`),
    equations: path.join(bookDir, '02-structure', chapterDir, `${moduleId}-equations.json`),
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

  // Pair EN and IS segments
  const paired = enSegments.map((en) => ({
    segmentId: en.segmentId,
    moduleId: en.moduleId,
    segmentType: en.segmentType,
    elementId: en.elementId,
    en: en.content,
    is: isLookup[en.segmentId] ? isLookup[en.segmentId].content : '',
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
    const timestamp = now.toISOString().replace(/[T:]/g, '-').substring(0, 16);
    const bakPath = paths.faithful.replace('.is.md', `.${timestamp}.bak`);
    fs.copyFileSync(paths.faithful, bakPath);
  }

  // Assemble and write
  const content = assembleSegments(segments);
  fs.writeFileSync(paths.faithful, content, 'utf-8');

  return paths.faithful;
}

/**
 * List all modules available for a chapter.
 * Looks in 02-for-mt/ for EN source files.
 *
 * @param {string} book - Book slug
 * @param {number} chapter - Chapter number
 * @returns {Array<{moduleId: string, hasEnSource: boolean, hasMtOutput: boolean, hasFaithful: boolean}>}
 */
function listChapterModules(book, chapter) {
  const chapterStr = String(chapter).padStart(2, '0');
  const enDir = path.join(BOOKS_DIR, book, '02-for-mt', `ch${chapterStr}`);
  const mtDir = path.join(BOOKS_DIR, book, '02-mt-output', `ch${chapterStr}`);
  const faithfulDir = path.join(BOOKS_DIR, book, '03-faithful', `ch${chapterStr}`);

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
    };
  });
}

module.exports = {
  parseSegments,
  assembleSegments,
  getModulePaths,
  loadModuleForEditing,
  saveModuleSegments,
  listChapterModules,
  SEG_MARKER_REGEX,
  PROJECT_ROOT,
  BOOKS_DIR,
};
