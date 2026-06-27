/**
 * term-highlight.js — glossary-term highlighter for the segment editor's EN pane
 * (B-4).
 *
 * highlightTermsInHtml(html, matches) wraps the first occurrence of each matched
 * glossary headword with a clickable <span class="term-highlight…">.
 *
 * `html` is ALREADY-RENDERED, escaped HTML (renderMarkdownPreview output): it
 * contains tags and Icelandic title="…" attributes — e.g. [[link:]] chips whose
 * title carries the full URL. The matcher is therefore TAG-AWARE: it only ever
 * rewrites text runs, never the inside of a tag/attribute. A headword that
 * happens to appear in a URL, class name, or attribute value can't splice broken
 * markup (the B-4 span-splice guard; 0 collisions in committed glossaries today,
 * but cheap insurance).
 *
 * Whole-word matching uses \p{L}/\p{N} lookarounds (mirrors
 * terminologyService.wholeWordRegex) rather than \b, so it behaves the same way
 * on both sides of the editor.
 *
 * Dual-mode: attaches to window in the browser and exports for Vitest.
 */
(function (root) {
  function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  function escapeRegexStr(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Case-insensitive, Unicode-aware, single (non-global) whole-word matcher.
  function wholeWordRegex(escaped) {
    return new RegExp(`(?<![\\p{L}\\p{N}_])(${escaped})(?![\\p{L}\\p{N}_])`, 'iu');
  }

  function highlightTermsInHtml(html, matches) {
    if (!html || !matches || matches.length === 0) return html || '';

    // Longest first so "molar mass" matches before "mass".
    const sorted = [...matches].sort((a, b) => b.english.length - a.english.length);
    const used = new Set();

    for (const m of sorted) {
      const key = m.english.toLowerCase();
      if (used.has(key)) continue;
      const pattern = wholeWordRegex(escapeRegexStr(escapeHtml(m.english)));

      // Re-tokenize on every pass: a <span> injected by an earlier term is now a
      // tag token and gets skipped, so its attributes (class="term-highlight",
      // data-term-id="…") can never be re-matched by a later headword. A `depth`
      // counter additionally keeps us out of the *text* of an existing
      // term-highlight span, so a shorter headword (e.g. "mass") never re-wraps
      // inside a longer one ("molar mass") — the more specific term wins.
      const tokens = html.split(/(<[^>]+>)/);
      let depth = 0;
      let done = false;
      for (let i = 0; i < tokens.length && !done; i++) {
        const tok = tokens[i];
        if (tok.startsWith('<')) {
          if (tok.startsWith('</span') && depth > 0) depth--;
          else if (tok.startsWith('<span') && tok.includes('term-highlight')) depth++;
          continue;
        }
        if (depth > 0 || !pattern.test(tok)) continue;
        const cls = m.status === 'approved' ? 'term-highlight' : 'term-highlight proposed';
        tokens[i] = tok.replace(
          pattern,
          (match) =>
            `<span class="${cls}" data-term-id="${m.headwordId}" onclick="showTermPopup(${m.headwordId}, this)">${match}</span>`
        );
        used.add(key);
        done = true;
      }
      if (done) html = tokens.join('');
    }
    return html;
  }

  if (typeof root !== 'undefined') root.highlightTermsInHtml = highlightTermsInHtml;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { highlightTermsInHtml };
  }
})(typeof window !== 'undefined' ? window : globalThis);
