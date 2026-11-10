/**
 * Placement rule for the AI term pass's suggestion groups (G1.23, spec §6.5 and §7).
 *
 * One DOM-free file used by the browser (global `suggestionPlacement`) and the server
 * (`require`), so both decide identically where a group's changes land in the displayed text.
 * A group is one ruling's changes in one segment: `{ key, changes: [{ opId, find, replace, chainIndex }] }`,
 * the changes in chain order. Intervals are half-open [start, end); two overlap iff
 * a.start < b.end && b.start < a.end (adjacent is not overlapping).
 */
(function (root) {
  const MARKER_TOKENS = Object.freeze(['[[', ']]', '**', '__', '<!--', '|']);

  /** @param {string} s @returns {boolean} true if s contains any marker token */
  function hasMarker(s) {
    return MARKER_TOKENS.some(function (t) {
      return String(s).indexOf(t) !== -1;
    });
  }

  /**
   * Replace `find` by `replace` only if `find` occurs exactly once (the apply tool's rule).
   * @returns {string|null} the new text, or null on zero or several occurrences
   */
  function applyOnce(text, find, replace) {
    if (!find) return null;
    const at = text.indexOf(find);
    if (at < 0 || text.indexOf(find, at + 1) !== -1) return null;
    return text.slice(0, at) + replace + text.slice(at + find.length);
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  /**
   * Apply a group's changes in order and report each change's span in `text`'s coordinates.
   * Change i is searched in the intermediate text (after changes 0..i-1).
   * @returns {{ok: true, result: string, spans: Array<{opId: string, start: number, end: number}>}
   *   | {ok: false, reason: 'marker'|'not-unique'|'overlap'}}
   */
  function placeGroup(text, group) {
    const changes = group.changes;
    for (let i = 0; i < changes.length; i++) {
      if (hasMarker(changes[i].find) || hasMarker(changes[i].replace)) {
        return { ok: false, reason: 'marker' };
      }
    }
    let cur = text;
    // Earlier changes' replaced regions, in current coordinates, with the length each one removed.
    const regions = [];
    const spans = [];
    for (let i = 0; i < changes.length; i++) {
      const c = changes[i];
      const next = applyOnce(cur, c.find, c.replace);
      if (next === null) return { ok: false, reason: 'not-unique' };
      const at = cur.indexOf(c.find);
      const end = at + c.find.length;
      let shift = 0;
      for (let j = 0; j < regions.length; j++) {
        const r = regions[j];
        if (overlaps(at, end, r.start, r.end)) return { ok: false, reason: 'overlap' };
        if (r.end <= at) shift += r.delta;
      }
      const start = at + shift;
      spans.push({ opId: c.opId, start: start, end: start + c.find.length });
      const growth = c.replace.length - c.find.length;
      for (let j = 0; j < regions.length; j++) {
        if (regions[j].start >= end) {
          regions[j].start += growth;
          regions[j].end += growth;
        }
      }
      regions.push({
        start: at,
        end: at + c.replace.length,
        delta: c.find.length - c.replace.length,
      });
      cur = next;
    }
    return { ok: true, result: cur, spans: spans };
  }

  /**
   * The groups shown against `text`: each placed independently on the same text, in the given order
   * (callers order by first chainIndex); failures are dropped; a group whose spans overlap an
   * already-kept group's spans is dropped, so the earlier wins.
   * @returns {Array<{group: object, spans: Array}>}
   */
  function visibleGroups(text, groups) {
    const kept = [];
    groups.forEach(function (group) {
      const placed = placeGroup(text, group);
      if (!placed.ok) return;
      const clash = kept.some(function (k) {
        return k.spans.some(function (a) {
          return placed.spans.some(function (b) {
            return overlaps(a.start, a.end, b.start, b.end);
          });
        });
      });
      if (!clash) kept.push({ group: group, spans: placed.spans });
    });
    return kept;
  }

  /**
   * Locate accepted replacements in a saved text. A change is tagged only if its `replace` occurs
   * exactly once outside the spans already tagged in this call; an empty replace is never tagged.
   * @returns {Array<{opId: string, start: number, end: number}>}
   */
  function tagSpans(text, changes) {
    const tagged = [];
    changes.forEach(function (c) {
      const rep = c.replace;
      if (!rep) return;
      const hits = [];
      let at = text.indexOf(rep);
      while (at !== -1) {
        const end = at + rep.length;
        const blocked = tagged.some(function (t) {
          return overlaps(at, end, t.start, t.end);
        });
        if (!blocked) hits.push(at);
        at = text.indexOf(rep, at + 1);
      }
      if (hits.length === 1)
        tagged.push({ opId: c.opId, start: hits[0], end: hits[0] + rep.length });
    });
    return tagged;
  }

  const api = {
    MARKER_TOKENS: MARKER_TOKENS,
    hasMarker: hasMarker,
    applyOnce: applyOnce,
    placeGroup: placeGroup,
    visibleGroups: visibleGroups,
    tagSpans: tagSpans,
  };
  if (typeof root !== 'undefined') root.suggestionPlacement = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
