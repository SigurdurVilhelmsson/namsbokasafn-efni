/**
 * cnxml-elements.js
 *
 * Element handler functions for CNXML to HTML rendering.
 * Each handler converts a CNXML element to semantic HTML.
 */

import { renderMathML } from './mathjax-render.js';
import {
  convertMathMLToLatex,
  localizeNumbersInMathML,
  localizeMathMLText,
} from './mathml-to-latex.js';
import { resolveModuleHref } from './module-sections.js';
import { renderEmbedHtml } from './embed-mapping.js';
import { parseAttributes, TAG_ATTR_SPAN } from './cnxml-parser.js';

// =====================================================================
// CROSS-MODULE LINK RESOLUTION
// =====================================================================

/**
 * Find the rendered filename for a module id, trying both the chapter's
 * primary moduleSections and (for aggregator pages like answer-key that
 * intentionally clear moduleSections) crossModuleSections.
 */
function lookupModuleFilename(modId, context) {
  if (!modId) return null;
  return (
    resolveModuleHref(modId, context.chapter, context.moduleSections) ||
    resolveModuleHref(modId, context.chapter, context.crossModuleSections)
  );
}

/**
 * The reader URL for an appendix landing page. Shared by the target-id (A1) and
 * document= (piece 2) appendix branches so the URL shape cannot drift.
 * @param {string} bookSlug
 * @param {string} letter  uppercase appendix letter (A, B, …)
 * @returns {string}
 */
export function appendixLandingHref(bookSlug, letter) {
  return `/${bookSlug}/vidauki/${letter}`;
}

/**
 * Resolve a CNXML <link> reference into an href and a numbered-label fallback.
 *
 * Inputs:
 *   - documentId: the link's document= attribute (CNXML module id) or null
 *   - targetId:   the link's target-id= attribute (element id) or null
 *   - context:    render context (must include moduleId, chapter, moduleSections,
 *                 chapterIdToModule, chapter-wide number maps)
 *
 * Returns: { href, ownerModule, sameModule }
 *   - href:        the href to emit, or null if the link cannot be resolved at all
 *   - ownerModule: the module id where targetId actually lives (or null)
 *   - sameModule:  true if href is a same-page anchor
 */
export function resolveCrossModuleHref(documentId, targetId, context) {
  const currentMod = context.moduleId;

  // Resolve owner module
  let ownerModule = null;
  if (documentId) {
    ownerModule = documentId;
  } else if (targetId && context.chapterIdToModule) {
    const owners = context.chapterIdToModule.get(targetId);
    if (owners && owners.length > 0) {
      // Prefer current module if it's an owner (multi-owner case in lifraen-efnafraedi).
      ownerModule = owners.includes(currentMod) ? currentMod : owners[0];
      if (owners.length > 1 && !owners.includes(currentMod) && context.verbose) {
        console.warn(
          `[link] target-id="${targetId}" exists in multiple modules ${owners.join(',')}; picking ${owners[0]} from ${currentMod}`
        );
      }
    }
  }

  // The PAGE basename currently being rendered. Compiled end-of-chapter pages
  // (exercises/summary/key-equations) keep their source module as `moduleId`
  // (for numbering composite keys) but set `currentPageBasename` to the page
  // they actually write to. Module pages derive it from the module's section file.
  const currentPage =
    context.currentPageBasename ||
    (currentMod
      ? lookupModuleFilename(currentMod, context)?.replace(/\.html$/, '') || currentMod
      : null);

  // Relocated ids win: exercises (and other compiled sections) are moved off
  // their source module's section page into a compiled page, so their ids and
  // descendant ids live there — never on the owner module's section file.
  if (targetId && context.relocatedIds && context.relocatedIds.has(targetId)) {
    const targetPage = context.relocatedIds.get(targetId);
    if (targetPage === currentPage) {
      return { href: `#${targetId}`, ownerModule: ownerModule || currentMod, sameModule: true };
    }
    return {
      href: buildCrossModuleHref(`${targetPage}.html`, targetId, context),
      ownerModule,
      sameModule: false,
    };
  }

  // document="<appendix module>" → the appendix landing page. Fires for any arm
  // that passes documentId. Must run before the lookupModuleFilename() path, which
  // cannot resolve appendix modules (they render in a separate pass) → href:null.
  // item 10/#20: a document+target-id link keeps its fragment so the reader
  // lands on the referenced element (0 such links in chem today; biology watch).
  if (documentId && context.bookSlug && context.appendixModuleLetters?.has(documentId)) {
    const base = appendixLandingHref(
      context.bookSlug,
      context.appendixModuleLetters.get(documentId)
    );
    return {
      href: targetId ? `${base}#${targetId}` : base,
      ownerModule: documentId,
      sameModule: false,
    };
  }

  // Appendix cross-reference (A1): the target lives in a separately-rendered
  // appendix, so it's absent from the chapter-scoped chapterIdToModule and has
  // no owner. Resolve to the appendix landing URL /{bookSlug}/vidauki/{letter}.
  // The fragment is dropped — the only current case is the interactive periodic
  // table (vefur 307-redirects to a component and drops #fragment); per-id
  // fragment scrolling for prose appendices is the deferred general mechanism
  // (see docs/plans/2026-06-22-a1-appendix-crossref-design.md).
  if (!ownerModule && targetId && context.bookSlug && context.appendixIdMap) {
    const appx = context.appendixIdMap.get(targetId);
    if (appx) {
      return {
        href: appendixLandingHref(context.bookSlug, appx.letter),
        ownerModule: null,
        sameModule: false,
      };
    }
  }

  // No owner, or same module → same-page anchor. Exception: when rendering a
  // compiled page (currentPageBasename set), body content owned by a module
  // lives on that module's section page, not here, so fall through to cross-page
  // resolution below even though ownerModule === currentMod.
  if (!ownerModule || (ownerModule === currentMod && !context.currentPageBasename)) {
    return {
      href: targetId ? `#${targetId}` : null,
      ownerModule: ownerModule || currentMod,
      sameModule: true,
    };
  }

  // Cross-page → resolve to the owner module's rendered section file
  const fname = lookupModuleFilename(ownerModule, context);
  if (!fname) {
    if (context.verbose) {
      console.warn(
        `[link] cannot resolve module "${ownerModule}" referenced from ${currentMod}; falling back to text only`
      );
    }
    return { href: null, ownerModule, sameModule: false };
  }

  // The owner's section page may be the page we're already on (e.g. a compiled
  // page whose source module is also the current module but the target is body
  // content) — only same-page when the basenames truly match.
  if (fname.replace(/\.html$/, '') === currentPage) {
    return {
      href: targetId ? `#${targetId}` : null,
      ownerModule: ownerModule || currentMod,
      sameModule: true,
    };
  }

  const href = buildCrossModuleHref(fname, targetId, context);
  return {
    href,
    ownerModule,
    sameModule: false,
  };
}

/**
 * Build the final href for a cross-module link.
 *
 * Prefers an absolute reader URL so the link survives both the SvelteKit
 * prerenderer (which 404s relative `.html` paths) and the actual reader
 * routing (which has no `.html` in URLs). Falls back to the raw filename
 * if `bookSlug` isn't plumbed through (older callers).
 *
 * URL scheme:
 *   chapter section "5-2-foo.html" → /{slug}/kafli/05/5-2-foo#anchor
 *   appendix       "appendices-1-foo.html" → kept relative for now
 *                                            (handled by the reader's
 *                                            crossReferences action;
 *                                            absolute appendix URLs need
 *                                            letter-mapping which lives in
 *                                            toc.json, not the renderer).
 */
export function buildCrossModuleHref(fname, targetId, context) {
  if (!context.bookSlug || fname.startsWith('appendices-')) {
    return targetId ? `${fname}#${targetId}` : fname;
  }
  const basename = fname.replace(/\.html$/, '');
  // Filename is "{chapter}-{section}-{slug}" or "{chapter}-{eoc-tag}"
  // (e.g. "5-summary"). Pull the leading chapter number.
  const chapterMatch = basename.match(/^(\d+)-/);
  if (!chapterMatch) {
    return targetId ? `${fname}#${targetId}` : fname;
  }
  const chapterPad = chapterMatch[1].padStart(2, '0');
  const url = `/${context.bookSlug}/kafli/${chapterPad}/${basename}`;
  return targetId ? `${url}#${targetId}` : url;
}

/**
 * For label resolution (Mynd X.Y / Tafla X.Y / Dæmi X.Y / æfingu X.Y / section title),
 * try chapter-wide composite-key maps first (using the resolved owner module), then
 * fall back to module-local maps. Returns the label string or null.
 */
function resolveLinkLabel(targetId, ownerModule, context) {
  if (!targetId) return null;
  const compositeKey = ownerModule ? `${ownerModule}:${targetId}` : null;

  // Figures
  if (compositeKey && context.chapterFigureNumbers?.has(compositeKey))
    return `Mynd ${context.chapterFigureNumbers.get(compositeKey)}`;
  if (context.figureNumbers?.has(targetId)) return `Mynd ${context.figureNumbers.get(targetId)}`;

  // Tables
  if (compositeKey && context.chapterTableNumbers?.has(compositeKey))
    return `Tafla ${context.chapterTableNumbers.get(compositeKey)}`;
  if (context.tableNumbers?.has(targetId)) return `Tafla ${context.tableNumbers.get(targetId)}`;

  // Examples
  if (compositeKey && context.chapterExampleNumbers?.has(compositeKey))
    return `Dæmi ${context.chapterExampleNumbers.get(compositeKey)}`;

  // Exercises
  if (compositeKey && context.chapterExerciseNumbers?.has(compositeKey))
    return `æfingu ${context.chapterExerciseNumbers.get(compositeKey)}`;

  // Equations (numbered only)
  if (compositeKey && context.chapterEquationNumbers?.has(compositeKey))
    return `jöfnu ${context.chapterEquationNumbers.get(compositeKey)}`;
  if (context.equationNumbers?.has(targetId))
    return `jöfnu ${context.equationNumbers.get(targetId)}`;

  // Section / note titles
  if (context.chapterSectionTitles?.has(targetId))
    return context.chapterSectionTitles.get(targetId);

  return null;
}

/**
 * Render one CNXML `<link>` tag to HTML. The single link code path used by
 * processInlineContent (R4-6): attributes are parsed once, order-independent,
 * so a biology-sourced `<link window="new" url="…">` (attribute `window`
 * before `url`) resolves exactly like `<link url="…" window="new">` — no
 * position-anchored regex arm to fall through.
 *
 * Dispatch order mirrors the previous six position-anchored arms:
 *   1. url=        → sanitizeUrl(url) → <a href=…> (F19 scheme sanitization).
 *      `window="new"` is read and ignored — emits a plain <a>, no target="_blank".
 *   2. document= + target-id=  → resolveCrossModuleHref + resolveLinkLabel.
 *   3. document= only          → appendix/module resolution.
 *   4. target-id= only         → resolveCrossModuleHref(null, targetId, …) +
 *      resolveLinkLabel; preserves the "Figure X.Y" → "Mynd X.Y" MT-residue fix-up.
 * A null href in any resolved case falls back to visible text only (no <a>).
 *
 * @param {Object} attrs - parsed attribute map (parseAttributes output)
 * @param {string|undefined} innerRaw - text between <link> and </link>, or
 *   undefined for a self-closing <link .../> tag (no visible text of its own)
 * @param {Object} context - render context (see resolveCrossModuleHref)
 * @returns {string} HTML
 */
function renderLinkTag(attrs, innerRaw, context) {
  const url = attrs.url;
  const doc = attrs.document;
  const targetId = attrs['target-id'];
  const hasInner = innerRaw !== undefined;
  const text = hasInner ? innerRaw.trim() : '';

  // 1. url= present (F19 scheme sanitization). window="new" is simply ignored.
  if (url) {
    const linkContent = hasInner ? processInlineContent(innerRaw, context) : escapeHtml(url);
    return `<a href="${escapeAttr(sanitizeUrl(url))}">${linkContent}</a>`;
  }

  // 2. document= + target-id=
  if (doc && targetId) {
    const { href, ownerModule } = resolveCrossModuleHref(doc, targetId, context);
    const label = text || resolveLinkLabel(targetId, ownerModule, context) || targetId;
    if (href === null) {
      return text ? processInlineContent(text, context) : escapeHtml(label);
    }
    return `<a href="${escapeAttr(href)}">${text ? processInlineContent(text, context) : escapeHtml(label)}</a>`;
  }

  // 3. document= only (no target-id)
  if (doc) {
    const { href } = resolveCrossModuleHref(doc, null, context);
    const label =
      text ||
      context.moduleSections?.[doc]?.titleIs ||
      context.crossModuleSections?.[doc]?.titleIs ||
      doc;
    if (href === null) {
      return text ? processInlineContent(text, context) : escapeHtml(label);
    }
    return `<a href="${escapeAttr(href)}">${text ? processInlineContent(text, context) : escapeHtml(label)}</a>`;
  }

  // 4. target-id= only (no document)
  if (targetId) {
    const { href, ownerModule } = resolveCrossModuleHref(null, targetId, context);
    // Translate "Figure X.Y" left over from machine translation.
    const figTextMatch = text.match(/^Figure\s+(\d+\.\d+)$/);
    const displayText = figTextMatch
      ? `Mynd ${figTextMatch[1]}`
      : text || resolveLinkLabel(targetId, ownerModule, context) || targetId;
    const renderedText = figTextMatch
      ? escapeHtml(displayText)
      : text
        ? processInlineContent(text, context)
        : escapeHtml(displayText);
    if (href === null) return renderedText;
    return `<a href="${escapeAttr(href)}">${renderedText}</a>`;
  }

  // No url/document/target-id — nothing to resolve; keep visible text only so
  // the tag itself never leaks raw into HTML.
  return hasInner ? processInlineContent(innerRaw, context) : '';
}

// =====================================================================
// LATEX TEXT TRANSLATIONS
// =====================================================================

/**
 * Map of English phrases found inside \text{} in equations to Icelandic.
 * Sorted longest-first to avoid partial matches.
 */
const LATEX_TEXT_TRANSLATIONS = [
  // Multi-word phrases (must come before single words)
  ['two-fold decrease in amounts', 'tvöföld minnkun á magni'],
  ['two-fold increase in amounts', 'tvöföld aukning á magni'],
  ['mass of substance', 'massi efnis'],
  ['temperature change', 'hitastigsbreyting'],
  ['specific heat', 'eðlisvarmi'],
  ['substance M', 'efni M'],
  ['substance W', 'efni W'],
  ['volume of lead cube', 'rúmmál blýtenings'],
  ['large pan', 'stór panna'],
  ['small pan', 'lítil panna'],
  ['mole of', 'mól af'],
  // Single words
  ['products', 'myndefni'],
  ['reactants', 'hvarfefni'],
  ['reaction', 'hvarf'],
  ['solution', 'lausn'],
  ['initial', 'upphafs'],
  ['graphite', 'grafít'],
  ['diamond', 'demantur'],
  ['final', 'loka'],
  ['density', 'eðlismassi'],
  ['volume', 'rúmmál'],
  ['mass', 'massi'],
  ['water', 'vatn'],
  ['metal', 'málmur'],
  ['rebar', 'stál'],
  ['iron', 'járn'],
  ['bomb', 'sprengju'],
];

/**
 * Translate English descriptive text inside \text{} commands in LaTeX.
 * Preserves units, chemical formulas, and single-letter variables.
 * @param {string} latex - LaTeX string
 * @param {Array<[string, string]>} [dictionary] - External dictionary entries (sorted longest-first).
 *   If provided, used instead of built-in LATEX_TEXT_TRANSLATIONS.
 * @returns {string} LaTeX with translated \text{} content
 */
export function translateLatexText(latex, dictionary) {
  const entries = dictionary || LATEX_TEXT_TRANSLATIONS;
  return latex.replace(/\\text\{([^}]+)\}/g, (match, content) => {
    let translated = content;
    for (const [en, is] of entries) {
      // Case-insensitive word-boundary match
      const pattern = new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      translated = translated.replace(pattern, is);
    }
    return `\\text{${translated}}`;
  });
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
export function renderEquation(content, attrs, context) {
  const id = attrs.id || null;
  const isUnnumbered = attrs.class === 'unnumbered';

  // Extract MathML and convert to LaTeX
  const mathMatch = content.match(/<m:math[^>]*>[\s\S]*?<\/m:math>/);
  if (!mathMatch) {
    return createElement('div', { id, class: 'equation' }, content);
  }

  let localizedMathml = localizeNumbersInMathML(mathMatch[0]);
  localizedMathml = localizeMathMLText(localizedMathml, context && context.equationTextDictionary);
  const latex = translateLatexText(
    convertMathMLToLatex(localizedMathml),
    context && context.equationTextDictionary
  );

  // Render MathML directly via MathJax (keep data-latex for copy)
  const mathHtml = renderMathML(localizedMathml, true);
  const equationContent = createElement(
    'span',
    {
      class: 'mathjax-display',
      'data-latex': latex,
    },
    mathHtml
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

// Allowed URL schemes for external links. Anything else (javascript:, data:,
// vbscript:, file:, …) is neutralized to '#' so a dangerous scheme that
// survived machine translation can't land in an href (F19).
const SAFE_URL_SCHEMES = ['http', 'https', 'mailto', 'tel', 'ftp'];

function sanitizeUrl(url) {
  if (typeof url !== 'string') return '#';
  const trimmed = url.trim();
  // Strip whitespace/control chars before sniffing the scheme — browsers ignore
  // them, so a scheme split by a tab/newline can't smuggle past the check.
  const probe = Array.from(trimmed)
    .filter((c) => c.charCodeAt(0) > 0x20)
    .join('')
    .toLowerCase();
  const m = probe.match(/^([a-z][a-z0-9+.-]*):/);
  if (m && !SAFE_URL_SCHEMES.includes(m[1])) {
    return '#';
  }
  return trimmed;
}

/**
 * Render all collected footnotes as a section at end of page.
 * @param {Object} context - Render context with footnotes array
 * @returns {string} HTML for footnotes section
 */
export function renderFootnotesSection(context) {
  if (!context.footnotes || context.footnotes.length === 0) {
    return '';
  }

  let html = '<section class="footnotes">\n';
  html += '  <h2>Neðanmálsgreinar</h2>\n';
  html += '  <ol class="footnotes-list">\n';

  for (const fn of context.footnotes) {
    html += `    <li id="${escapeAttr(fn.id)}" class="footnote-item">\n`;
    html += `      <p>${fn.content} <a href="#fnref-${fn.num}" class="footnote-backref" aria-label="Back to content">↩</a></p>\n`;
    html += `    </li>\n`;
  }

  html += '  </ol>\n';
  html += '</section>\n';

  return html;
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

  // Convert inline MathML to MathJax SVG (keep data-latex for copy)
  result = result.replace(/<m:math[^>]*>[\s\S]*?<\/m:math>/g, (mathml) => {
    let localizedMathml = localizeNumbersInMathML(mathml);
    localizedMathml = localizeMathMLText(localizedMathml, context.equationTextDictionary);
    const latex = translateLatexText(
      convertMathMLToLatex(localizedMathml),
      context.equationTextDictionary
    );
    const mathHtml = renderMathML(localizedMathml, false);
    return `<span class="math-inline" data-latex="${escapeAttr(latex)}">${mathHtml}</span>`;
  });

  // Clean up stray markdown asterisks from MT (e.g., *<emphasis>text</emphasis>*)
  // These are artifacts of <term> elements being lost during translation
  result = result.replace(/\*(<emphasis[^>]*>)/g, '$1');
  result = result.replace(/(<\/emphasis>)\*/g, '$1');
  // Also handle cases where closing * is separated from </emphasis> by short text
  // e.g., </emphasis>T*) → </emphasis>T)
  result = result.replace(/(<\/emphasis>[^*<]{0,10})\*(\))/g, '$1$2');

  // §C61: drop self-closing <emphasis .../> BEFORE the pairing loop below. It carries no
  // content, so it renders to nothing. This must happen first because EMPHASIS_RE's `[^>]*`
  // matches the trailing `/` and would read the tag as an OPENING one — the same shape §C58
  // fixed one stage earlier in cnxml-extract.js. Two distinct failures follow from that, and
  // which one you get depends on what comes next: with a later `</emphasis>` and no
  // intervening `<emphasis`, it mis-pairs and swallows the text between them; with nothing
  // pairable, the raw tag leaks verbatim into published HTML (measured 2026-08-12 in
  // edlisfraedi-2e m42075). Stripping here fixes both, and leaves EMPHASIS_RE seeing only
  // genuine pairs.
  result = result.replace(/<emphasis\b[^>]*\/>/g, '');

  // Convert emphasis — innermost-first so nested emphasis pairs correctly. Order-independent
  // attribute read; effect-less <emphasis> defaults to italics; class="emphasis-one" keeps its
  // class (styled by vefur CSS). Innermost regex: inner body forbids nested <emphasis> so only
  // leaf emphases match; loop until none remain.
  {
    const EMPHASIS_RE = /<emphasis\b([^>]*)>((?:(?!<\/?emphasis)[\s\S])*)<\/emphasis>/g;
    let prev;
    do {
      prev = result;
      result = result.replace(EMPHASIS_RE, (match, attrs, inner) => {
        const effect = (attrs.match(/effect="([^"]*)"/) || [])[1];
        const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
        // item 10/P0-5: preserve the class attribute VERBATIM (any classes) —
        // the old emphasis-one-only carry dropped organic's centered-text etc.
        // Unknown classes are inert until vefur CSS styles them ([VEFUR] note
        // in the campaign register).
        const classAttr = cls ? ` class="${escapeAttr(cls)}"` : '';
        const body = processInlineContent(inner, context);
        if (effect === 'bold') return `<strong${classAttr}>${body}</strong>`;
        if (effect === 'underline') return `<u${classAttr}>${body}</u>`;
        if (effect === 'italics') return `<em${classAttr}>${body}</em>`;
        return `<em${classAttr}>${body}</em>`; // effect-less (or unmapped effect) default: italics
      });
    } while (result !== prev);
  }

  // Convert terms
  result = result.replace(/<term\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/term>/g, (match, id, inner) => {
    return `<dfn id="${id}" class="term">${processInlineContent(inner, context)}</dfn>`;
  });
  result = result.replace(/<term[^>]*>([\s\S]*?)<\/term>/g, (match, inner) => {
    return `<dfn class="term">${processInlineContent(inner, context)}</dfn>`;
  });

  // Convert links (R4-6): ONE order-independent handler, attributes parsed
  // once per tag so `<link window="new" url="…">` and `<link url="…">` (or any
  // other attribute ordering CNXML/MT produces) resolve identically — see
  // renderLinkTag(). Sanitizes the URL scheme so a javascript:/data: URL that
  // survived MT can't land in an href (F19). Non-greedy attrs + alternation
  // (mirrors cnxml-parser.js extractElements) so a self-closing `<link .../>`
  // can't be swallowed into a later `</link>`.
  result = result.replace(
    /<link\b([^>]*?)(?:\/>|>([\s\S]*?)<\/link>)/g,
    (match, attrsStr, innerRaw) => renderLinkTag(parseAttributes(attrsStr), innerRaw, context)
  );

  // D4: Convert inline <media><iframe> embeds (PhET/YouTube) to resolved responsive iframes
  result = result.replace(
    /<media\s([^>]*)>\s*<iframe([^>]*)\/?>\s*<\/media>/g,
    (match, mediaAttrsStr, iframeAttrsStr) => {
      const alt = (mediaAttrsStr.match(/alt="([^"]*)"/) || [, ''])[1];
      const src = (iframeAttrsStr.match(/src="([^"]*)"/) || [, ''])[1];
      const width = (iframeAttrsStr.match(/width="([^"]*)"/) || [, ''])[1];
      const height = (iframeAttrsStr.match(/height="([^"]*)"/) || [, ''])[1];
      return renderEmbedHtml({
        embedSrc: src,
        width,
        height,
        title: alt.replace(/[_-]+/g, ' '),
        embedMap: context.embedMap || {},
      });
    }
  );

  // Convert inline <media><image> elements (e.g., images inside table cells)
  result = result.replace(
    // §C115 — quote-aware. A raw `>` in the media's alt made this whole pattern
    // FAIL TO MATCH (not merely truncate), so the inline <media><image> was left
    // unconverted in the rendered output — a silent drop rather than an empty value.
    new RegExp(
      `<media\\s(${TAG_ATTR_SPAN})>\\s*<image${TAG_ATTR_SPAN}src="([^"]*)"${TAG_ATTR_SPAN}\\/>\\s*<\\/media>`,
      'g'
    ),
    (match, mediaAttrsStr, src) => {
      // Extract alt and class from media attributes
      const altMatch = mediaAttrsStr.match(/alt="([^"]*)"/);
      const classMatch = mediaAttrsStr.match(/class="([^"]*)"/);
      const alt = altMatch ? altMatch[1] : '';
      const mediaClass = classMatch ? classMatch[1] : '';

      // Build absolute image path using context. Handle three input shapes:
      //   "../../media/foo.jpg"  — canonical CNXML form
      //   "foo.jpg"              — bare filename (occurs in some sources where
      //                            the path prefix was dropped, e.g. inside
      //                            commented-out solution blocks)
      //   anything starting with "/" or "http(s)://" — leave alone
      let normalizedSrc = src;
      if (context.bookSlug && context.chapter != null && src && !/^(https?:)?\//.test(src)) {
        const chapterStr =
          context.chapter === 'appendices'
            ? 'appendices'
            : String(context.chapter).padStart(2, '0');
        const basename = src.startsWith('../../media/')
          ? src.replace('../../media/', '')
          : src.includes('/')
            ? src.split('/').pop()
            : src;
        normalizedSrc = `/content/${context.bookSlug}/chapters/${chapterStr}/images/media/${basename}`;
      }

      const imgTag = `<img src="${escapeAttr(normalizedSrc)}" alt="${escapeAttr(alt)}" loading="lazy"/>`;
      if (mediaClass.includes('scaled-down')) {
        return `<span class="scaled-down">${imgTag}</span>`;
      }
      return imgTag;
    }
  );

  // Convert CNXML newline/space to HTML equivalents
  result = result.replace(/<newline\s*\/>/g, '<br/>');
  result = result.replace(/<space[^>]*\/>/g, '&nbsp;');

  // Convert footnotes - collect them for rendering at end of page
  // Replace inline footnote with superscript reference link
  result = result.replace(
    /<footnote\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/footnote>/g,
    (match, id, inner) => {
      // Initialize footnotes array if not exists
      if (!context.footnotes) context.footnotes = [];
      const fnNum = context.footnotes.length + 1;
      const fnId = id || `fn-${fnNum}`;
      // Collect footnote content for rendering at page end
      context.footnotes.push({
        id: fnId,
        num: fnNum,
        content: processInlineContent(inner, context),
      });
      // Return superscript link
      return `<sup class="footnote-ref"><a href="#${escapeAttr(fnId)}" id="fnref-${fnNum}">${fnNum}</a></sup>`;
    }
  );
  result = result.replace(/<footnote[^>]*>([\s\S]*?)<\/footnote>/g, (match, inner) => {
    // Initialize footnotes array if not exists
    if (!context.footnotes) context.footnotes = [];
    const fnNum = context.footnotes.length + 1;
    const fnId = `fn-${fnNum}`;
    // Collect footnote content
    context.footnotes.push({
      id: fnId,
      num: fnNum,
      content: processInlineContent(inner, context),
    });
    // Return superscript link
    return `<sup class="footnote-ref"><a href="#${escapeAttr(fnId)}" id="fnref-${fnNum}">${fnNum}</a></sup>`;
  });

  // Convert sub/sup
  result = result.replace(/<sub>([\s\S]*?)<\/sub>/g, '<sub>$1</sub>');
  result = result.replace(/<sup>([\s\S]*?)<\/sup>/g, '<sup>$1</sup>');

  // Strip <title> elements - these are CNXML-specific and shouldn't appear in HTML body
  // They should have been handled at the container level (example, note, section)
  result = result.replace(/<title>[^<]*<\/title>\s*/g, '');

  // Strip any remaining CNXML/MathML tags (namespaced tags like m:, c:, etc.)
  // But preserve standard HTML tags (span, div, svg, etc.) that were generated by MathJax
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
