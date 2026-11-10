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

  // ── Drawing through the renderer (G1.23 PR3; controller rulings R14 and R21) ──
  //
  // The editor's renderer (renderMarkdownPreview) escapes HTML and then rewrites markers, and some rules copy a
  // capture into an attribute or drop it. So a suggestion is located in the TEXT, marked there with sentinels, the
  // marked text is rendered, and only a mark whose sentinels come out as plain text, in order, is drawn.
  // A sentinel token is SENTINEL.OPEN or SENTINEL.CLOSE, then the mark's id (decimal digits), then SENTINEL.END.
  // Private-use code points: escapeHtml leaves them alone, no marker rule names them, and the committed chemistry
  // text holds none (measured 2026-11-10 over books/efnafraedi-2e).
  const SENTINEL = Object.freeze({ OPEN: '\uE000', CLOSE: '\uE001', END: '\uE002' });
  const SENTINEL_CHAR = /[\uE000-\uE002]/;
  const MARK_ID = /^\d+$/;

  /** @param {string} s @returns {boolean} true if s holds any sentinel code point */
  function hasSentinel(s) {
    return SENTINEL_CHAR.test(String(s));
  }

  /**
   * Every sentinel token, then every lone sentinel code point, removed; nothing else changes.
   * @param {string} html @returns {string}
   */
  function stripSentinels(html) {
    return String(html)
      .replace(/[\uE000\uE001]\d*\uE002/g, '')
      .replace(/[\uE000-\uE002]/g, '');
  }

  /**
   * Wrap each mark's span of `text` in sentinel tokens carrying its id: OPEN id END … CLOSE id END.
   * Marks are in `text`'s coordinates, half-open, in any order; the output never nests.
   * A mark is DROPPED (not wrapped, so fromSentinels can never draw it) when its id is not a non-negative integer
   * or repeats an earlier mark's id, when its span is empty, reversed, non-integer or outside the text, or when it
   * overlaps an earlier-listed mark that was kept (so the earlier wins). Dropping fails closed: the caller sees the
   * mark undrawn, never a nested or misplaced one.
   * @param {string} text
   * @param {Array<{start: number, end: number, id: number|string}>} marks
   * @returns {string}
   * @throws {TypeError} if `text` already holds a sentinel: its own would be indistinguishable from the marks
   *   (check hasSentinel first)
   */
  function withSentinels(text, marks) {
    const s = String(text);
    if (hasSentinel(s)) throw new TypeError('withSentinels: the text already holds a sentinel');
    const kept = [];
    const ids = Object.create(null);
    (Array.isArray(marks) ? marks : []).forEach(function (m) {
      if (!m) return;
      const id = String(m.id);
      if (!MARK_ID.test(id) || ids[id]) return;
      if (!Number.isInteger(m.start) || !Number.isInteger(m.end)) return;
      if (m.start < 0 || m.end > s.length || m.start >= m.end) return;
      const clash = kept.some(function (k) {
        return overlaps(m.start, m.end, k.start, k.end);
      });
      if (clash) return;
      ids[id] = true;
      kept.push({ start: m.start, end: m.end, id: id });
    });
    kept.sort(function (a, b) {
      return a.start - b.start;
    });
    let out = '';
    let at = 0;
    kept.forEach(function (k) {
      out +=
        s.slice(at, k.start) +
        SENTINEL.OPEN +
        k.id +
        SENTINEL.END +
        s.slice(k.start, k.end) +
        SENTINEL.CLOSE +
        k.id +
        SENTINEL.END;
      at = k.end;
    });
    return out + s.slice(at);
  }

  /** True if position `pos` of `html` lies inside a tag (after a '<' with no '>' since). */
  function insideTag(html, pos) {
    return html.lastIndexOf('<', pos) > html.lastIndexOf('>', pos);
  }

  /**
   * Replace each drawable mark in rendered HTML by `drawMark(id, innerHtml)` and strip every other sentinel.
   * A mark is drawable only if its open token and its close token each occur exactly once, the open before the
   * close, the open outside any tag, and nothing between them is a sentinel, '<' or '>' (the rendered find is plain
   * text). Assumes the renderer's attribute values hold no raw '<' or '>' (true after escapeHtml).
   * Never throws for any `html`. The returned HTML holds no sentinel code point except any `drawMark` returns.
   * @param {string} html the renderer's output for a withSentinels(...) text
   * @param {function(string, string): string} drawMark (id, innerHtml) -> the mark's HTML; innerHtml is the
   *   renderer's (already escaped) text between the sentinels
   * @returns {{html: string, drawn: string[]}} drawn ids, in order of appearance
   */
  function fromSentinels(html, drawMark) {
    const s = String(html);
    const token = /([\uE000\uE001])(\d+)\uE002/g;
    const opens = Object.create(null);
    const closes = Object.create(null);
    let m;
    while ((m = token.exec(s)) !== null) {
      const bucket = m[1] === SENTINEL.OPEN ? opens : closes;
      (bucket[m[2]] = bucket[m[2]] || []).push({ start: m.index, end: m.index + m[0].length });
    }
    const draws = [];
    Object.keys(opens).forEach(function (id) {
      const o = opens[id];
      const c = closes[id];
      if (o.length !== 1 || !c || c.length !== 1 || o[0].end > c[0].start) return;
      const inner = s.slice(o[0].end, c[0].start);
      if (/[\uE000-\uE002<>]/.test(inner) || insideTag(s, o[0].start)) return;
      draws.push({ id: id, start: o[0].start, end: c[0].end, inner: inner });
    });
    draws.sort(function (a, b) {
      return a.start - b.start;
    });
    let out = '';
    let at = 0;
    draws.forEach(function (d) {
      out += stripSentinels(s.slice(at, d.start)) + String(drawMark(d.id, d.inner));
      at = d.end;
    });
    return {
      html: out + stripSentinels(s.slice(at)),
      drawn: draws.map(function (d) {
        return d.id;
      }),
    };
  }

  function chainOrder(c) {
    return c && Number.isFinite(c.chainIndex) ? c.chainIndex : 0;
  }

  /**
   * A segment's suggestions drawn into the renderer's HTML, fail closed (spec §4, §6.5, §7; rulings R14, R21).
   *
   * Offered groups: `suggestions.groups` minus any with an op in `paneAcceptedOpIds` (accepted in the open pane, so
   * not offered again) or with a sentinel in a find or replace, placed with visibleGroups. Tags: the pane-accepted
   * ops' changes (looked up in the groups) and `suggestions.tagged`, distinct by opId, in chain order, placed with
   * tagSpans; a swap overlapping a tag is dropped and the tag stays. Every swap and tag span is marked, the marked
   * text rendered, and only drawable marks are drawn (fromSentinels): a group any of whose marks is not drawable is
   * not offered at all, and an undrawable tag is not shown. That repeats until every remaining mark draws. Finally,
   * if the rendered HTML with its sentinels stripped differs from the renderer's own output for `text`, the marks
   * changed how the renderer parsed the text, so nothing is drawn (an addition to R14, measured by the R14 probe).
   * A text that already holds a sentinel is rendered as it is, with nothing drawn and nothing stripped.
   *
   * @param {string} text the displayed text
   * @param {{groups?: object[], tagged?: object[]}|null|undefined} suggestions the segment's served suggestions
   * @param {string[]} paneAcceptedOpIds op ids of the open pane's ai-suggestion items
   * @param {{render: function(string): string,
   *   swap: function({group: object, number: number}, number, string): string,
   *   tag: function(object, string): string}} draw
   *   render: the renderer (text -> HTML); swap(offer, changeIndex, innerHtml): one change of an offered group;
   *   tag(change, innerHtml): an accepted word
   * @returns {{html: string, offered: Array<{group: object, number: number}>}} offered groups in display order,
   *   numbered from 1
   */
  function drawSuggestions(text, suggestions, paneAcceptedOpIds, draw) {
    const s = typeof text === 'string' ? text : '';
    const plain = function () {
      return { html: draw.render(s), offered: [] };
    };
    if (!suggestions || hasSentinel(s)) return plain();
    const groups = Array.isArray(suggestions.groups) ? suggestions.groups : [];
    const tagged = Array.isArray(suggestions.tagged) ? suggestions.tagged : [];
    const accepted = new Set(Array.isArray(paneAcceptedOpIds) ? paneAcceptedOpIds : []);
    const clean = function (c) {
      return (
        c &&
        typeof c.replace === 'string' &&
        !hasSentinel(c.replace) &&
        !(typeof c.find === 'string' && hasSentinel(c.find))
      );
    };

    const offerable = groups.filter(function (g) {
      return (
        g &&
        Array.isArray(g.changes) &&
        g.changes.length > 0 &&
        !g.changes.some(function (c) {
          return !c || accepted.has(c.opId) || !clean(c);
        })
      );
    });
    const tagChanges = [];
    const tagByOp = Object.create(null);
    const addTag = function (c) {
      if (!clean(c) || typeof c.opId !== 'string' || tagByOp[c.opId]) return;
      tagByOp[c.opId] = c;
      tagChanges.push(c);
    };
    groups.forEach(function (g) {
      ((g && g.changes) || []).forEach(function (c) {
        if (c && accepted.has(c.opId)) addTag(c);
      });
    });
    tagged.forEach(addTag);
    tagChanges.sort(function (a, b) {
      return chainOrder(a) - chainOrder(b);
    });
    let liveTags = tagSpans(s, tagChanges);
    let liveSwaps = visibleGroups(s, offerable).filter(function (v) {
      return !v.spans.some(function (a) {
        return liveTags.some(function (t) {
          return overlaps(a.start, a.end, t.start, t.end);
        });
      });
    });

    let meta;
    let rendered;
    for (;;) {
      meta = [];
      const marks = [];
      liveSwaps.forEach(function (v, gi) {
        v.spans.forEach(function (sp, ci) {
          marks.push({ start: sp.start, end: sp.end, id: meta.length });
          meta.push({ kind: 'swap', gi: gi, ci: ci });
        });
      });
      liveTags.forEach(function (t, ti) {
        marks.push({ start: t.start, end: t.end, id: meta.length });
        meta.push({ kind: 'tag', ti: ti });
      });
      rendered = draw.render(withSentinels(s, marks));
      const drawn = new Set(
        fromSentinels(rendered, function () {
          return '';
        }).drawn
      );
      const allDrawn = function (kind, key, index) {
        return meta.every(function (mk, id) {
          return mk.kind !== kind || mk[key] !== index || drawn.has(String(id));
        });
      };
      const keepSwaps = liveSwaps.filter(function (v, gi) {
        return allDrawn('swap', 'gi', gi);
      });
      const keepTags = liveTags.filter(function (t, ti) {
        return allDrawn('tag', 'ti', ti);
      });
      if (keepSwaps.length === liveSwaps.length && keepTags.length === liveTags.length) break;
      liveSwaps = keepSwaps;
      liveTags = keepTags;
    }
    if (stripSentinels(rendered) !== draw.render(s)) return plain();

    const offered = liveSwaps.map(function (v, i) {
      return { group: v.group, number: i + 1 };
    });
    const html = fromSentinels(rendered, function (id, inner) {
      const mk = meta[Number(id)];
      return mk.kind === 'swap'
        ? draw.swap(offered[mk.gi], mk.ci, inner)
        : draw.tag(tagByOp[liveTags[mk.ti].opId], inner);
    }).html;
    return { html: html, offered: offered };
  }

  const api = {
    MARKER_TOKENS: MARKER_TOKENS,
    SENTINEL: SENTINEL,
    hasMarker: hasMarker,
    hasSentinel: hasSentinel,
    applyOnce: applyOnce,
    placeGroup: placeGroup,
    visibleGroups: visibleGroups,
    tagSpans: tagSpans,
    withSentinels: withSentinels,
    fromSentinels: fromSentinels,
    stripSentinels: stripSentinels,
    drawSuggestions: drawSuggestions,
  };
  if (typeof root !== 'undefined') root.suggestionPlacement = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
