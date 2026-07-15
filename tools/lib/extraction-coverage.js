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

/**
 * List-item coverage. The extractor emits list item i as
 * `item.id || `${list.id}-item-${i+1}`` (cnxml-extract.js:1646/1697). Fewer present
 * than source items => a dropped/partial list (BIO-EX3). A list with any uncomputable
 * expected id (id-less item inside an id-less list) is SKIPPED to avoid false positives
 * (spec §12).
 */
export function checkLists(content, emittedIds) {
  const findings = [];
  if (!content) return findings;
  const lists = content.getElementsByTagName('list');
  for (let i = 0; i < lists.length; i++) {
    const list = lists[i];
    const listId = list.getAttribute('id') || null;
    const items = directItems(list);
    if (items.length === 0) continue;
    const expected = [];
    let uncomputable = false;
    items.forEach((it, idx) => {
      const iid = it.getAttribute('id') || (listId ? `${listId}-item-${idx + 1}` : null);
      if (!iid) uncomputable = true;
      expected.push({ id: iid, el: it });
    });
    if (uncomputable) continue;
    const missing = expected.filter((e) => !emittedIds.has(e.id));
    if (missing.length > 0) {
      findings.push({
        listId: listId || '(id-less-list)',
        items: items.length,
        present: items.length - missing.length,
        missing: missing.map((e) => snippet(e.el)),
      });
    }
  }
  return findings;
}

// Same marker pattern as seg-markers.cjs (SEG_MARKER), duplicated intentionally: this
// counts RAW occurrences, whereas parseSegmentsMap dedupes 'first'. Ties to campaign item
// #15 (dup-seg-ID policy unification) — do not consolidate here.
const RAW_SEG_MARKER = /<!--\s*SEG:([^\s]+?)\s*-->/g;

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
  const rawCounts = new Map();
  let m;
  const re = new RegExp(RAW_SEG_MARKER.source, 'g');
  while ((m = re.exec(segText || ''))) rawCounts.set(m[1], (rawCounts.get(m[1]) || 0) + 1);
  const rawDup = [];
  for (const [id, n] of rawCounts) if (n > 1) rawDup.push({ segId: id, count: n });
  return { sourceDup, rawDup };
}

/** Run all v1 checks on one module's source CNXML + segment file text. */
export function analyzeModule(cnxmlText, segText) {
  const { content } = parseModuleDoc(cnxmlText);
  const listFindings = checkLists(content, emittedElementIds(segText));
  const dupFindings = checkDuplicateSegIds(content, segText);
  const hasFindings =
    listFindings.length > 0 || dupFindings.sourceDup.length > 0 || dupFindings.rawDup.length > 0;
  return { listFindings, dupFindings, hasFindings };
}
