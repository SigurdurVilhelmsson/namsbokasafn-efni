/**
 * cnxml-elements.js
 *
 * Element handler functions for CNXML to HTML rendering.
 * Each handler converts a CNXML element to semantic HTML.
 */

import katex from 'katex';
import { convertMathMLToLatex } from './mathml-to-latex.js';

/**
 * Render LaTeX to KaTeX HTML (inline mode).
 * @param {string} latex - LaTeX string
 * @returns {string} KaTeX HTML or error fallback
 */
function renderInlineLatex(latex) {
  try {
    return katex.renderToString(latex, {
      displayMode: false,
      throwOnError: false,
      strict: false,
      trust: true,
    });
  } catch (err) {
    // Return placeholder with original LaTeX for debugging
    return `<span class="katex-error" data-latex="${escapeAttr(latex)}">[Math]</span>`;
  }
}

/**
 * Create an HTML element string with attributes.
 * @param {string} tag - HTML tag name
 * @param {Object} attrs - Attributes object
 * @param {string} content - Inner content
 * @returns {string} HTML string
 */
export function createElement(tag, attrs = {}, content = '') {
  const attrStr = Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
    .join(' ');

  if (content === null || content === '') {
    return `<${tag}${attrStr ? ' ' + attrStr : ''}/>`;
  }
  return `<${tag}${attrStr ? ' ' + attrStr : ''}>${content}</${tag}>`;
}

/**
 * Escape HTML attribute value.
 */
export function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escape HTML content.
 */
export function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// =====================================================================
// ELEMENT HANDLERS
// =====================================================================

/**
 * Render a paragraph element.
 */
export function renderPara(content, attrs, context) {
  const id = attrs.id || null;
  const processedContent = processInlineContent(content, context);
  return createElement('p', { id, class: attrs.class || null }, processedContent);
}

/**
 * Render a section element.
 */
export function renderSection(content, attrs, _context) {
  const id = attrs.id || null;
  return createElement('section', { id }, content);
}

/**
 * Render a title element.
 * @param {string} content - Title text
 * @param {number} level - Heading level (1-6)
 */
export function renderTitle(content, attrs, level = 2) {
  const id = attrs.id || null;
  const processedContent = processInlineContent(content, { equations: {} });
  return createElement(`h${level}`, { id }, processedContent);
}

/**
 * Render a figure element.
 */
export function renderFigure(content, attrs, _context) {
  const id = attrs.id || null;
  const className = attrs.class || null;
  return createElement('figure', { id, class: className }, content);
}

/**
 * Render a media/image element.
 */
export function renderMedia(content, attrs, context) {
  const alt = attrs.alt || '';
  const id = attrs.id || null;

  // Find image src within content
  const imgMatch = content.match(/<image[^>]*src="([^"]*)"[^>]*>/);
  const src = imgMatch ? imgMatch[1] : '';

  // Normalize src path
  const normalizedSrc = normalizeSrc(src, context);

  return createElement('img', {
    id,
    src: normalizedSrc,
    alt,
    loading: 'lazy',
  });
}

/**
 * Render a caption element.
 */
export function renderCaption(content, attrs, context) {
  const processedContent = processInlineContent(content, context);
  return createElement('figcaption', {}, processedContent);
}

/**
 * Render an equation element.
 */
export function renderEquation(content, attrs, _context) {
  const id = attrs.id || null;
  const isUnnumbered = attrs.class === 'unnumbered';

  // Extract MathML and convert to LaTeX
  const mathMatch = content.match(/<m:math[^>]*>[\s\S]*?<\/m:math>/);
  if (!mathMatch) {
    return createElement('div', { id, class: 'equation' }, content);
  }

  const mathml = mathMatch[0];
  const latex = convertMathMLToLatex(mathml);

  // Build equation div with KaTeX placeholder
  const equationContent = createElement(
    'span',
    {
      class: 'katex-display',
      'data-latex': latex,
    },
    ''
  );

  const numberSpan = isUnnumbered ? '' : createElement('span', { class: 'equation-number' }, '');

  return createElement('div', { id, class: 'equation' }, equationContent + numberSpan);
}

/**
 * Render a note element.
 */
export function renderNote(content, attrs, _context) {
  const id = attrs.id || null;
  const noteClass = attrs.class || 'default';
  return createElement('aside', { id, class: `note note-${noteClass}` }, content);
}

/**
 * Render an example element.
 */
export function renderExample(content, attrs, _context) {
  const id = attrs.id || null;
  return createElement('aside', { id, class: 'example' }, content);
}

/**
 * Render an exercise element.
 */
export function renderExercise(content, attrs, _context) {
  const id = attrs.id || null;
  return createElement('div', { id, class: 'exercise' }, content);
}

/**
 * Render a problem element.
 */
export function renderProblem(content, attrs, _context) {
  const id = attrs.id || null;
  return createElement('div', { id, class: 'problem' }, content);
}

/**
 * Render a solution element.
 */
export function renderSolution(content, attrs, _context) {
  const id = attrs.id || null;
  return createElement('div', { id, class: 'solution' }, content);
}

/**
 * Render a list element.
 */
export function renderList(content, attrs, _context) {
  const id = attrs.id || null;
  const listType = attrs['list-type'] || 'bulleted';
  const tag = listType === 'enumerated' ? 'ol' : 'ul';
  return createElement(tag, { id }, content);
}

/**
 * Render a list item element.
 */
export function renderItem(content, attrs, context) {
  const id = attrs.id || null;
  const processedContent = processInlineContent(content, context);
  return createElement('li', { id }, processedContent);
}

/**
 * Render a table element.
 */
export function renderTable(content, attrs, _context) {
  const id = attrs.id || null;
  const className = attrs.class || null;
  const summary = attrs.summary || null;

  return createElement(
    'table',
    { id, class: className, 'aria-describedby': summary ? `${id}-summary` : null },
    content
  );
}

/**
 * Render a table row element.
 */
export function renderRow(content, _attrs, _context) {
  return createElement('tr', {}, content);
}

/**
 * Render a table entry (cell) element.
 */
export function renderEntry(content, attrs, context) {
  const colspan =
    attrs.namest && attrs.nameend ? calculateColspan(attrs.namest, attrs.nameend) : null;
  const rowspan = attrs.morerows ? parseInt(attrs.morerows) + 1 : null;
  const align = attrs.align || null;

  // Use th for header rows, td otherwise
  const tag = context.isHeader ? 'th' : 'td';

  const processedContent = processInlineContent(content, context);
  return createElement(
    tag,
    { colspan, rowspan, style: align ? `text-align: ${align}` : null },
    processedContent
  );
}

/**
 * Render a term (definition) element.
 */
export function renderTerm(content, attrs, context) {
  const id = attrs.id || null;
  const processedContent = processInlineContent(content, context);
  return createElement('dfn', { id, class: 'term' }, processedContent);
}

/**
 * Render emphasis element.
 */
export function renderEmphasis(content, attrs, context) {
  const effect = attrs.effect || 'italics';
  const processedContent = processInlineContent(content, context);

  switch (effect) {
    case 'bold':
      return createElement('strong', {}, processedContent);
    case 'italics':
      return createElement('em', {}, processedContent);
    case 'underline':
      return createElement('u', {}, processedContent);
    default:
      return createElement('em', {}, processedContent);
  }
}

/**
 * Render a link element.
 */
export function renderLink(content, attrs, context) {
  const url = attrs.url;
  const targetId = attrs['target-id'];
  const document = attrs.document;

  let href;
  if (url) {
    href = url;
  } else if (targetId) {
    href = document ? `${document}#${targetId}` : `#${targetId}`;
  } else {
    href = '#';
  }

  const processedContent = content ? processInlineContent(content, context) : href;
  return createElement('a', { href }, processedContent);
}

/**
 * Render a footnote element.
 */
export function renderFootnote(content, attrs, context) {
  const id = attrs.id || `fn-${context.footnoteCounter || 1}`;
  const processedContent = processInlineContent(content, context);
  return createElement('span', { class: 'footnote', id }, processedContent);
}

/**
 * Render subscript.
 */
export function renderSub(content, _attrs, _context) {
  return createElement('sub', {}, content);
}

/**
 * Render superscript.
 */
export function renderSup(content, _attrs, _context) {
  return createElement('sup', {}, content);
}

/**
 * Render a definition in glossary.
 */
export function renderDefinition(content, attrs, _context) {
  const id = attrs.id || null;
  return createElement('div', { id, class: 'definition' }, content);
}

/**
 * Render meaning in glossary.
 */
export function renderMeaning(content, attrs, context) {
  const processedContent = processInlineContent(content, context);
  return createElement('span', { class: 'meaning' }, processedContent);
}

// =====================================================================
// INLINE CONTENT PROCESSING
// =====================================================================

/**
 * Process inline content, converting CNXML inline elements to HTML.
 * @param {string} content - CNXML inline content
 * @param {Object} context - Render context with equations, etc.
 * @returns {string} HTML content
 */
export function processInlineContent(content, context) {
  if (!content) return '';

  let result = content;

  // Convert inline MathML to pre-rendered KaTeX (keep data-latex for copy)
  result = result.replace(/<m:math[^>]*>[\s\S]*?<\/m:math>/g, (mathml) => {
    const latex = convertMathMLToLatex(mathml);
    const katexHtml = renderInlineLatex(latex);
    return `<span class="katex" data-latex="${escapeAttr(latex)}">${katexHtml}</span>`;
  });

  // Convert emphasis
  result = result.replace(
    /<emphasis\s+effect="([^"]*)"[^>]*>([\s\S]*?)<\/emphasis>/g,
    (match, effect, inner) => {
      const tag = effect === 'bold' ? 'strong' : effect === 'underline' ? 'u' : 'em';
      return `<${tag}>${processInlineContent(inner, context)}</${tag}>`;
    }
  );

  // Convert terms
  result = result.replace(/<term\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/term>/g, (match, id, inner) => {
    return `<dfn id="${id}" class="term">${processInlineContent(inner, context)}</dfn>`;
  });
  result = result.replace(/<term[^>]*>([\s\S]*?)<\/term>/g, (match, inner) => {
    return `<dfn class="term">${processInlineContent(inner, context)}</dfn>`;
  });

  // Convert links
  result = result.replace(/<link\s+url="([^"]*)"[^>]*>([\s\S]*?)<\/link>/g, (match, url, inner) => {
    return `<a href="${escapeAttr(url)}">${processInlineContent(inner, context)}</a>`;
  });
  result = result.replace(
    /<link\s+target-id="([^"]*)"[^>]*>([\s\S]*?)<\/link>/g,
    (match, targetId, inner) => {
      const text = inner.trim() || targetId;
      return `<a href="#${escapeAttr(targetId)}">${processInlineContent(text, context)}</a>`;
    }
  );
  result = result.replace(
    /<link\s+document="([^"]*)"\s+target-id="([^"]*)"[^>]*>([\s\S]*?)<\/link>/g,
    (match, doc, targetId, inner) => {
      const text = inner.trim() || `${doc}#${targetId}`;
      return `<a href="${escapeAttr(doc)}#${escapeAttr(targetId)}">${processInlineContent(text, context)}</a>`;
    }
  );
  result = result.replace(/<link\s+document="([^"]*)"[^>]*\/>/g, (match, doc) => {
    return `<a href="${escapeAttr(doc)}">${escapeHtml(doc)}</a>`;
  });

  // Convert footnotes
  result = result.replace(
    /<footnote\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/footnote>/g,
    (match, id, inner) => {
      return `<span class="footnote" id="${escapeAttr(id)}">${processInlineContent(inner, context)}</span>`;
    }
  );
  result = result.replace(/<footnote[^>]*>([\s\S]*?)<\/footnote>/g, (match, inner) => {
    return `<span class="footnote">${processInlineContent(inner, context)}</span>`;
  });

  // Convert sub/sup
  result = result.replace(/<sub>([\s\S]*?)<\/sub>/g, '<sub>$1</sub>');
  result = result.replace(/<sup>([\s\S]*?)<\/sup>/g, '<sup>$1</sup>');

  // Strip <title> elements - these are CNXML-specific and shouldn't appear in HTML body
  // They should have been handled at the container level (example, note, section)
  result = result.replace(/<title>[^<]*<\/title>\s*/g, '');

  // Strip any remaining CNXML/MathML tags (namespaced tags like m:, c:, etc.)
  // But preserve standard HTML tags (span, div, etc.) that were generated by KaTeX
  result = result.replace(/<[a-z]+:[^>]*\/>/gi, ''); // Namespaced self-closing (e.g., <m:mspace/>)
  result = result.replace(/<\/?[a-z]+:[^>]*>/gi, ''); // Namespaced opening/closing (e.g., <m:mo>, </m:mo>)

  return result;
}

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Normalize image src path for web.
 */
function normalizeSrc(src, _context) {
  // Remove ../../media/ prefix and map to images/
  return src.replace(/^\.\.\/\.\.\/media\//, 'images/media/');
}

/**
 * Calculate colspan from column names.
 */
function calculateColspan(namest, nameend) {
  // Extract column numbers from names like "c1", "c2"
  const startMatch = namest.match(/(\d+)/);
  const endMatch = nameend.match(/(\d+)/);
  if (startMatch && endMatch) {
    return parseInt(endMatch[1]) - parseInt(startMatch[1]) + 1;
  }
  return null;
}
