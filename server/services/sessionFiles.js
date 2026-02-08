/**
 * Session File Operations
 *
 * Handles file storage, parsing, splitting, and upload tracking for sessions
 */

const fs = require('fs');
const path = require('path');
const { getSession, saveSession } = require('./sessionCore');

// Erlendur MT character limit (20,000 characters)
const ERLENDUR_CHAR_LIMIT = 20000;

// Soft limit to allow some buffer
const ERLENDUR_SOFT_LIMIT = 18000;

/**
 * Store file in session
 */
function storeFile(sessionId, fileType, filePath, metadata = {}) {
  const session = getSession(sessionId);
  if (!session) return null;

  session.files[fileType] = {
    path: filePath,
    originalName: metadata.originalName,
    size: metadata.size,
    moduleId: metadata.moduleId,
    section: metadata.section,
    part: metadata.part,
    title: metadata.title,
    uploadedAt: new Date().toISOString(),
  };

  session.updatedAt = new Date().toISOString();
  saveSession(session);

  return session.files[fileType];
}

/**
 * Get file from session
 */
function getFile(sessionId, fileType) {
  const session = getSession(sessionId);
  if (!session) return null;

  return session.files[fileType] || null;
}

/**
 * Extract module ID from filename
 * e.g., "m68663.is.md" -> "m68663"
 */
function extractModuleId(filename) {
  const match = filename.match(/(m\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract section number from filename
 * e.g., "1-2.en.md" -> "1.2", "1-2-chemistry-in-context.md" -> "1.2"
 * For strings files: "1-2-strings.is.md" -> "1.2-strings"
 * For intro files: "intro.is.md" -> "intro", "intro-strings.is.md" -> "intro-strings"
 */
function extractSectionFromFilename(filename) {
  // Check if it's an intro-strings file
  if (filename.match(/^intro-strings\./)) {
    return 'intro-strings';
  }

  // Check if it's an intro file (not strings)
  if (filename.match(/^intro\./)) {
    return 'intro';
  }

  // Check if it's a numbered strings file
  const stringsMatch = filename.match(/^(\d+)[-.](\d+)-strings\./);
  if (stringsMatch) {
    return `${stringsMatch[1]}.${stringsMatch[2]}-strings`;
  }

  // Match patterns like "1-2" or "1.2" at start of filename
  const match = filename.match(/^(\d+)[-.](\d+)/);
  if (match) {
    return `${match[1]}.${match[2]}`;
  }
  return null;
}

/**
 * Parse metadata from markdown content
 * Supports two formats:
 * 1. YAML frontmatter: ---\ntitle: "..."\nsection: "..."\n---
 * 2. Erlendur MT format: ## titill: „..." kafli: „..." eining: „..." tungumál: „..."
 */
function parseMarkdownFrontmatter(content) {
  // Try standard YAML frontmatter first
  const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (yamlMatch) {
    const frontmatter = yamlMatch[1];
    const result = {};
    const lines = frontmatter.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
      if (match) {
        result[match[1]] = match[2];
      }
    }
    if (Object.keys(result).length > 0) {
      return result;
    }
  }

  // Try Erlendur MT format: ## titill: „..." kafli: „..." eining: „..." tungumál: „..."
  // The format uses Icelandic quotation marks: „ (U+201E) opening, " (U+201C) closing
  // Extract each field separately to handle quote variations
  if (content.startsWith('## titill:') || content.startsWith('##titill:')) {
    const titleMatch = content.match(/titill:\s*\u201E([^\u201C\u201D\u201E]+)[\u201C\u201D]/);
    const sectionMatch = content.match(/kafli:\s*\u201E([^\u201C\u201D\u201E]+)[\u201C\u201D]/);
    const moduleMatch = content.match(/eining:\s*\u201E([^\u201C\u201D\u201E]+)[\u201C\u201D]/);
    const langMatch = content.match(
      /tungum\u00E1l:\s*\u201E([^\u201C\u201D\u201E]+)[\u201C\u201D]/
    );
    const partMatch = content.match(/hluti:\s*\u201E([^\u201C\u201D\u201E]+)[\u201C\u201D]/);

    if (titleMatch && sectionMatch && moduleMatch) {
      let section = sectionMatch[1];
      // Normalize translated section names back to canonical form
      if (section.toLowerCase() === 'inngangur') {
        section = 'intro';
      }
      const result = {
        title: titleMatch[1],
        section: section,
        module: moduleMatch[1],
        lang: langMatch ? langMatch[1] : null,
      };
      if (partMatch) {
        result.part = partMatch[1];
      }
      return result;
    }
  }

  // Try a more lenient Erlendur format (in case of variations)
  const lenientMatch = content.match(/kafli:\s*[„""']?(\d+\.\d+)[„""']?/i);
  if (lenientMatch) {
    const result = { section: lenientMatch[1] };

    // Try to extract module
    const moduleMatch = content.match(/eining:\s*[„""']?(m\d+)[„""']?/i);
    if (moduleMatch) result.module = moduleMatch[1];

    // Try to extract title
    const titleMatch = content.match(/titill:\s*[„""']?([^„""'\n]+)[„""']?/i);
    if (titleMatch) result.title = titleMatch[1].trim();

    return result;
  }

  return null;
}

/**
 * Identify uploaded file by parsing its content
 * Returns { section, module, title, part } or null
 */
function identifyUploadedFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const metadata = parseMarkdownFrontmatter(content);
    if (metadata) {
      return {
        section: metadata.section,
        module: metadata.module,
        title: metadata.title,
        lang: metadata.lang,
        part: metadata.part, // For split files
      };
    }
  } catch (err) {
    console.error(`Failed to parse file ${filePath}:`, err.message);
  }
  return null;
}

/**
 * Split content at paragraph boundaries to stay under character limit
 * Returns array of { content, part } objects
 */
function splitContentForErlendur(content, metadata) {
  if (content.length <= ERLENDUR_SOFT_LIMIT) {
    return [{ content, part: null }];
  }

  const parts = [];
  const paragraphs = content.split(/\n\n+/);
  let currentPart = [];
  let currentLength = 0;
  let partIndex = 0;

  // Generate header for split files
  const makeHeader = (partLetter) => {
    if (metadata) {
      // Erlendur format with part indicator
      return `## titill: „${metadata.title || 'Unknown'}" kafli: „${metadata.section}" eining: „${metadata.module}" tungumál: „en" hluti: „${partLetter}"\n\n`;
    }
    return `<!-- Part ${partLetter} -->\n\n`;
  };

  for (const para of paragraphs) {
    const paraLength = para.length + 2; // +2 for \n\n

    if (currentLength + paraLength > ERLENDUR_SOFT_LIMIT && currentPart.length > 0) {
      // Save current part and start new one
      const partLetter = String.fromCharCode(97 + partIndex); // a, b, c...
      parts.push({
        content: makeHeader(partLetter) + currentPart.join('\n\n'),
        part: partLetter,
      });
      currentPart = [para];
      currentLength = paraLength;
      partIndex++;
    } else {
      currentPart.push(para);
      currentLength += paraLength;
    }
  }

  // Add final part
  if (currentPart.length > 0) {
    const partLetter = String.fromCharCode(97 + partIndex);
    if (parts.length > 0) {
      parts.push({
        content: makeHeader(partLetter) + currentPart.join('\n\n'),
        part: partLetter,
      });
    } else {
      // No splitting needed after all
      parts.push({ content: currentPart.join('\n\n'), part: null });
    }
  }

  return parts;
}

/**
 * Check if a file needs splitting for Erlendur MT
 * Returns { needsSplit, charCount, estimatedParts }
 */
function checkFileSplitNeeded(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const charCount = content.length;
    const needsSplit = charCount > ERLENDUR_SOFT_LIMIT;
    const estimatedParts = needsSplit ? Math.ceil(charCount / ERLENDUR_SOFT_LIMIT) : 1;

    return { needsSplit, charCount, estimatedParts };
  } catch (err) {
    console.error(`Failed to check file ${filePath}:`, err.message);
    return { needsSplit: false, charCount: 0, estimatedParts: 1 };
  }
}

/**
 * Split a markdown file into multiple parts for Erlendur MT
 * Returns array of { filename, path, part } objects
 */
function splitFileForErlendur(filePath, outputDir, section) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const metadata = parseMarkdownFrontmatter(content);

  // Remove the header from content if present (we'll add new Erlendur headers)
  let bodyContent = content;

  // Remove YAML frontmatter (---\n...\n---)
  const yamlMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n/);
  if (yamlMatch) {
    bodyContent = content.substring(yamlMatch[0].length);
  }
  // Also remove Erlendur-style header (## titill: ...)
  else if (content.startsWith('##')) {
    const headerEnd = content.indexOf('\n\n');
    if (headerEnd > 0) {
      bodyContent = content.substring(headerEnd + 2);
    }
  }

  // Use section from metadata if available, fall back to passed section
  const effectiveSection = metadata?.section || section;
  const effectiveModule = metadata?.module || '';
  const effectiveTitle = metadata?.title || '';

  const metadataForSplit = {
    section: effectiveSection,
    title: effectiveTitle,
    module: effectiveModule,
  };

  const parts = splitContentForErlendur(bodyContent, metadataForSplit);

  // Generate filename base from section
  const sectionBase = effectiveSection ? effectiveSection.replace('.', '-') : 'unknown';

  if (parts.length === 1 && parts[0].part === null) {
    // No splitting needed
    return [{ filename: `${sectionBase}.en.md`, path: filePath, part: null }];
  }

  const result = [];
  for (const { content: partContent, part } of parts) {
    const filename = `${sectionBase}(${part}).en.md`;
    const partPath = path.join(outputDir, filename);
    fs.writeFileSync(partPath, partContent, 'utf-8');
    result.push({ filename, path: partPath, part });
  }

  return result;
}

/**
 * Recombine split translated files into a single file
 * Expects uploads with matching section and sequential part letters (a, b, c...)
 */
function recombineSplitFiles(uploads, outputDir, section) {
  // Sort uploads by part letter
  const sortedUploads = uploads
    .filter((u) => u.section === section && u.part)
    .sort((a, b) => (a.part || '').localeCompare(b.part || ''));

  if (sortedUploads.length === 0) {
    return null;
  }

  const combinedParts = [];
  for (const upload of sortedUploads) {
    try {
      let content = fs.readFileSync(upload.filePath, 'utf-8');

      // Remove part header from Erlendur output
      const headerMatch = content.match(/^##\s*titill:.*?hluti:.*?\n\n/);
      if (headerMatch) {
        content = content.substring(headerMatch[0].length);
      }

      combinedParts.push(content);
    } catch (err) {
      console.error(`Failed to read split file ${upload.filePath}:`, err.message);
    }
  }

  if (combinedParts.length === 0) {
    return null;
  }

  // Create combined file with proper header
  const firstUpload = sortedUploads[0];
  const header = `## titill: „${firstUpload.title || ''}" kafli: „${section}" eining: „${firstUpload.moduleId || ''}" tungumál: „is"\n\n`;
  const combinedContent = header + combinedParts.join('\n\n');

  const outputPath = path.join(outputDir, `${section.replace('.', '-')}.is.md`);
  fs.writeFileSync(outputPath, combinedContent, 'utf-8');

  return { path: outputPath, section };
}

/**
 * Get upload progress for a workflow step
 * Only counts uploads that match expected files (by section+part or moduleId)
 *
 * Returns both file-level and section-level progress:
 * - File-level: counts each part separately (for completion check)
 * - Section-level: counts base sections (splits collapsed) for user-facing progress
 */
function getUploadProgress(sessionId, stepId) {
  const sess = getSession(sessionId);
  if (!sess) return null;

  const expected = sess.expectedFiles[stepId] || [];
  const uploaded = sess.uploadedFiles[stepId] || [];

  // Create a key for matching: section+part or just section or moduleId
  const makeKey = (obj) => {
    if (obj.section && obj.part) return `${obj.section}:${obj.part}`;
    if (obj.section) return obj.section;
    if (obj.moduleId) return obj.moduleId;
    return null;
  };

  // Find which uploads actually match expected files
  const matchedUploads = [];
  const unmatchedUploads = [];
  const matchedKeys = new Set();

  for (const up of uploaded) {
    let matched = false;
    let matchedExp = null;

    for (const exp of expected) {
      if (typeof exp === 'object') {
        // For split files, must match both section AND part
        if (exp.part && up.part) {
          if (exp.section === up.section && exp.part === up.part) {
            matched = true;
            matchedExp = exp;
            break;
          }
        }
        // For non-split files, match by section or moduleId
        else if (!exp.part && !up.part) {
          if (exp.section && up.section === exp.section) {
            matched = true;
            matchedExp = exp;
            break;
          }
          if (exp.moduleId && up.moduleId === exp.moduleId) {
            matched = true;
            matchedExp = exp;
            break;
          }
        }
      } else {
        // Legacy: string filename
        const moduleId = extractModuleId(exp);
        if (moduleId && up.moduleId === moduleId) {
          matched = true;
          matchedExp = { moduleId };
          break;
        }
      }
    }

    if (matched) {
      matchedUploads.push({ ...up, matchedExpected: matchedExp });
      matchedKeys.add(makeKey(matchedExp));
    } else {
      unmatchedUploads.push(up);
    }
  }

  // Find missing expected files
  const missing = expected.filter((exp) => {
    const key = typeof exp === 'object' ? makeKey(exp) : extractModuleId(exp);
    return !matchedKeys.has(key);
  });

  // Calculate section-level progress (splits collapsed)
  // This groups split files by their base section and counts sections as complete
  // only when ALL parts of a split section are uploaded
  const sectionProgress = calculateSectionProgress(expected, matchedKeys);

  return {
    // File-level progress (for completion check)
    expected: expected.length,
    uploaded: matchedKeys.size,
    complete: missing.length === 0,
    missing,
    matchedFiles: matchedUploads,
    unmatchedFiles: unmatchedUploads,
    uploadedFiles: uploaded,
    expectedFiles: expected,
    // Section-level progress (for user-facing display)
    sections: sectionProgress,
  };
}

/**
 * Calculate section-level progress from expected files and matched keys.
 * Groups split files by base section and reports section-level completion.
 *
 * @param {Array} expected - Expected file objects with section/part info
 * @param {Set} matchedKeys - Set of matched keys (section:part or section)
 * @returns {Object} Section progress info
 */
function calculateSectionProgress(expected, matchedKeys) {
  // Build a map of sections to their expected parts
  // sectionMap[section] = { parts: ['a', 'b', 'c'] or null for non-split, uploaded: [...] }
  const sectionMap = new Map();

  for (const exp of expected) {
    if (typeof exp !== 'object' || !exp.section) continue;

    // Get base section (for strings files like "1.1-strings", keep as-is)
    const baseSection = exp.section;

    if (!sectionMap.has(baseSection)) {
      sectionMap.set(baseSection, { expectedParts: [], uploadedParts: [] });
    }

    const info = sectionMap.get(baseSection);

    if (exp.part) {
      // Split file - track the part
      info.expectedParts.push(exp.part);
      // Check if this part was uploaded
      const key = `${exp.section}:${exp.part}`;
      if (matchedKeys.has(key)) {
        info.uploadedParts.push(exp.part);
      }
    } else {
      // Non-split file
      info.expectedParts.push(null);
      if (matchedKeys.has(exp.section)) {
        info.uploadedParts.push(null);
      }
    }
  }

  // Calculate which sections are complete
  let totalSections = 0;
  let completeSections = 0;
  const incompleteSections = [];

  for (const [section, info] of sectionMap) {
    totalSections++;
    const isSplit = info.expectedParts.some((p) => p !== null);

    if (isSplit) {
      // For split sections, all parts must be uploaded
      const expectedSet = new Set(info.expectedParts.filter((p) => p !== null));
      const uploadedSet = new Set(info.uploadedParts.filter((p) => p !== null));
      const allUploaded = [...expectedSet].every((p) => uploadedSet.has(p));

      if (allUploaded && uploadedSet.size === expectedSet.size) {
        completeSections++;
      } else {
        const missingParts = [...expectedSet].filter((p) => !uploadedSet.has(p));
        incompleteSections.push({
          section,
          expected: info.expectedParts.length,
          uploaded: info.uploadedParts.length,
          missingParts,
        });
      }
    } else {
      // Non-split: just need one file
      if (info.uploadedParts.length > 0) {
        completeSections++;
      } else {
        incompleteSections.push({
          section,
          expected: 1,
          uploaded: 0,
        });
      }
    }
  }

  return {
    total: totalSections,
    complete: completeSections,
    incomplete: incompleteSections,
    percentComplete: totalSections > 0 ? Math.round((completeSections / totalSections) * 100) : 0,
  };
}

/**
 * Update expected files for a workflow step
 */
function updateExpectedFiles(sessionId, stepId, expectedFiles) {
  const sess = getSession(sessionId);
  if (!sess) return null;

  sess.expectedFiles[stepId] = expectedFiles;
  sess.updatedAt = new Date().toISOString();
  saveSession(sess);

  return sess.expectedFiles[stepId];
}

/**
 * Record a file upload for a workflow step
 * Parses the uploaded file to identify it by metadata
 */
function recordUpload(sessionId, stepId, filename, filePath) {
  const sess = getSession(sessionId);
  if (!sess) return null;

  if (!sess.uploadedFiles[stepId]) {
    sess.uploadedFiles[stepId] = [];
  }

  // Try to identify the file by parsing its content
  let metadata = null;
  if (filePath) {
    metadata = identifyUploadedFile(filePath);
  }

  // Extract info from filename as fallback
  const moduleIdFromName = extractModuleId(filename);
  const sectionFromName = extractSectionFromFilename(filename);

  // Check for part indicator in filename (e.g., "1-1(a).is.md")
  let partFromName = null;
  const partMatch = filename.match(/\(([a-z])\)\./i);
  if (partMatch) {
    partFromName = partMatch[1].toLowerCase();
  }

  const uploadRecord = {
    filename,
    filePath, // Store path for recombination
    section: metadata?.section || sectionFromName,
    moduleId: metadata?.module || moduleIdFromName,
    title: metadata?.title,
    part: metadata?.part || partFromName, // For split files
    uploadedAt: new Date().toISOString(),
  };

  sess.uploadedFiles[stepId].push(uploadRecord);

  sess.updatedAt = new Date().toISOString();
  saveSession(sess);

  return getUploadProgress(sessionId, stepId);
}

module.exports = {
  ERLENDUR_CHAR_LIMIT,
  ERLENDUR_SOFT_LIMIT,
  storeFile,
  getFile,
  extractModuleId,
  extractSectionFromFilename,
  parseMarkdownFrontmatter,
  identifyUploadedFile,
  splitContentForErlendur,
  checkFileSplitNeeded,
  splitFileForErlendur,
  recombineSplitFiles,
  getUploadProgress,
  calculateSectionProgress,
  updateExpectedFiles,
  recordUpload,
};
