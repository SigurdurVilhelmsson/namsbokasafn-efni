#!/usr/bin/env node

/**
 * docx-import.js
 *
 * Import human translations from Word (.docx) files into the pipeline.
 * Aligns docx paragraphs with CNXML segments extracted by cnxml-extract.js,
 * producing per-module IS segment files in 02-mt-output/.
 *
 * Usage:
 *   node tools/docx-import.js --docx <file.docx> --book <slug> --chapter <num> [options]
 *
 * Options:
 *   --docx <file>      Path to the Word document
 *   --book <slug>      Book slug (e.g., liffraedi-2e)
 *   --chapter <num>    Chapter number
 *   --dry-run          Show alignment without writing files
 *   --verbose          Show detailed matching info
 *   --report           Generate alignment report JSON
 *   --extract-images   Extract and rename images from docx
 *   -h, --help         Show this help
 */

import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';

// =====================================================================
// ARGUMENT PARSING
// =====================================================================

function parseArgs(args) {
  const result = {
    docx: null,
    book: 'liffraedi-2e',
    chapter: null,
    dryRun: false,
    verbose: false,
    report: false,
    extractImages: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') result.help = true;
    else if (arg === '--verbose') result.verbose = true;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--report') result.report = true;
    else if (arg === '--extract-images') result.extractImages = true;
    else if (arg === '--docx' && args[i + 1]) result.docx = args[++i];
    else if (arg === '--book' && args[i + 1]) result.book = args[++i];
    else if (arg === '--chapter' && args[i + 1]) result.chapter = parseInt(args[++i], 10);
  }

  return result;
}

function printHelp() {
  console.log(`
Usage: node tools/docx-import.js --docx <file.docx> --book <slug> --chapter <num> [options]

Import human translations from Word documents into the pipeline.

Options:
  --docx <file>        Path to the Word document
  --book <slug>        Book slug (default: liffraedi-2e)
  --chapter <num>      Chapter number
  --dry-run            Show alignment without writing files
  --verbose            Show detailed matching info
  --report             Generate alignment report JSON
  --extract-images     Extract and rename images from docx
  -h, --help           Show this help
  `);
}

// =====================================================================
// STAGE 1: PARSE DOCX
// =====================================================================

/**
 * Parse a docx file into ordered text blocks with type detection.
 * @param {string} docxPath - Path to the docx file
 * @returns {Promise<Array<{text: string, type: string, index: number}>>}
 */
async function parseDocx(docxPath) {
  const result = await mammoth.extractRawText({ path: docxPath });
  const rawLines = result.value.split('\n');

  const blocks = [];
  let index = 0;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const type = classifyBlock(trimmed);
    blocks.push({ text: trimmed, type, index: index++ });
  }

  return blocks;
}

/**
 * Classify a text block by its content pattern.
 * @param {string} text - The text content
 * @returns {string} Block type
 */
function classifyBlock(text) {
  // Section heading: "3.1 Title..." or "3.12 Title..."
  if (/^\d+\.\d+\s+/.test(text)) return 'section-heading';

  // Chapter title: "Kafli N ..."
  if (/^Kafli\s+\d+\s+/i.test(text)) return 'chapter-title';

  // Figure caption: "Mynd 3.N ..." or "Myndi 3.N ..." (typo in source)
  if (/^Myndi?\s+\d+\.\d+/i.test(text)) return 'figure-caption';

  // Table marker: "Tafla 3.N ..."
  if (/^Tafla\s+\d+\.\d+/i.test(text)) return 'table-marker';

  // "Lærdómsmarkmið" standalone label (no corresponding segment — skip)
  if (/^Lærdómsmarkmið:?\s*$/i.test(text)) return 'objectives-label';

  // Learning objectives intro (the actual abstract text)
  if (/^(Í lok þessa kafla|Eftir þennan kafla)/i.test(text)) return 'objectives-intro';

  // Section structure / TOC
  if (/^Kaflauppsetning$/i.test(text)) return 'toc-header';

  // "Inngangur" (Introduction)
  if (/^Inngangur$/i.test(text)) return 'intro-title';

  // Visual/interactive link references
  if (/^(Sjónræn tenging|Lærdómshlekkur|Þróunartenging|LÆRDÓMSHLEKKUR)/i.test(text))
    return 'note-heading';

  // Default: paragraph
  return 'paragraph';
}

// =====================================================================
// STAGE 2: LOAD EN SEGMENTS
// =====================================================================

/**
 * Parse segments from a segment markdown file.
 * Reuses the same regex as cnxml-inject.js:parseSegments() (line 166).
 * @param {string} content - Segments markdown content
 * @returns {Array<{segmentId: string, text: string, type: string, moduleId: string}>}
 */
function parseSegmentFile(content) {
  const segments = [];
  const pattern = /<!-- SEG:([^\s]+) -->[ \t]*\n?([\s\S]*?)(?=<!-- SEG:|$)/g;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const segmentId = match[1];
    const text = match[2].trim();
    const parts = segmentId.split(':');
    const moduleId = parts[0];
    const type = parts[1]; // title, para, caption, abstract, abstract-item, problem, solution, etc.

    segments.push({ segmentId, text, type, moduleId });
  }

  return segments;
}

/**
 * Load all EN segments for a chapter, ordered by module.
 * @param {string} booksDir - Books directory path
 * @param {number} chapter - Chapter number
 * @returns {Array<{segmentId: string, text: string, type: string, moduleId: string}>}
 */
function loadEnSegments(booksDir, chapter) {
  const chapterDir = `ch${String(chapter).padStart(2, '0')}`;
  const segDir = path.join(booksDir, '02-for-mt', chapterDir);

  if (!fs.existsSync(segDir)) {
    throw new Error(`Segment directory not found: ${segDir}`);
  }

  const files = fs.readdirSync(segDir)
    .filter(f => f.endsWith('-segments.en.md'))
    .sort();

  const allSegments = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(segDir, file), 'utf-8');
    const segments = parseSegmentFile(content);
    allSegments.push(...segments);
  }

  return allSegments;
}

/**
 * Load module metadata from book JSON to get section numbers.
 * @param {string} bookSlug - Book slug
 * @param {number} chapter - Chapter number
 * @returns {Map<string, {section: string, title: string}>} moduleId → metadata
 */
function loadModuleMetadata(bookSlug, chapter) {
  const bookJsonPath = path.join('server/data',
    bookSlug === 'liffraedi-2e' ? 'biology-2e.json' :
    bookSlug === 'efnafraedi-2e' ? 'chemistry-2e.json' :
    `${bookSlug}.json`
  );

  if (!fs.existsSync(bookJsonPath)) {
    throw new Error(`Book JSON not found: ${bookJsonPath}`);
  }

  const bookData = JSON.parse(fs.readFileSync(bookJsonPath, 'utf-8'));
  const chapterData = bookData.chapters.find(c => c.chapter === chapter);

  if (!chapterData) {
    throw new Error(`Chapter ${chapter} not found in ${bookJsonPath}`);
  }

  const map = new Map();
  for (const mod of chapterData.modules) {
    map.set(mod.id, { section: mod.section, title: mod.title });
  }
  return map;
}

// =====================================================================
// STAGE 3: ALIGNMENT
// =====================================================================

// Segment types that are NOT expected in a human translation docx
const SKIP_SEGMENT_TYPES = new Set([
  'problem',
  'solution',
  'glossary-term',
  'glossary-def',
]);

/**
 * Determine if a segment type indicates a section that the translator
 * likely didn't include (e.g., exercises, glossary, section summaries).
 */
function isSkippableSegment(seg, enSegments, idx) {
  if (SKIP_SEGMENT_TYPES.has(seg.type)) return true;

  // Skip "Section Summary", "Review Questions", "Critical Thinking Questions" titles
  // and their content
  if (seg.type === 'title') {
    const text = seg.text.toLowerCase();
    if (text === 'section summary' || text === 'review questions' ||
        text === 'critical thinking questions' || text === 'free response') {
      return true;
    }
  }

  return false;
}

/**
 * Check if a segment is a title for a skippable section.
 * Returns true if this title starts a run of content we should skip.
 */
function isSkippableSectionTitle(seg) {
  if (seg.type !== 'title') return false;
  const text = seg.text.toLowerCase();
  return text === 'section summary' || text === 'review questions' ||
         text === 'critical thinking questions' || text === 'free response';
}

/**
 * Build a map from section number to module ID.
 * @param {Map} moduleMetadata
 * @returns {Map<string, string>} section → moduleId
 */
function buildSectionToModuleMap(moduleMetadata) {
  const map = new Map();
  for (const [moduleId, meta] of moduleMetadata) {
    map.set(meta.section, moduleId);
  }
  return map;
}

/**
 * Extract the section number from a docx section heading.
 * "3.1 Myndun Lífrænna Stórsameinda" → "3.1"
 */
function extractSectionNumber(text) {
  const match = text.match(/^(\d+\.\d+)\s/);
  return match ? match[1] : null;
}

/**
 * Extract figure number from a docx caption.
 * "Mynd 3.12 ..." → "3.12"
 */
function extractFigureNumber(text) {
  const match = text.match(/^Myndi?\s+(\d+\.\d+)/i);
  return match ? match[1] : null;
}

/**
 * Align docx blocks with EN segments.
 * Returns an array of alignment entries.
 *
 * @param {Array} docxBlocks - Parsed docx blocks
 * @param {Array} enSegments - All EN segments in chapter order
 * @param {Map} moduleMetadata - Module metadata from book JSON
 * @param {number} chapter - Chapter number
 * @param {boolean} verbose - Show detailed matching info
 * @returns {{alignments: Array, stats: Object}}
 */
function alignBlocks(docxBlocks, enSegments, moduleMetadata, chapter, verbose = false) {
  const sectionToModule = buildSectionToModuleMap(moduleMetadata);
  const alignments = []; // { segmentId, docxText, confidence, docxIndex }
  const unmatchedDocx = [];

  // Track which segments have been matched
  const matchedSegments = new Set();

  // Group segments by module
  const segmentsByModule = new Map();
  for (const seg of enSegments) {
    if (!segmentsByModule.has(seg.moduleId)) {
      segmentsByModule.set(seg.moduleId, []);
    }
    segmentsByModule.get(seg.moduleId).push(seg);
  }

  // Track current state
  let currentModuleId = null;
  let currentModuleSegIdx = 0;
  let currentModuleSegments = [];
  let inSkippableSection = false;
  let inToc = false; // After "Kaflauppsetning", skip section headings
  const tocSectionsSeen = new Set(); // Track sections seen in TOC mode

  // Find intro module (first module, section = "intro")
  const introModuleId = [...moduleMetadata.entries()]
    .find(([, meta]) => meta.section === 'intro')?.[0];

  /**
   * Advance to the next matchable segment in the current module.
   * Skips segments in SKIP_SEGMENT_TYPES and skippable sections.
   */
  function advanceToNextMatchable() {
    while (currentModuleSegIdx < currentModuleSegments.length) {
      const seg = currentModuleSegments[currentModuleSegIdx];

      // Check if we're entering a skippable section
      if (isSkippableSectionTitle(seg)) {
        inSkippableSection = true;
        currentModuleSegIdx++;
        continue;
      }

      // If we hit a non-skippable title, we're out of the skippable section
      if (seg.type === 'title' && inSkippableSection) {
        inSkippableSection = false;
      }

      if (inSkippableSection || SKIP_SEGMENT_TYPES.has(seg.type)) {
        currentModuleSegIdx++;
        continue;
      }

      return seg;
    }
    return null;
  }

  /**
   * Switch to a new module by ID.
   */
  function switchToModule(moduleId) {
    currentModuleId = moduleId;
    currentModuleSegIdx = 0;
    currentModuleSegments = segmentsByModule.get(moduleId) || [];
    inSkippableSection = false;
  }

  // Start with the intro module
  if (introModuleId) {
    switchToModule(introModuleId);
  }

  for (const block of docxBlocks) {
    // === STRUCTURAL ANCHORS ===

    // Chapter title: skip (not a segment)
    if (block.type === 'chapter-title') {
      if (verbose) console.log(`  SKIP chapter-title: "${block.text.substring(0, 60)}"`);
      continue;
    }

    // TOC header: enter TOC mode (skip subsequent section headings)
    if (block.type === 'toc-header') {
      inToc = true;
      if (verbose) console.log(`  SKIP toc-header (entering TOC mode)`);
      continue;
    }

    // Objectives label: skip (no corresponding segment)
    if (block.type === 'objectives-label') {
      if (verbose) console.log(`  SKIP objectives-label: "${block.text}"`);
      continue;
    }

    // Section heading: switch to the corresponding module
    if (block.type === 'section-heading') {
      // If we're in TOC mode, skip until we see a repeat (which means content starts)
      if (inToc) {
        const sectionNum = extractSectionNumber(block.text);
        if (sectionNum && tocSectionsSeen.has(sectionNum)) {
          // This is a repeat — exit TOC mode and process normally
          inToc = false;
          if (verbose) console.log(`  EXIT TOC mode (repeat of ${sectionNum})`);
        } else {
          if (sectionNum) tocSectionsSeen.add(sectionNum);
          if (verbose) console.log(`  SKIP toc-entry: "${block.text.substring(0, 60)}"`);
          continue;
        }
      }

      const sectionNum = extractSectionNumber(block.text);
      if (sectionNum) {
        const moduleId = sectionToModule.get(sectionNum);
        if (moduleId) {
          // Don't reset if we're already in this module (e.g. "3.5 DNA og RNA" subsection)
          if (moduleId === currentModuleId) {
            if (verbose) console.log(`  SKIP same-module subsection heading: "${block.text.substring(0, 50)}"`);
            // Try to match as a subsection title
            const seg = advanceToNextMatchable();
            if (seg && seg.type === 'title') {
              alignments.push({
                segmentId: seg.segmentId,
                docxText: block.text.replace(/^\d+\.\d+\s+/, ''),
                confidence: 'medium',
                docxIndex: block.index,
              });
              matchedSegments.add(seg.segmentId);
              currentModuleSegIdx++;
              if (verbose) console.log(`  MATCH [medium] ${seg.segmentId} ← subsection "${block.text.substring(0, 50)}"`);
            }
            continue;
          }

          switchToModule(moduleId);
          if (verbose) console.log(`\n  MODULE → ${moduleId} (section ${sectionNum})`);

          // Match the title segment
          const seg = advanceToNextMatchable();
          if (seg && seg.type === 'title') {
            alignments.push({
              segmentId: seg.segmentId,
              docxText: block.text.replace(/^\d+\.\d+\s+/, ''), // strip section number
              confidence: 'high',
              docxIndex: block.index,
            });
            matchedSegments.add(seg.segmentId);
            currentModuleSegIdx++;
            if (verbose) console.log(`  MATCH [high] ${seg.segmentId} ← "${block.text.substring(0, 50)}"`);
          }
          continue;
        }
      }
    }

    // Any non-section-heading exits TOC mode
    if (inToc && block.type !== 'section-heading') {
      inToc = false;
    }

    // Intro title: match to intro module title
    if (block.type === 'intro-title' && currentModuleId === introModuleId) {
      const seg = advanceToNextMatchable();
      if (seg && seg.type === 'title') {
        alignments.push({
          segmentId: seg.segmentId,
          docxText: block.text,
          confidence: 'high',
          docxIndex: block.index,
        });
        matchedSegments.add(seg.segmentId);
        currentModuleSegIdx++;
        if (verbose) console.log(`  MATCH [high] ${seg.segmentId} ← "Inngangur"`);
        continue;
      }
    }

    // TOC items in intro (section title listings) — these match abstract-item in intro
    // But biology intro modules may not have abstract items. Check.
    if (block.type === 'section-heading' && !currentModuleId) {
      // This might be a TOC entry in the intro — skip
      if (verbose) console.log(`  SKIP toc-entry: "${block.text.substring(0, 60)}"`);
      continue;
    }

    // Figure caption: try to match by figure number
    if (block.type === 'figure-caption') {
      const figNum = extractFigureNumber(block.text);
      const seg = advanceToNextMatchable();
      if (seg && seg.type === 'caption') {
        // Strip the "Mynd N.N" prefix from the docx text for the translation
        const captionText = block.text.replace(/^Myndi?\s+\d+\.\d+\s*/i, '');
        alignments.push({
          segmentId: seg.segmentId,
          docxText: captionText,
          confidence: 'high',
          docxIndex: block.index,
        });
        matchedSegments.add(seg.segmentId);
        currentModuleSegIdx++;
        if (verbose) console.log(`  MATCH [high] ${seg.segmentId} ← "Mynd ${figNum}..."`);
        continue;
      } else if (seg) {
        // The next matchable segment isn't a caption — it might be that the
        // docx caption doesn't align. Try to find the caption segment nearby.
        let found = false;
        for (let look = currentModuleSegIdx; look < Math.min(currentModuleSegIdx + 5, currentModuleSegments.length); look++) {
          const candidate = currentModuleSegments[look];
          if (candidate.type === 'caption' && !matchedSegments.has(candidate.segmentId)) {
            const captionText = block.text.replace(/^Myndi?\s+\d+\.\d+\s*/i, '');
            alignments.push({
              segmentId: candidate.segmentId,
              docxText: captionText,
              confidence: 'medium',
              docxIndex: block.index,
            });
            matchedSegments.add(candidate.segmentId);
            // Don't advance currentModuleSegIdx — let sequential matching continue
            found = true;
            if (verbose) console.log(`  MATCH [medium] ${candidate.segmentId} ← "Mynd ${figNum}..." (lookahead)`);
            break;
          }
        }
        if (!found) {
          unmatchedDocx.push(block);
          if (verbose) console.log(`  UNMATCHED docx figure: "${block.text.substring(0, 60)}"`);
        }
        continue;
      }
    }

    // Learning objectives intro
    if (block.type === 'objectives-intro') {
      const seg = advanceToNextMatchable();
      if (seg && (seg.type === 'abstract' || seg.type === 'abstract-item')) {
        alignments.push({
          segmentId: seg.segmentId,
          docxText: block.text,
          confidence: 'high',
          docxIndex: block.index,
        });
        matchedSegments.add(seg.segmentId);
        currentModuleSegIdx++;
        if (verbose) console.log(`  MATCH [high] ${seg.segmentId} ← objectives intro`);
        continue;
      }
    }

    // Table marker: try to match as a caption or skip
    if (block.type === 'table-marker') {
      // Tables in CNXML may have captions — check
      const seg = advanceToNextMatchable();
      if (seg && (seg.type === 'caption' || seg.type === 'table-caption')) {
        alignments.push({
          segmentId: seg.segmentId,
          docxText: block.text.replace(/^Tafla\s+\d+\.\d+\s*/i, ''),
          confidence: 'medium',
          docxIndex: block.index,
        });
        matchedSegments.add(seg.segmentId);
        currentModuleSegIdx++;
        if (verbose) console.log(`  MATCH [medium] ${seg.segmentId} ← table marker`);
      } else {
        if (verbose) console.log(`  SKIP table-marker (no matching segment): "${block.text.substring(0, 60)}"`);
      }
      continue;
    }

    // === SEQUENTIAL MATCHING ===

    const seg = advanceToNextMatchable();
    if (!seg) {
      // No more matchable segments in this module
      unmatchedDocx.push(block);
      if (verbose) console.log(`  UNMATCHED (no more segments): "${block.text.substring(0, 60)}"`);
      continue;
    }

    // Note headings (subsection titles, link sections, etc.) → match to title segments
    if (block.type === 'note-heading') {
      if (seg.type === 'title' || seg.type === 'note-title') {
        alignments.push({
          segmentId: seg.segmentId,
          docxText: block.text,
          confidence: 'medium',
          docxIndex: block.index,
        });
        matchedSegments.add(seg.segmentId);
        currentModuleSegIdx++;
        if (verbose) console.log(`  MATCH [medium] ${seg.segmentId} ← note-heading "${block.text.substring(0, 40)}"`);
      } else {
        // This might be a sub-heading that maps to a title further ahead
        let found = false;
        for (let look = currentModuleSegIdx; look < Math.min(currentModuleSegIdx + 3, currentModuleSegments.length); look++) {
          const candidate = currentModuleSegments[look];
          if ((candidate.type === 'title' || candidate.type === 'note-title') &&
              !matchedSegments.has(candidate.segmentId)) {
            alignments.push({
              segmentId: candidate.segmentId,
              docxText: block.text,
              confidence: 'low',
              docxIndex: block.index,
            });
            matchedSegments.add(candidate.segmentId);
            found = true;
            if (verbose) console.log(`  MATCH [low] ${candidate.segmentId} ← note-heading "${block.text.substring(0, 40)}" (lookahead)`);
            break;
          }
        }
        if (!found) {
          unmatchedDocx.push(block);
          if (verbose) console.log(`  UNMATCHED note-heading: "${block.text.substring(0, 60)}"`);
        }
      }
      continue;
    }

    // Default: sequential matching with type-aware heuristics
    //
    // Key heuristic: if the next segment is a `title` but the docx block is
    // a long paragraph (>80 chars or contains a period), don't consume the title.
    // Instead, skip it and look for a `para` or `entry` segment after it.
    // This handles cases where the translator added extra paragraphs between
    // CNXML headings.
    const isDocxHeadingLike = block.text.length < 80 && !block.text.includes('.');

    if (seg.type === 'title' && !isDocxHeadingLike) {
      // This looks like a paragraph consuming a title — try to find a para after the title
      let found = false;
      for (let look = currentModuleSegIdx + 1; look < Math.min(currentModuleSegIdx + 3, currentModuleSegments.length); look++) {
        const candidate = currentModuleSegments[look];
        if (SKIP_SEGMENT_TYPES.has(candidate.type)) continue;
        if (candidate.type === 'para' || candidate.type === 'entry') {
          // Skip the title, match this paragraph
          alignments.push({
            segmentId: candidate.segmentId,
            docxText: block.text,
            confidence: 'low',
            docxIndex: block.index,
          });
          matchedSegments.add(candidate.segmentId);
          // Advance past the skipped title AND the matched para
          currentModuleSegIdx = look + 1;
          found = true;
          if (verbose) console.log(`  MATCH [low] ${candidate.segmentId} (${candidate.type}) ← "${block.text.substring(0, 50)}" (skipped title ${seg.segmentId})`);
          break;
        }
        break; // Stop if we hit another non-para type
      }
      if (!found) {
        // Fall back: match to the title anyway
        alignments.push({
          segmentId: seg.segmentId,
          docxText: block.text,
          confidence: 'low',
          docxIndex: block.index,
        });
        matchedSegments.add(seg.segmentId);
        currentModuleSegIdx++;
        if (verbose) console.log(`  MATCH [low] ${seg.segmentId} (${seg.type}) ← "${block.text.substring(0, 50)}" (forced)`);
      }
    } else if (seg.type === 'para' || seg.type === 'abstract-item' || seg.type === 'abstract' ||
        seg.type === 'title' || seg.type === 'entry' || seg.type === 'note-title' ||
        seg.type === 'caption') {
      alignments.push({
        segmentId: seg.segmentId,
        docxText: block.text,
        confidence: 'medium',
        docxIndex: block.index,
      });
      matchedSegments.add(seg.segmentId);
      currentModuleSegIdx++;
      if (verbose) console.log(`  MATCH [medium] ${seg.segmentId} (${seg.type}) ← "${block.text.substring(0, 50)}"`);
    } else {
      unmatchedDocx.push(block);
      if (verbose) console.log(`  UNMATCHED (type mismatch ${seg.type}): "${block.text.substring(0, 60)}"`);
    }
  }

  // Build statistics — count segments not in docx (exercises, glossary, summaries)
  const skippedIds = new Set();
  let inSkip = false;
  for (const seg of enSegments) {
    if (SKIP_SEGMENT_TYPES.has(seg.type)) {
      skippedIds.add(seg.segmentId);
      continue;
    }
    if (isSkippableSectionTitle(seg)) {
      inSkip = true;
      skippedIds.add(seg.segmentId);
      continue;
    }
    if (seg.type === 'title' && inSkip) {
      inSkip = false;
    }
    if (inSkip) {
      skippedIds.add(seg.segmentId);
    }
  }

  const skippedCount = skippedIds.size;
  const unmatchedSegCount = enSegments.length - alignments.length - skippedCount;

  const stats = {
    totalEnSegments: enSegments.length,
    matched: alignments.length,
    skipped: skippedCount,
    unmatchedSegments: Math.max(0, unmatchedSegCount),
    unmatchedDocx: unmatchedDocx.length,
    highConfidence: alignments.filter(a => a.confidence === 'high').length,
    mediumConfidence: alignments.filter(a => a.confidence === 'medium').length,
    lowConfidence: alignments.filter(a => a.confidence === 'low').length,
    unmatchedDocxBlocks: unmatchedDocx,
  };

  // Per-module stats
  stats.perModule = {};
  for (const [moduleId, meta] of moduleMetadata) {
    const modSegs = segmentsByModule.get(moduleId) || [];
    const modMatched = alignments.filter(a => a.segmentId.startsWith(moduleId + ':'));
    stats.perModule[moduleId] = {
      section: meta.section,
      title: meta.title,
      totalSegments: modSegs.length,
      matched: modMatched.length,
    };
  }

  return { alignments, stats };
}

// =====================================================================
// OUTPUT
// =====================================================================

/**
 * Write aligned translations as per-module IS segment files.
 * Format matches existing files in 02-mt-output/.
 *
 * @param {Array} alignments - Alignment results
 * @param {string} booksDir - Books directory
 * @param {number} chapter - Chapter number
 * @param {Map} moduleMetadata - Module metadata
 * @param {boolean} dryRun - Don't write files
 */
function writeSegmentFiles(alignments, booksDir, chapter, moduleMetadata, dryRun) {
  const chapterDir = `ch${String(chapter).padStart(2, '0')}`;
  const outputDir = path.join(booksDir, '02-mt-output', chapterDir);

  if (!dryRun) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Group alignments by module
  const byModule = new Map();
  for (const a of alignments) {
    const moduleId = a.segmentId.split(':')[0];
    if (!byModule.has(moduleId)) {
      byModule.set(moduleId, []);
    }
    byModule.get(moduleId).push(a);
  }

  for (const [moduleId] of moduleMetadata) {
    const moduleAlignments = byModule.get(moduleId) || [];
    if (moduleAlignments.length === 0) continue;

    // Build segment file content, deduplicating (first-match-wins)
    // Format: marker and text on same line (matching IS convention)
    const lines = [];
    const seen = new Set();
    for (const a of moduleAlignments) {
      if (seen.has(a.segmentId)) continue;
      seen.add(a.segmentId);
      lines.push(`<!-- SEG:${a.segmentId} --> ${a.docxText}`);
      lines.push('');
    }

    const content = lines.join('\n');
    const filePath = path.join(outputDir, `${moduleId}-segments.is.md`);

    if (dryRun) {
      console.log(`\n  Would write: ${filePath} (${moduleAlignments.length} segments)`);
    } else {
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`  Written: ${filePath} (${moduleAlignments.length} segments)`);
    }
  }
}

/**
 * Write alignment report JSON.
 */
function writeReport(stats, booksDir, chapter) {
  const chapterDir = `ch${String(chapter).padStart(2, '0')}`;
  const reportPath = path.join(booksDir, '02-mt-output', chapterDir, 'import-report.json');

  // Clean up stats for JSON output (remove docx block objects)
  const reportStats = {
    ...stats,
    unmatchedDocxBlocks: stats.unmatchedDocxBlocks.map(b => ({
      index: b.index,
      type: b.type,
      text: b.text.substring(0, 100),
    })),
  };

  fs.writeFileSync(reportPath, JSON.stringify(reportStats, null, 2), 'utf-8');
  console.log(`  Report: ${reportPath}`);
}

// =====================================================================
// IMAGE EXTRACTION
// =====================================================================

/**
 * Extract images from docx and rename to match CNXML conventions.
 * Uses JSZip (bundled inside mammoth) to read the docx as a zip.
 *
 * @param {string} docxPath - Path to docx file
 * @param {string} booksDir - Books directory
 * @param {number} chapter - Chapter number
 * @param {Array} enSegments - EN segments (to find figure IDs)
 * @param {boolean} dryRun - Don't write files
 * @param {boolean} verbose - Show details
 */
async function extractImages(docxPath, booksDir, chapter, enSegments, dryRun, verbose) {
  const { default: JSZip } = await import('jszip');
  const docxBuffer = fs.readFileSync(docxPath);
  const zip = await JSZip.loadAsync(docxBuffer);

  // Find all image files in word/media/
  const mediaFiles = Object.keys(zip.files)
    .filter(f => f.startsWith('word/media/'))
    .sort(); // Sort to get document order

  if (mediaFiles.length === 0) {
    console.log('  No images found in docx.');
    return;
  }

  // Extract figure IDs from segments (captions have IDs like "fig-ch03_01_01-caption")
  const figureIds = enSegments
    .filter(s => s.type === 'caption')
    .map(s => {
      const match = s.segmentId.match(/:([^:]+)-caption$/);
      return match ? match[1] : null;
    })
    .filter(Boolean);

  console.log(`  Found ${mediaFiles.length} images in docx, ${figureIds.length} CNXML figures`);

  const chPad = String(chapter).padStart(2, '0');
  const mediaDir = path.join(booksDir, 'media');
  const mapping = [];

  if (!dryRun) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }

  for (let i = 0; i < mediaFiles.length; i++) {
    const docxFile = mediaFiles[i];
    const ext = path.extname(docxFile).toLowerCase();
    const figureId = i < figureIds.length ? figureIds[i] : `unknown_${i}`;

    // Convert figure ID to filename: fig-ch03_01_01 → Figure_03_01_01_is
    const figMatch = figureId.match(/fig-ch(\d+)_(\d+)_(\d+)/);
    let outputName;
    if (figMatch) {
      outputName = `Figure_${figMatch[1]}_${figMatch[2]}_${figMatch[3]}_is${ext}`;
    } else {
      outputName = `${figureId}_is${ext}`;
    }

    mapping.push({
      docxImage: path.basename(docxFile),
      figureId,
      outputName,
      extension: ext,
    });

    if (verbose) {
      console.log(`    ${path.basename(docxFile)} → ${outputName} (${figureId})`);
    }

    if (!dryRun) {
      const imageBuffer = await zip.files[docxFile].async('nodebuffer');
      fs.writeFileSync(path.join(mediaDir, outputName), imageBuffer);
    }
  }

  // Write mapping JSON
  if (!dryRun) {
    fs.writeFileSync(
      path.join(mediaDir, 'image-mapping.json'),
      JSON.stringify(mapping, null, 2),
      'utf-8'
    );
  }

  // Check for EMF files that need conversion
  const emfFiles = mapping.filter(m => m.extension === '.emf');
  if (emfFiles.length > 0) {
    console.log(`\n  WARNING: ${emfFiles.length} EMF file(s) need manual conversion to PNG:`);
    for (const emf of emfFiles) {
      console.log(`    ${emf.outputName}`);
    }
    console.log('  Use: convert input.emf output.png (ImageMagick)');
  }

  console.log(`  Extracted ${mapping.length} images to ${mediaDir}`);
}

// =====================================================================
// MAIN
// =====================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.docx || !args.chapter) {
    console.error('Error: --docx and --chapter are required');
    printHelp();
    process.exit(1);
  }

  if (!fs.existsSync(args.docx)) {
    console.error(`Error: docx file not found: ${args.docx}`);
    process.exit(1);
  }

  const booksDir = `books/${args.book}`;
  console.log(`\nDocx Import: ${args.docx} → ${args.book} chapter ${args.chapter}`);
  console.log(`${args.dryRun ? '  [DRY RUN]' : ''}\n`);

  // Stage 1: Parse docx
  console.log('Stage 1: Parsing docx...');
  const docxBlocks = await parseDocx(args.docx);
  console.log(`  ${docxBlocks.length} text blocks extracted`);

  if (args.verbose) {
    console.log('\n  Block types:');
    const typeCounts = {};
    for (const b of docxBlocks) {
      typeCounts[b.type] = (typeCounts[b.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type}: ${count}`);
    }
  }

  // Stage 2: Load EN segments
  console.log('\nStage 2: Loading EN segments...');
  const enSegments = loadEnSegments(booksDir, args.chapter);
  const moduleMetadata = loadModuleMetadata(args.book, args.chapter);
  console.log(`  ${enSegments.length} EN segments across ${moduleMetadata.size} modules`);

  // Stage 3: Alignment
  console.log('\nStage 3: Aligning...');
  const { alignments, stats } = alignBlocks(
    docxBlocks, enSegments, moduleMetadata, args.chapter, args.verbose
  );

  // Print summary
  console.log(`\n  === Alignment Summary ===`);
  console.log(`  Total EN segments:    ${stats.totalEnSegments}`);
  console.log(`  Matched:              ${stats.matched} (${(100 * stats.matched / stats.totalEnSegments).toFixed(0)}%)`);
  console.log(`  Skipped (exercises):  ${stats.skipped}`);
  console.log(`  Unmatched segments:   ${stats.unmatchedSegments}`);
  console.log(`  Unmatched docx:       ${stats.unmatchedDocx}`);
  console.log(`  Confidence: high=${stats.highConfidence} medium=${stats.mediumConfidence} low=${stats.lowConfidence}`);

  console.log(`\n  Per-module:`);
  for (const [moduleId, modStats] of Object.entries(stats.perModule)) {
    const pct = modStats.totalSegments > 0
      ? (100 * modStats.matched / modStats.totalSegments).toFixed(0)
      : 0;
    console.log(`    ${moduleId} (${modStats.section}): ${modStats.matched}/${modStats.totalSegments} (${pct}%)`);
  }

  // Write output
  if (!args.dryRun) {
    console.log('\nWriting segment files...');
  }
  writeSegmentFiles(alignments, booksDir, args.chapter, moduleMetadata, args.dryRun);

  // Write report
  if (args.report || !args.dryRun) {
    if (!args.dryRun) {
      writeReport(stats, booksDir, args.chapter);
    }
  }

  // Extract images
  if (args.extractImages) {
    console.log('\nExtracting images...');
    await extractImages(args.docx, booksDir, args.chapter, enSegments, args.dryRun, args.verbose);
  }

  // Show unmatched docx blocks if verbose
  if (stats.unmatchedDocx > 0 && !args.verbose) {
    console.log(`\n  Use --verbose to see ${stats.unmatchedDocx} unmatched docx block(s)`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
