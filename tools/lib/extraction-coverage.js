/**
 * extraction-coverage.js — pre-freeze extraction-coverage checks (campaign item 6b).
 *
 * Pure functions, no I/O. Compares source CNXML against the seg-ids emitted into
 * 02-for-mt, using the extractor's DETERMINISTIC id-linked scheme — so no prose
 * text is normalized or compared (the go/no-go spike proved substring matching is
 * defeated by biology's legacy `__term__`/`*i*` marker dialects).
 *
 * v1 checks:
 *   - list-item coverage: a `<list>` whose items are dropped from the segment corpus
 *     (the BIO-EX3 `processExercise` multiple-choice option-drop bug).
 *   - duplicate seg-ids (source-defined and raw-marker).
 *
 * Design: docs/superpowers/specs/2026-07-15-biology-extraction-coverage-gate-design.md
 */
import { DOMParser } from '@xmldom/xmldom';
import segMarkers from './seg-markers.cjs';
import { normalizeVisibleText } from '../verify-reextract-equivalence.js';
const { parseSegmentsMap } = segMarkers;

/** Parse a CNXML module string; return the doc and its `<content>` element (or null). */
export function parseModuleDoc(cnxmlText) {
  const doc = new DOMParser().parseFromString(cnxmlText, 'text/xml');
  const content = doc.getElementsByTagName('content')[0] || null;
  return { doc, content };
}

/** Set of emitted elementIds: the 3rd ':'-component of each `<!-- SEG:module:type:elementId -->`. */
export function emittedElementIds(segText) {
  const ids = new Set();
  for (const full of parseSegmentsMap(segText).keys()) {
    const parts = String(full).split(':');
    if (parts.length >= 3) ids.add(parts.slice(2).join(':'));
  }
  return ids;
}

function directItems(list) {
  const out = [];
  for (let i = 0; i < list.childNodes.length; i++) {
    const c = list.childNodes[i];
    if (c.nodeType === 1 && c.localName === 'item') out.push(c);
  }
  return out;
}

const snippet = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);

// Containers that do NOT route their nested <list> through processList: the list is
// flattened into a single parent segment (table <entry>/<caption>/<footnote> via
// extractInlineText->stripTags), so no `${list.id}-item-N` marker is ever emitted and the
// content IS present. A list reached through one of these is not checkable by item-count and
// must be skipped (adversarial review wf_72c60b9a: 32 id-bearing entry-nested lists across 5
// biology/organic modules would otherwise false-flag on intake). A list inside <problem> is
// NOT here — those genuinely drop (the BIO-EX3 bug this gate targets).
const FLATTENING_CONTAINERS = new Set(['entry', 'table', 'caption', 'footnote']);

/** True if `list`'s ancestor chain (up to <content>) passes through a flattening container. */
function underFlatteningContainer(list) {
  let n = list.parentNode;
  while (n && n.nodeType === 1 && n.localName !== 'content') {
    if (FLATTENING_CONTAINERS.has(n.localName)) return true;
    n = n.parentNode;
  }
  return false;
}

/** An item's own visible text with nested <list> subtrees removed (mirrors the extractor's
 *  `textContent = item.content minus nested lists` before the `text ? addSegment : null` gate). */
function itemOwnText(item) {
  const clone = item.cloneNode(true);
  const nested = Array.from(clone.getElementsByTagName('list'));
  for (const l of nested) if (l.parentNode) l.parentNode.removeChild(l);
  return (clone.textContent || '').trim();
}

/**
 * List-item coverage. The extractor emits list item i as
 * `item.id || `${list.id}-item-${i+1}`` (cnxml-extract.js:1646/1697), but ONLY when the
 * item has own text (sublist-only / empty items emit nothing — the `text ? … : null` gate;
 * the loop index still advances, so numbering counts skipped items). Fewer present than
 * EXPECTED items => a dropped/partial list (BIO-EX3). Skipped, to avoid false positives:
 * lists under a flattening container (content present in a parent segment); items with no
 * own text (never emitted); a list with any uncomputable expected id (id-less item in an
 * id-less list). See spec §12.
 */
export function checkLists(content, emittedIds) {
  const findings = [];
  if (!content) return findings;
  const lists = content.getElementsByTagName('list');
  for (let i = 0; i < lists.length; i++) {
    const list = lists[i];
    if (underFlatteningContainer(list)) continue;
    const listId = list.getAttribute('id') || null;
    const items = directItems(list);
    if (items.length === 0) continue;
    const expected = [];
    let uncomputable = false;
    items.forEach((it, idx) => {
      if (itemOwnText(it) === '') return; // extractor emits null; index (idx) still consumed
      const iid = it.getAttribute('id') || (listId ? `${listId}-item-${idx + 1}` : null);
      if (!iid) uncomputable = true;
      expected.push({ id: iid, el: it });
    });
    if (uncomputable || expected.length === 0) continue;
    const missing = expected.filter((e) => !emittedIds.has(e.id));
    if (missing.length > 0) {
      findings.push({
        listId: listId || '(id-less-list)',
        items: expected.length,
        present: expected.length - missing.length,
        missing: missing.map((e) => snippet(e.el)),
      });
    }
  }
  return findings;
}

/**
 * Duplicate seg-ids. (a) A source `id` defining >1 element in `<content>` (would collide
 * downstream). (b) A raw `<!-- SEG: -->` marker repeated — parseSegmentsMap dedupes 'first',
 * so a raw dup is a latent inject drop that the deduped map hides.
 */
export function checkDuplicateSegIds(content, segText) {
  const sourceDup = [];
  if (content) {
    const counts = new Map();
    const all = content.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
      const id = all[i].getAttribute('id');
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
    for (const [id, n] of counts) if (n > 1) sourceDup.push({ id, count: n });
  }

  // Group every raw SEG occurrence's normalized visible text by seg-id, so a
  // duplicate can be classified by CONTENT (parseSegmentsMap's 'first' dedup hides
  // the repeat, but a repeat whose occurrences share visible text drops nothing).
  const occ = new Map(); // segId -> string[] normalized visible texts
  for (const part of String(segText || '').split(/(?=<!--\s*SEG:)/)) {
    const m = part.match(/<!--\s*SEG:([^\s]+?)\s*-->/);
    if (!m) continue;
    const text = part.replace(/<!--\s*SEG:[^>]*-->/, '');
    if (!occ.has(m[1])) occ.set(m[1], []);
    occ.get(m[1]).push(normalizeVisibleText(text));
  }

  const rawDup = [];
  for (const [segId, texts] of occ) {
    if (texts.length < 2) continue;
    const benign = texts.every((t) => t === texts[0]);
    const entry = { segId, count: texts.length, kind: benign ? 'benign' : 'real' };
    if (!benign) {
      entry.sampleA = texts[0].slice(0, 80);
      entry.sampleB = texts.find((t) => t !== texts[0]).slice(0, 80);
    }
    rawDup.push(entry);
  }
  return { sourceDup, rawDup };
}

/** Run all v1 checks on one module's source CNXML + segment file text. */
export function analyzeModule(cnxmlText, segText) {
  const { content } = parseModuleDoc(cnxmlText);
  const listFindings = checkLists(content, emittedElementIds(segText));
  const dupFindings = checkDuplicateSegIds(content, segText);
  const realDups = dupFindings.rawDup.filter((d) => d.kind === 'real');
  const hasFindings =
    listFindings.length > 0 || dupFindings.sourceDup.length > 0 || realDups.length > 0;
  return { listFindings, dupFindings, hasFindings };
}
