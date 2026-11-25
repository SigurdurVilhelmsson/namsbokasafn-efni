/**
 * Word-level diff for the Fable comparison panel (spec of 2026-11-24, §6.8).
 *
 * wordDiff(before, after) tokenises both texts and runs a longest-common-subsequence over the tokens.
 * A token is a whole `[[…]]` bracket marker, a run of letters/digits, a whitespace run, or one
 * punctuation character. A marker is never split, so a changed marker reads as one deletion plus one
 * insertion, as it appears in the editor.
 *
 * renderWordDiffHtml(ops) escapes EVERY token: the texts are editors' words, and the result is set
 * with innerHTML.
 *
 * UMD: browser global `wordDiff` + CommonJS module.exports, same pattern as segment-validation.js.
 */
(function (root) {
  'use strict';

  // Longest alternatives first: a marker, then a word, then whitespace, then any one other character.
  const TOKEN = /\[\[[\s\S]*?\]\]|[\p{L}\p{N}_]+|\s+|[\s\S]/gu;

  /** @param {string} text @returns {string[]} */
  function tokenize(text) {
    return String(text == null ? '' : text).match(TOKEN) || [];
  }

  /**
   * @param {string} before
   * @param {string} after
   * @returns {Array<{op: 'same'|'del'|'ins', text: string}>} adjacent ops of one kind are merged;
   *   same+ins texts joined give `after`, same+del texts joined give `before`.
   */
  function wordDiff(before, after) {
    const a = tokenize(before);
    const b = tokenize(after);
    const n = a.length;
    const m = b.length;
    // lcs[i][j] = LCS length of a[i..] and b[j..]
    const lcs = [];
    for (let i = 0; i <= n; i++) lcs.push(new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    const ops = [];
    const push = (op, text) => {
      const last = ops[ops.length - 1];
      if (last && last.op === op) last.text += text;
      else ops.push({ op: op, text: text });
    };
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        push('same', a[i]);
        i++;
        j++;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
        push('del', a[i++]);
      } else {
        push('ins', b[j++]);
      }
    }
    while (i < n) push('del', a[i++]);
    while (j < m) push('ins', b[j++]);
    return ops;
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

  const api = { wordDiff: wordDiff, renderWordDiffHtml: renderWordDiffHtml };
  if (typeof root !== 'undefined') root.wordDiffLib = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
