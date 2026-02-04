/**
 * cnxml-parser.js
 *
 * CNXML parsing utilities for the extract-inject pipeline.
 * Uses regex-based parsing to avoid external dependencies,
 * following the pattern established in cnxml-to-md.js
 */

/**
 * Parse a CNXML document and return a structured representation.
 * @param {string} cnxml - Raw CNXML content
 * @returns {Object} Parsed document structure
 */
export function parseCnxmlDocument(cnxml) {
  const moduleId = extractModuleId(cnxml);
  const title = extractDocumentTitle(cnxml);
  const metadata = extractMetadata(cnxml);
  const documentClass = extractDocumentClass(cnxml);
  const content = extractContent(cnxml);

  return {
    moduleId,
    title,
    metadata,
    documentClass,
    rawContent: content,
  };
}

/**
 * Extract module ID from CNXML.
 * @param {string} cnxml - Raw CNXML content
 * @returns {string|null} Module ID (e.g., 'm68724')
 */
export function extractModuleId(cnxml) {
  const match = cnxml.match(/<md:content-id>([^<]+)<\/md:content-id>/);
  return match ? match[1].trim() : null;
}

/**
 * Extract document title from CNXML.
 * @param {string} cnxml - Raw CNXML content
 * @returns {string} Document title
 */
export function extractDocumentTitle(cnxml) {
  // Get the document-level title (not section titles)
  const match = cnxml.match(/<document[^>]*>[\s\S]*?<title>([^<]+)<\/title>/);
  return match ? match[1].trim() : 'Untitled';
}

/**
 * Extract document class (e.g., 'introduction') from CNXML.
 * @param {string} cnxml - Raw CNXML content
 * @returns {string|null} Document class attribute
 */
export function extractDocumentClass(cnxml) {
  const match = cnxml.match(/<document[^>]*\sclass="([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * Extract metadata from CNXML.
 * @param {string} cnxml - Raw CNXML content
 * @returns {Object} Metadata object
 */
export function extractMetadata(cnxml) {
  const metadata = {};

  const metadataMatch = cnxml.match(/<metadata[^>]*>([\s\S]*?)<\/metadata>/);
  if (!metadataMatch) return metadata;
  const metadataContent = metadataMatch[1];

  // Helper to extract element content (handles md: prefix or unprefixed)
  const extractElement = (name) => {
    const prefixedMatch = metadataContent.match(
      new RegExp('<md:' + name + '[^>]*>([^<]*)<\\/md:' + name + '>')
    );
    const unprefixedMatch = metadataContent.match(
      new RegExp('<' + name + '[^>]*>([^<]*)<\\/' + name + '>')
    );
    return prefixedMatch
      ? prefixedMatch[1].trim()
      : unprefixedMatch
        ? unprefixedMatch[1].trim()
        : null;
  };

  // Helper to extract attribute from element
  const extractAttribute = (name, attr) => {
    const prefixedMatch = metadataContent.match(
      new RegExp('<md:' + name + '[^>]*' + attr + '="([^"]*)"')
    );
    const unprefixedMatch = metadataContent.match(
      new RegExp('<' + name + '[^>]*' + attr + '="([^"]*)"')
    );
    return prefixedMatch ? prefixedMatch[1] : unprefixedMatch ? unprefixedMatch[1] : null;
  };

  // Extract created/revised dates
  const created = extractElement('created');
  if (created) metadata.created = created;

  const revised = extractElement('revised');
  if (revised) metadata.revised = revised;

  // Extract UUID
  const uuid = extractElement('uuid');
  if (uuid) metadata.uuid = uuid;

  // Extract license
  const licenseUrl = extractAttribute('license', 'url');
  if (licenseUrl) {
    metadata.licenseUrl = licenseUrl;
  }

  // Extract abstract (learning objectives)
  const abstractMatch = metadataContent.match(
    /<md:abstract[^>]*>([\s\S]*?)<\/md:abstract>|<abstract[^>]*>([\s\S]*?)<\/abstract>/
  );
  if (abstractMatch) {
    const abstractContent = abstractMatch[1] || abstractMatch[2];
    metadata.abstract = parseAbstract(abstractContent);
  }

  return metadata;
}

/**
 * Parse abstract/learning objectives content.
 * @param {string} content - Abstract content
 * @returns {Object} Parsed abstract with intro and items
 */
function parseAbstract(content) {
  const abstract = { intro: null, items: [] };

  // Extract intro paragraph
  const paraMatch = content.match(/<para[^>]*>([\s\S]*?)<\/para>/);
  if (paraMatch) {
    abstract.intro = stripTags(paraMatch[1]).trim();
  }

  // Extract list items
  const itemPattern = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemPattern.exec(content)) !== null) {
    const itemText = stripTags(match[1]).trim();
    if (itemText) abstract.items.push(itemText);
  }

  return abstract;
}

/**
 * Extract the content section from CNXML.
 * @param {string} cnxml - Raw CNXML content
 * @returns {string} Content between <content> tags
 */
export function extractContent(cnxml) {
  const match = cnxml.match(/<content>([\s\S]*)<\/content>/);
  return match ? match[1] : '';
}

/**
 * Strip all XML tags from a string.
 * @param {string} str - String with XML tags
 * @returns {string} Plain text
 */
export function stripTags(str) {
  return str.replace(/<[^>]+>/g, '');
}

/**
 * Extract all elements of a given type from content.
 * @param {string} content - CNXML content
 * @param {string} tagName - Element tag name (e.g., 'para', 'figure')
 * @returns {Array} Array of {id, content, attributes} objects
 */
export function extractElements(content, tagName) {
  const elements = [];
  // Match self-closing or paired elements
  const pattern = new RegExp(`<${tagName}([^>]*)(?:\\/>|>([\\s\\S]*?)<\\/${tagName}>)`, 'g');

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const attributes = parseAttributes(match[1]);
    elements.push({
      id: attributes.id || null,
      attributes,
      content: match[2] || '',
      fullMatch: match[0],
    });
  }

  return elements;
}

/**
 * Parse XML attributes from an attribute string.
 * @param {string} attrString - Attribute string (e.g., 'id="foo" class="bar"')
 * @returns {Object} Attribute key-value pairs
 */
export function parseAttributes(attrString) {
  const attrs = {};
  const pattern = /(\w+(?::\w+)?)="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(attrString)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

/**
 * Extract nested elements while handling depth correctly.
 * This handles nested tags of the same type.
 * @param {string} content - Content to search
 * @param {string} tagName - Tag name to find
 * @returns {Array} Array of element objects with proper nesting
 */
export function extractNestedElements(content, tagName) {
  const elements = [];
  const openTag = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'g');
  const closeTag = `</${tagName}>`;

  let match;
  while ((match = openTag.exec(content)) !== null) {
    const startIdx = match.index;
    let depth = 1;
    let idx = startIdx + match[0].length;

    // Find matching close tag
    while (depth > 0 && idx < content.length) {
      const nextOpen = content.indexOf(`<${tagName}`, idx);
      const nextClose = content.indexOf(closeTag, idx);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        idx = nextOpen + tagName.length + 1;
      } else {
        depth--;
        if (depth === 0) {
          const endIdx = nextClose + closeTag.length;
          const fullMatch = content.substring(startIdx, endIdx);
          const attributes = parseAttributes(match[1] || '');
          const innerContent = content.substring(startIdx + match[0].length, nextClose);
          elements.push({
            id: attributes.id || null,
            attributes,
            content: innerContent,
            fullMatch,
          });
          // Advance regex past this element so nested elements aren't
          // extracted again as separate top-level results
          openTag.lastIndex = endIdx;
        }
        idx = nextClose + closeTag.length;
      }
    }
  }

  return elements;
}

/**
 * Find all MathML equations in content.
 * @param {string} content - CNXML content
 * @returns {Array} Array of {mathml, id} objects
 */
export function extractMathML(content) {
  const equations = [];

  // First, find equations with IDs
  const equationPattern = /<equation\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/equation>/g;
  let match;
  while ((match = equationPattern.exec(content)) !== null) {
    const eqId = match[1];
    const eqContent = match[2];
    const mathMatch = eqContent.match(/<m:math[^>]*>[\s\S]*?<\/m:math>/);
    if (mathMatch) {
      equations.push({
        id: eqId,
        mathml: mathMatch[0],
        isInline: false,
      });
    }
  }

  // Find inline MathML (not wrapped in equation tags)
  const inlineMathPattern = /<m:math[^>]*>[\s\S]*?<\/m:math>/g;
  const contentWithoutEquations = content.replace(equationPattern, '');
  while ((match = inlineMathPattern.exec(contentWithoutEquations)) !== null) {
    equations.push({
      id: null,
      mathml: match[0],
      isInline: true,
    });
  }

  return equations;
}

/**
 * Extract glossary entries from CNXML.
 * @param {string} cnxml - Raw CNXML content
 * @returns {Array} Array of {term, meaning, id} objects
 */
export function extractGlossary(cnxml) {
  const glossaryMatch = cnxml.match(/<glossary>([\s\S]*?)<\/glossary>/);
  if (!glossaryMatch) return [];

  const glossary = [];
  // Use [\s\S]*? instead of [^<]* to allow nested elements like <emphasis> inside <term>
  const definitionPattern =
    /<definition\s+id="([^"]*)"[^>]*>[\s\S]*?<term>([\s\S]*?)<\/term>[\s\S]*?<meaning[^>]*>([\s\S]*?)<\/meaning>[\s\S]*?<\/definition>/g;

  let match;
  while ((match = definitionPattern.exec(glossaryMatch[1])) !== null) {
    // Strip tags from term but preserve for display (e.g., "heat (q)" not "heat ()")
    // Convert emphasis to plain text representation
    const rawTerm = match[2].trim();
    const term = stripTags(rawTerm).trim();
    glossary.push({
      id: match[1],
      term: term,
      rawTerm: rawTerm, // Preserve original with markup for rendering
      meaning: stripTags(match[3]).trim(),
    });
  }

  return glossary;
}

/**
 * Walk through CNXML content and call handlers for each element type.
 * @param {string} content - CNXML content
 * @param {Object} handlers - Map of tag names to handler functions
 * @param {Object} context - Context object passed to handlers
 */
export function walkContent(content, handlers, context = {}) {
  // Process elements in document order by finding all opening tags
  const tagPattern = /<(\w+)(\s[^>]*)?>([^<]*(?:(?!<\1[\s>])<[^<]*)*)<\/\1>|<(\w+)(\s[^>]*)?\/>/g;

  let match;
  while ((match = tagPattern.exec(content)) !== null) {
    const tagName = match[1] || match[4];
    const attrString = match[2] || match[5] || '';
    const innerContent = match[3] || '';

    if (handlers[tagName]) {
      const attrs = parseAttributes(attrString);
      handlers[tagName](
        {
          tagName,
          attributes: attrs,
          content: innerContent,
          fullMatch: match[0],
        },
        context
      );
    }
  }
}
