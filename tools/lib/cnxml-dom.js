/**
 * cnxml-dom.js
 *
 * DOM-based utilities for manipulating CNXML fragments.
 * Replaces regex-based string manipulation in the injection pipeline
 * with proper DOM operations via @xmldom/xmldom.
 */

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

// Namespaces used in CNXML documents
const CNXML_NS = 'http://cnx.rice.edu/cnxml';
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

// Block-level CNXML elements that are preserved during para content replacement.
// Everything else (text nodes, emphasis, sub, sup, term, link, newline, space,
// m:math, footnote, etc.) is considered inline and gets replaced.
// Note: 'para' is included because CNXML allows nested paras — the extraction
// flattens them into sibling structure entries, so inner paras must be preserved
// as block children to be processed individually.
const BLOCK_TAGS = new Set(['list', 'equation', 'figure', 'table', 'note', 'media', 'para']);

/**
 * Parse a CNXML fragment string into a DOM document.
 *
 * Wraps the fragment in a <root> element with the CNXML and MathML namespace
 * declarations so that the parser can resolve prefixed elements like m:math.
 *
 * @param {string} cnxmlString - CNXML fragment (e.g., contents of a <para>)
 * @returns {{ doc: Document, root: Element }} The parsed document and root element
 */
function parseCnxmlFragment(cnxmlString) {
  const wrapped = `<root xmlns="${CNXML_NS}" xmlns:m="${MATHML_NS}">${cnxmlString}</root>`;
  const doc = new DOMParser().parseFromString(wrapped, 'text/xml');
  const root = doc.documentElement;
  return { doc, root };
}

/**
 * Serialize a DOM element back to a CNXML string.
 *
 * Strips the namespace declarations that XMLSerializer adds to every element,
 * since in the full document these live on the document root only.
 *
 * @param {Element} element - DOM element to serialize
 * @returns {string} Clean CNXML string without redundant xmlns attributes
 */
function serializeCnxmlFragment(element) {
  const raw = new XMLSerializer().serializeToString(element);
  return raw
    .replace(/ xmlns="http:\/\/cnx\.rice\.edu\/cnxml"/g, '')
    .replace(/ xmlns:m="http:\/\/www\.w3\.org\/1998\/Math\/MathML"/g, '');
}

/**
 * Parse a CNXML string and insert its nodes into a parent element before a
 * reference node. Handles the cross-document import requirement.
 *
 * @param {Document} doc - Target document that owns parentElement
 * @param {Element} parent - Parent element to insert into
 * @param {string} cnxmlString - CNXML string to parse and insert
 * @param {Node|null} refNode - Insert before this node (null = append)
 * @returns {boolean} true if CNXML was parsed and inserted, false if fallback was used
 */
function insertCnxmlBefore(doc, parent, cnxmlString, refNode) {
  if (!cnxmlString) return true;

  // Try to parse the CNXML fragment
  let hadError = false;
  const parser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: () => {
        hadError = true;
      },
      fatalError: () => {
        hadError = true;
      },
    },
  });

  const wrapped = `<root xmlns="${CNXML_NS}" xmlns:m="${MATHML_NS}">${cnxmlString}</root>`;
  const fragDoc = parser.parseFromString(wrapped, 'text/xml');
  const fragRoot = fragDoc.documentElement;

  // If parsing failed or produced an empty root, fall back to a text node
  if (hadError || !fragRoot || fragRoot.childNodes.length === 0) {
    const textNode = doc.createTextNode(cnxmlString);
    parent.insertBefore(textNode, refNode);
    return false;
  }

  // Import and insert each child node from the fragment into the target document.
  // Snapshot childNodes into an array first since it is a live NodeList.
  const nodes = Array.from(fragRoot.childNodes);
  for (const node of nodes) {
    const imported = doc.importNode(node, true);
    parent.insertBefore(imported, refNode);
  }
  return true;
}

/**
 * Determine whether a child element is a block-level CNXML element.
 *
 * @param {Node} node - DOM node to check
 * @returns {boolean} true if node is an element with a block-level tag name
 */
function isBlockElement(node) {
  return node.nodeType === 1 && BLOCK_TAGS.has(node.localName);
}

/**
 * Replace a <para> element's inline content while preserving block children.
 *
 * Block tags (list, equation, figure, table, note, media) are kept in place.
 * Everything else (text nodes, emphasis, sub, sup, term, link, newline, space,
 * m:math, footnote, title) is removed and replaced with the translated content.
 *
 * @param {Document} doc - The DOM document that owns paraElement
 * @param {Element} paraElement - The <para> element to modify
 * @param {string} translatedCnxml - Translated CNXML string to insert
 * @param {string} [titleCnxml=''] - Title CNXML to insert (e.g., '<title>Titill</title>')
 */
function replaceParaContent(doc, paraElement, translatedCnxml, titleCnxml = '') {
  // Snapshot children (live NodeList) and classify them
  const children = Array.from(paraElement.childNodes);

  // Remove all non-block children (inline content + title)
  for (const child of children) {
    if (!isBlockElement(child)) {
      paraElement.removeChild(child);
    }
  }

  // Find the first remaining block child (insertion reference point)
  const firstBlock = Array.from(paraElement.childNodes).find(isBlockElement) || null;

  // Insert title before the first block child (if provided)
  if (titleCnxml) {
    insertCnxmlBefore(doc, paraElement, titleCnxml, firstBlock);
  }

  // Insert translated content before the first block child
  if (translatedCnxml) {
    insertCnxmlBefore(doc, paraElement, translatedCnxml, firstBlock);
  }
}

/**
 * Replace the content of list items, matching them positionally with structure data.
 *
 * For each item in the structure array that has a segmentId, the corresponding
 * <item> element's content is replaced using the same inline/block preservation
 * logic as replaceParaContent.
 *
 * @param {Document} doc - The DOM document that owns listElement
 * @param {Element} listElement - The <list> element to modify
 * @param {Array<{segmentId?: string, id?: string}>} items - Structure items array
 * @param {function(string): string|null} getSeg - Function to look up translated text by segment ID
 */
function replaceListItems(doc, listElement, items, getSeg) {
  // Find all direct <item> child elements
  const itemElements = [];
  for (let i = 0; i < listElement.childNodes.length; i++) {
    const child = listElement.childNodes[i];
    if (child.nodeType === 1 && child.localName === 'item') {
      itemElements.push(child);
    }
  }

  // Match items positionally
  for (let i = 0; i < items.length && i < itemElements.length; i++) {
    const structItem = items[i];
    const itemEl = itemElements[i];

    // Restore id attribute if present in structure but missing in DOM
    if (structItem.id && !itemEl.getAttribute('id')) {
      itemEl.setAttribute('id', structItem.id);
    }

    if (!structItem.segmentId) continue;

    const translatedText = getSeg(structItem.segmentId);
    if (translatedText == null) continue;

    // Use the same inline/block replacement logic as replaceParaContent:
    // remove inline children, preserve block children, insert translation
    const children = Array.from(itemEl.childNodes);
    for (const child of children) {
      if (!isBlockElement(child)) {
        itemEl.removeChild(child);
      }
    }

    const firstBlock = Array.from(itemEl.childNodes).find(isBlockElement) || null;
    insertCnxmlBefore(doc, itemEl, translatedText, firstBlock);
  }
}

/**
 * Remove all descendant elements with the given tag names from a parent element.
 *
 * DOM-based replacement for the regex-based stripNestedElements() function.
 * Uses getElementsByTagName() for each tag, snapshots to array (live NodeList!),
 * then removes.
 *
 * @param {Element} parentElement - Element to search within
 * @param {string[]} tagNames - Tag names to remove (e.g., ['figure', 'table'])
 */
function removeElementsByTag(parentElement, tagNames) {
  for (const tagName of tagNames) {
    // getElementsByTagName returns a live NodeList, so snapshot to array first
    const elements = Array.from(parentElement.getElementsByTagName(tagName));
    for (const el of elements) {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }
  }
}

export {
  parseCnxmlFragment,
  serializeCnxmlFragment,
  replaceParaContent,
  replaceListItems,
  removeElementsByTag,
  insertCnxmlBefore,
  BLOCK_TAGS,
  CNXML_NS,
  MATHML_NS,
};
