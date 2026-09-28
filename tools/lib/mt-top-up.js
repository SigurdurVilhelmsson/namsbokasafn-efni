/**
 * mt-top-up.js — the pure halves of the segment TOP-UP (register §C183): plan which EN
 * segments an existing IS file lacks, and splice their translations in.
 *
 * Why it exists: `api-translate`'s run decision is per FILE, so before this a bought book
 * gained a new segment type (chemistry's 191 `:table-summary:` ids) only by a whole-module
 * `--force` — ~30.5k ISK for ~2k ISK of new text, and it silently reverts the hand repairs
 * that live in `02-mt-output` and nowhere else (memory `mt-output-hand-repairs`).
 *
 * 🔴 THE INVARIANT: EVERY SEGMENT ALREADY IN THE IS IS BYTE-IDENTICAL AFTERWARDS.
 * `spliceTopUp` does not merely avoid rewriting old segments, it PROVES it: deleting the
 * inserted chunks from the result must reproduce the old IS byte for byte, or it throws.
 * A parsed-value comparison is weaker — the parser trims, so it cannot see whitespace a
 * neighbouring insertion disturbed.
 *
 * ⚠️ NOTHING HERE TALKS TO THE API. The plan's `wireText` goes through `api-translate`'s
 * guarded core (`translateSegmentText`) like any other paid text; a top-up that sent it any
 * other way would buy with no guard at all.
 *
 * Pure: strings in, strings out.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SEG_MARKER, parseSegmentsMap } = require('./seg-markers.cjs');

const marker = (id) => `<!-- SEG:${id} -->`;

/** How many `\n` a string ends with. */
function trailingNewlines(s) {
  let n = 0;
  while (n < s.length && s[s.length - 1 - n] === '\n') n++;
  return n;
}

/** The raw extent of each segment: from its marker to the next marker (or EOF). */
function rawBlocks(text) {
  const starts = [...text.matchAll(new RegExp(SEG_MARKER.source, 'g'))].map((m) => ({
    id: m[1],
    start: m.index,
  }));
  return starts.map((s, i) => ({
    id: s.id,
    start: s.start,
    end: i + 1 < starts.length ? starts[i + 1].start : text.length,
  }));
}

/**
 * Which EN segments does the IS lack, and what goes on the wire for them?
 *
 * @param {string} enText the module's `02-for-mt` EN segment file
 * @param {string} isText its committed `02-mt-output` IS segment file
 * @returns {{missing: string[], extra: string[], wireText: string}} `missing` in EN order
 *   (a duplicated EN id once); `extra` = IS ids the EN no longer has, which makes the
 *   module NOT an additive top-up; `wireText` = the missing EN segments as a segment file,
 *   every one terminated, '' when nothing is missing
 */
export function planTopUp(enText, isText) {
  const en = parseSegmentsMap(enText);
  const isIds = new Set(parseSegmentsMap(isText).keys());
  const missing = [...en.keys()].filter((id) => !isIds.has(id));
  const extra = [...isIds].filter((id) => !en.has(id));
  const wireText = missing.map((id) => `${marker(id)}\n${en.get(id)}\n\n`).join('');
  return { missing, extra, wireText };
}

/**
 * Splice the translated segments into the IS, each after its nearest EN predecessor that
 * the IS already carries (before the first IS segment when there is none).
 *
 * @param {string} enText the module's EN segment file
 * @param {string} isText the committed IS segment file
 * @param {string} responseText the translation of `planTopUp(enText, isText).wireText`
 * @returns {{text: string, insertions: Array<{offset: number, chunk: string}>,
 *   inserted: string[]}} `insertions` are offsets into `text`; removing them gives
 *   `isText` back exactly
 * @throws when the IS has no segments, carries ids the EN lacks, the response does not
 *   carry exactly the planned ids, or any invariant fails
 */
export function spliceTopUp(enText, isText, responseText) {
  const blocks = rawBlocks(isText);
  if (blocks.length === 0) {
    throw new Error('the IS has no segments — that is a full translation, not a top-up');
  }
  const plan = planTopUp(enText, isText);
  if (plan.extra.length > 0) {
    throw new Error(
      `the IS carries id(s) the EN no longer has: ${plan.extra.join(', ')} — the two sides ` +
        `are different vintages, not an additive change. Refusing to top up.`
    );
  }
  const response = parseSegmentsMap(responseText);
  const planned = new Set(plan.missing);
  const lacking = plan.missing.filter((id) => !response.has(id));
  const unplanned = [...response.keys()].filter((id) => !planned.has(id));
  if (lacking.length > 0 || unplanned.length > 0) {
    const parts = [];
    if (lacking.length) parts.push(`lacks ${lacking.join(', ')}`);
    if (unplanned.length) parts.push(`carries unplanned ${unplanned.join(', ')}`);
    throw new Error(`the top-up response ${parts.join('; ')}. Refusing to splice.`);
  }

  // Group the new ids under their anchor: the last EN id before them that the IS has.
  const oldMap = parseSegmentsMap(isText);
  const groups = new Map();
  let anchor = null;
  for (const id of parseSegmentsMap(enText).keys()) {
    if (oldMap.has(id)) {
      anchor = id;
    } else {
      if (!groups.has(anchor)) groups.set(anchor, []);
      groups.get(anchor).push(id);
    }
  }
  const body = (list) => list.map((id) => `${marker(id)}\n${response.get(id)}`).join('\n\n');
  // Enough newlines to put the next marker on its own line after a blank one.
  const lead = (s) => (s === '' ? '' : '\n'.repeat(Math.max(0, 2 - trailingNewlines(s))));

  let text = '';
  const insertions = [];
  const insert = (chunk) => {
    insertions.push({ offset: text.length, chunk });
    text += chunk;
  };
  const prefix = isText.slice(0, blocks[0].start);
  text += prefix;
  if (groups.has(null)) insert(lead(prefix) + body(groups.get(null)) + '\n\n');
  const anchored = new Set();
  blocks.forEach((b, i) => {
    const raw = isText.slice(b.start, b.end);
    text += raw;
    if (!groups.has(b.id) || anchored.has(b.id)) return;
    anchored.add(b.id);
    // After the LAST segment, mirror the file's own ending (the committed files end with
    // no newline); anywhere else, the next marker needs a blank line before it.
    const isLast = i === blocks.length - 1;
    const trail = isLast ? '\n'.repeat(trailingNewlines(raw)) : '\n\n';
    insert(lead(raw) + body(groups.get(b.id)) + trail);
  });

  assertInvariants({ enText, isText, response, oldMap, text, insertions });
  return { text, insertions, inserted: plan.missing };
}

/** The splice's proof obligations. A failure here is a bug in this module, never the MT. */
function assertInvariants({ enText, isText, response, oldMap, text, insertions }) {
  let rebuilt = text;
  for (const { offset, chunk } of [...insertions].reverse()) {
    rebuilt = rebuilt.slice(0, offset) + rebuilt.slice(offset + chunk.length);
  }
  if (rebuilt !== isText) {
    throw new Error('top-up splice invariant broken: the old IS is not a byte-exact subsequence');
  }
  const got = parseSegmentsMap(text);
  const enIds = [...parseSegmentsMap(enText).keys()];
  const sameIds = got.size === enIds.length && enIds.every((id) => got.has(id));
  if (!sameIds) {
    throw new Error('top-up splice invariant broken: the result id set differs from the EN');
  }
  for (const [id, value] of got) {
    const want = oldMap.has(id) ? oldMap.get(id) : response.get(id);
    if (value !== want) {
      throw new Error(`top-up splice invariant broken: ${id} does not carry its expected text`);
    }
  }
  // parseSegmentsMap is first-wins, so the checks above cannot see a new segment inserted
  // TWICE (after a duplicated anchor). Count its raw markers instead.
  const counts = new Map();
  for (const m of text.matchAll(new RegExp(SEG_MARKER.source, 'g'))) {
    counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  }
  for (const id of response.keys()) {
    if (counts.get(id) !== 1) {
      throw new Error(`top-up splice invariant broken: ${id} appears ${counts.get(id)} times`);
    }
  }
}
