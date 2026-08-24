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

/**
 * §C88 — EMPTY as of 2026-08-17. These four were the positions `cnxml-extract`
 * never visited for a bare `<media>`; §C88 added an emitter for each, so a bare
 * media in an <example>/<problem>/<solution>/<note> is now captured.
 *
 * Kept as an (empty) named set rather than deleted, because the reachability
 * model still needs a place to name a NEW blind parent if a future intake
 * introduces one — and because deleting it would silently drop the concept from
 * the file that owns it.
 *
 * ⚠️ The pre-§C88 comment here warned against adding 'exercise' (a bare <media>
 * that is a direct child of <exercise> itself, not its <problem>/<solution>
 * children — processExercise walks only those two), reasoning that the corpus
 * reconciled exactly at 1149 = 952 + 197 with no slack for an unobserved case.
 * That reconciliation is RE-DERIVED here, not carried forward: it never actually
 * could have detected this case. 'exercise' was never in this set, before or
 * after §C88, so a bare <media> direct child of <exercise> always fell through
 * to `reason = null` and was counted as reachable either way — the identity
 * balances by construction regardless of whether such a case exists, so it was
 * never evidence against one.
 *
 * The real evidence is elsewhere: `tools/__tests__/alt-coverage-corpus.test.js`
 * cross-checks this module's `reachable` count against what `cnxml-extract`
 * actually emits, corpus-wide, and chemistry's gap is exactly ONE segment
 * (m68727, attributed to a known, different cause — processFigure's
 * non-global media regex truncation). An exercise-direct-child bare media
 * with an id and an alt would show up in that same census as an ADDITIONAL,
 * unattributed reachable-but-unemitted shortfall (processExercise's walk
 * would never reach it, the same way it doesn't reach an id-less bare media
 * in the four now-covered positions — see the frozen spec's §2 scope banner,
 * docs/superpowers/specs/2026-08-16-c88-unreachable-figure-alt-design.md
 * (the `if (!media.id) continue` guard reasoning), and the register's §C88
 * entries in docs/plans/2026-07-21-post-item17-followup-campaign.md. No
 * such extra shortfall exists in chemistry, so the case remains unobserved
 * there. Organic is not evidence either way here — Task 10 measures it
 * separately. If a bare <media> direct child of <exercise> is ever found,
 * add 'exercise' here and expect that corpus test to move.
 */
const ALT_BLIND_DIRECT_PARENTS = new Set([]);

/** True if `el` has an ancestor of the given localName, up to <content>. */
function hasAncestor(el, localName) {
  let n = el.parentNode;
  while (n && n.nodeType === 1 && n.localName !== 'content') {
    if (n.localName === localName) return true;
    n = n.parentNode;
  }
  return false;
}

/**
 * The non-empty alt a <media> carries, on itself or on its child <image>.
 *
 * Mirrors the extractor's capture paths exactly, and no more: processFigure,
 * the standalone-media branch of processTopLevelContent, and
 * extractInlineText's inline-media capture all compute
 * `altText = mediaAttrs.alt || imageAttrs.alt || ''` — none of the three ever
 * reads an <iframe> child's alt. So this predicate must not read it either:
 * doing so would count a media whose only alt lives on an <iframe> as
 * reachable, when no capture path emits anything for it — a false E5 halt.
 */
function mediaAlt(media) {
  const own = media.getAttribute('alt');
  if (own && own.trim()) return own;
  for (let i = 0; i < media.childNodes.length; i++) {
    const c = media.childNodes[i];
    if (c.nodeType !== 1) continue;
    if (c.localName !== 'image') continue;
    const a = c.getAttribute('alt');
    if (a && a.trim()) return a;
  }
  return null;
}

/**
 * Split a module's alt-bearing <media> elements into the set `cnxml-extract` is
 * designed to reach and the set it structurally cannot.
 *
 * ⚠️ WHY THIS SPLIT EXISTS AT ALL, POST-§C88. §C81 put figure alt into the
 * pipeline but left it blind in five positions: a bare (non-figure-wrapped)
 * <media> in a table <entry>, or as a direct child of <example>/<problem>/
 * <solution>/<note> — a PRE-EXISTING extraction-coverage defect, not a §C81
 * regression. §C88 added an emitter for every one of those five, so as of this
 * change `ALT_BLIND_DIRECT_PARENTS` is empty and the split's `unreachable` side
 * is expected to read 0 corpus-wide — pinned by
 * tools/__tests__/alt-coverage-corpus.test.js, which owns the actual measured
 * numbers (not restated here; see CLAUDE.md § One source of truth).
 *
 * The split itself stays, rather than collapsing back to a flat count: it is
 * still the mechanism that would flag a NEW blind position if one is ever
 * found (see the 'exercise' case discussed above `ALT_BLIND_DIRECT_PARENTS`).
 * checkAltCoverage's gate is `reached === reachable` (actual emitted count vs
 * this function's `reachable`), not a raw source-attribute-count vs emitted
 * equality — the latter would fire on every genuinely-blind position too, the
 * exact over-broad check §C81 rejected when this split was introduced.
 *
 * @param {Element|null} content the module's <content> element
 * @returns {{reachable: number, unreachable: number, unreachableByReason: Record<string, number>}}
 */
export function altReachability(content) {
  const out = { reachable: 0, unreachable: 0, unreachableByReason: {} };
  if (!content) return out;
  const media = content.getElementsByTagName('media');
  for (let i = 0; i < media.length; i++) {
    const el = media[i];
    if (!mediaAlt(el)) continue;

    const inFigure = hasAncestor(el, 'figure');
    let reason = null;
    if (!inFigure) {
      const parent = el.parentNode;
      const pName = parent && parent.nodeType === 1 ? parent.localName : null;
      if (pName && ALT_BLIND_DIRECT_PARENTS.has(pName)) reason = `bare-media-in-${pName}`;
    }

    if (reason) {
      out.unreachable++;
      out.unreachableByReason[reason] = (out.unreachableByReason[reason] || 0) + 1;
    } else {
      out.reachable++;
    }
  }
  return out;
}

/**
 * E5 — alt coverage. Emits three numbers, always, and gates on one.
 *
 *   reached   how many alt segments the extractor actually emitted
 *   expected  how many alt attributes sit in positions it is designed to reach
 *   unreached how many sit in a still-blind position (reported, never a halt —
 *             §C88 emits for all five known positions, so this is expected 0
 *             corpus-wide; it stays live as the sensor for a NEW blind position)
 *
 * Equality, not >=: the over-emission direction is the duplicate-alt defect
 * §C81 Task 10 closed, and it must not be allowed to reopen silently.
 *
 * `unreached` is reported even on a figure-less module so a pass can be told
 * apart from a vacuous one (§C60: a check reported `Total findings: 0` while
 * reading zero files).
 *
 * @param {Element|null} content
 * @param {string} segText the module's 02-for-mt segment file text
 * @returns {{reached: number, expected: number, unreached: number, unreachableByReason: Record<string, number>, ok: boolean}}
 */
export function checkAltCoverage(content, segText) {
  const { reachable, unreachable, unreachableByReason } = altReachability(content);
  // Count raw marker OCCURRENCES, not deduped parseSegmentsMap keys. A same-id
  // duplicate marker — the §C81 Rule-1 majority shape (~145 of 167 merges) —
  // collapses to one Map key, which would silently hide the exact
  // over-emission this check exists to catch. Same split/match idiom as
  // checkDuplicateSegIds above, for the same reason: parseSegmentsMap's
  // 'first' dedup is a deliberate RUNTIME tolerance, not something a
  // pre-freeze gate should inherit.
  let reached = 0;
  for (const part of String(segText || '').split(/(?=<!--\s*SEG:)/)) {
    const m = part.match(/<!--\s*SEG:([^\s]+?)\s*-->/);
    if (m && String(m[1]).split(':')[1] === 'alt') reached++;
  }
  return {
    reached,
    expected: reachable,
    unreached: unreachable,
    unreachableByReason,
    ok: reached === reachable,
  };
}

/** Run all v1 checks on one module's source CNXML + segment file text. */
export function analyzeModule(cnxmlText, segText) {
  const { content } = parseModuleDoc(cnxmlText);
  const listFindings = checkLists(content, emittedElementIds(segText));
  const dupFindings = checkDuplicateSegIds(content, segText);
  const altFindings = checkAltCoverage(content, segText);
  const realDups = dupFindings.rawDup.filter((d) => d.kind === 'real');
  const hasFindings =
    listFindings.length > 0 || dupFindings.sourceDup.length > 0 || realDups.length > 0;
  // ⚠️ altFindings is REPORTED, not folded into hasFindings. verify-extraction-coverage.js
  // exits on hasFindings, and every module in the tree is pre-re-extract today — zero alt
  // segments exist corpus-wide — so folding it in turns the existing gate red for 183 of the
  // 196 units it can analyse (re-measured 2026-08-24; this read "all 1,192", wrong ~6x and
  // wrong in the "all" — 13 stay clean)
  // modules the moment this lands. Plan C's driver reads altFindings.ok directly as its own
  // E5 gate, after the §C81 re-extract. Do not widen this without re-extracting first.
  return { listFindings, dupFindings, altFindings, hasFindings };
}
