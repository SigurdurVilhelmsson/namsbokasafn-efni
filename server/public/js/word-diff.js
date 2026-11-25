/**
 * Word-level diff for the Fable comparison panel (spec of 2026-11-24, §6.8).
 *
 * wordDiff(before, after) tokenises both texts, trims the tokens the two share at the start and at the end,
 * and runs a longest-common-subsequence over the rest. A token is a whole `[[…]]` bracket marker, a run of
 * letters/digits, a whitespace run, or one punctuation character. A marker is never split, so a changed
 * marker reads as one deletion plus one insertion, as it appears in the editor.
 *
 * A marker NESTED inside another (`10[[sup:[[i:x]]]]`, a footnote holding `[[i:W]]`) is one token up to the
 * `]]` that closes the outer marker: chemistry's Fable layer has such markers (a few hundred segments). A
 * `[[` that is never closed at depth 0 falls back to ending at the first `]]` after it, as before.
 *
 * The LCS table costs one cell per pair of remaining tokens. Past MAX_CELLS (chemistry's appendix table
 * summaries reach 154 M cells), wordDiff does not mark words: it returns the whole `before` as one deletion
 * and the whole `after` as one insertion, which the panel shows as the two texts, escaped.
 *
 * renderWordDiffHtml(ops) escapes EVERY token: the texts are editors' words, and the result is set
 * with innerHTML.
 *
 * UMD: browser global `wordDiff` + CommonJS module.exports, same pattern as segment-validation.js.
 */
(function (root) {
  'use strict';

  // Outside a marker: a word, then whitespace, then any one other character (sticky, read at a position).
  const PLAIN = /[\p{L}\p{N}_]+|\s+|[\s\S]/uy;

  /**
   * The end (exclusive) of the marker that opens at `start`, counting nested `[[`/`]]` pairs; -1 if none.
   * @param {string} s @param {number} start index of a `[[`
   */
  function markerEnd(s, start) {
    let depth = 0;
    let i = start;
    while (i < s.length - 1) {
      if (s[i] === '[' && s[i + 1] === '[') {
        depth++;
        i += 2;
      } else if (s[i] === ']' && s[i + 1] === ']') {
        depth--;
        i += 2;
        if (depth === 0) return i;
      } else {
        i++;
      }
    }
    // Never closed at depth 0: end at the first `]]`, as a non-nesting reader would.
    const close = s.indexOf(']]', start + 2);
    return close >= 0 ? close + 2 : -1;
  }

  // The cell budget: about 4 MB of table (Uint16) and tens of milliseconds at most. Every LCS value is at
  // most min(rows, columns) <= sqrt(MAX_CELLS) < 65536, so a Uint16 cell cannot overflow.
  const MAX_CELLS = 2000000;

  /** @param {string} text @returns {string[]} */
  function tokenize(text) {
    const s = String(text == null ? '' : text);
    const out = [];
    let i = 0;
    while (i < s.length) {
      if (s[i] === '[' && s[i + 1] === '[') {
        const end = markerEnd(s, i);
        if (end > 0) {
          out.push(s.slice(i, end));
          i = end;
          continue;
        }
      }
      PLAIN.lastIndex = i;
      const m = PLAIN.exec(s);
      out.push(m[0]);
      i += m[0].length;
    }
    return out;
  }

  /**
   * @param {string} before
   * @param {string} after
   * @returns {Array<{op: 'same'|'del'|'ins', text: string}>} adjacent ops of one kind are merged;
   *   same+ins texts joined give `after`, same+del texts joined give `before`.
   */
  function wordDiff(before, after) {
    return diffOps(before, after).ops;
  }

  /**
   * wordDiff's work, plus whether the texts were past the budget (then ops is the two texts whole).
   * @param {string} before @param {string} after
   * @returns {{ ops: Array<{op: 'same'|'del'|'ins', text: string}>, whole: boolean }}
   */
  function diffOps(before, after) {
    const beforeText = String(before == null ? '' : before);
    const afterText = String(after == null ? '' : after);
    const a = tokenize(beforeText);
    const b = tokenize(afterText);
    const ops = [];
    const push = (op, text) => {
      if (!text) return;
      const last = ops[ops.length - 1];
      if (last && last.op === op) last.text += text;
      else ops.push({ op: op, text: text });
    };

    // Common prefix and suffix, in tokens.
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
      endA--;
      endB--;
    }
    const n = endA - start;
    const m = endB - start;

    if (n * m > MAX_CELLS) {
      // Too large to mark word by word: the two texts whole.
      push('del', beforeText);
      push('ins', afterText);
      return { ops: ops, whole: true };
    }

    push('same', a.slice(0, start).join(''));
    // lcs[i * w + j] = LCS length of a[start+i..endA) and b[start+j..endB)
    const w = m + 1;
    const lcs = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      const ai = a[start + i];
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * w + j] =
          ai === b[start + j]
            ? lcs[(i + 1) * w + j + 1] + 1
            : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[start + i] === b[start + j]) {
        push('same', a[start + i]);
        i++;
        j++;
      } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
        push('del', a[start + i++]);
      } else {
        push('ins', b[start + j++]);
      }
    }
    while (i < n) push('del', a[start + i++]);
    while (j < m) push('ins', b[start + j++]);
    push('same', a.slice(endA).join(''));
    return { ops: ops, whole: false };
  }

  /** @param {string} text */
  function escape(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** @param {Array<{op: string, text: string}>} ops @returns {string} */
  function renderWordDiffHtml(ops) {
    return ops
      .map(function (o) {
        const t = escape(o.text);
        if (o.op === 'del') return '<del class="fable-diff-del">' + t + '</del>';
        if (o.op === 'ins') return '<ins class="fable-diff-ins">' + t + '</ins>';
        return '<span class="fable-diff-same">' + t + '</span>';
      })
      .join('');
  }

  /**
   * The comparison panel's HTML for one flagged segment: the diff of `before` against the served text.
   * Built on demand (the panel's first opening), never on a table render. Past the cell budget it is the
   * two texts as two plain escaped blocks, before then after (the panel's heading names them), with no
   * deletion or insertion marks: marking every word would read as a rewrite of the whole segment.
   * @param {string} before @param {string} after @returns {string}
   */
  function comparisonHtml(before, after) {
    const d = diffOps(before, after);
    if (!d.whole) return renderWordDiffHtml(d.ops);
    return (
      '<div class="fable-diff-whole fable-diff-before">' +
      escape(String(before == null ? '' : before)) +
      '</div><div class="fable-diff-whole fable-diff-after">' +
      escape(String(after == null ? '' : after)) +
      '</div>'
    );
  }

  const api = {
    wordDiff: wordDiff,
    renderWordDiffHtml: renderWordDiffHtml,
    comparisonHtml: comparisonHtml,
    MAX_CELLS: MAX_CELLS,
  };
  if (typeof root !== 'undefined') root.wordDiffLib = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
