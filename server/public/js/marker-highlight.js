/**
 * marker-highlight.js — character-preserving marker highlighter for the
 * segment-editor textarea backdrop overlay (B-4).
 *
 * highlightMarkersInPlace(text) returns HTML in which EVERY original
 * character is preserved (so the backdrop overlaps the textarea 1:1) and
 * each inline marker is wrapped in a <span class="marker-hl…">.
 *
 * Invariant: stripTags(highlightMarkersInPlace(t)) === escapeHtml(t).
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

  // Each replacement re-inserts the captured original text verbatim and only
  // adds <span> tags, so the character-preservation invariant always holds.
  // ORDERING: [[…]] and {{…}} markers are consumed FIRST, so the later
  // single-bracket and markdown rules cannot mis-match them.
  function highlightMarkersInPlace(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    const atom = (s) => `<span class="marker-hl marker-hl-atom">${s}</span>`;
    const delim = (s) => `<span class="marker-hl marker-hl-delim">${s}</span>`;

    // 1. Bracket atoms (whole marker highlighted).
    html = html.replace(/\[\[MATH:\d+\]\]/g, (m) => atom(m));
    html = html.replace(/\[\[MEDIA:\d+\]\]/g, (m) => atom(m));
    html = html.replace(/\[\[TABLE:[^\]]+\]\]/g, (m) => atom(m));
    html = html.replace(/\[\[SPACE(?::\d+)?\]\]/g, (m) => atom(m));
    html = html.replace(/\[\[BR\]\]/g, (m) => atom(m));

    // 2. Bracket reference markers WITH display text (text|target) — keep text.
    //    Run before the no-text forms so the pipe variant wins.
    html = html.replace(
      /\[\[link:([^|\]]+)\|([^\]]+)\]\]/g,
      (_m, t, u) => `${delim('[[link:')}${t}${delim('|' + u + ']]')}`
    );
    html = html.replace(
      /\[\[xref:([^|\]]+)\|([^\]]+)\]\]/g,
      (_m, t, id) => `${delim('[[xref:')}${t}${delim('|' + id + ']]')}`
    );
    html = html.replace(
      /\[\[docref:([^|\]]+)\|([^\]]+)\]\]/g,
      (_m, t, d) => `${delim('[[docref:')}${t}${delim('|' + d + ']]')}`
    );
    // 2b. Bracket reference markers, no text → atom.
    html = html.replace(/\[\[xref:[^\]]+\]\]/g, (m) => atom(m));
    html = html.replace(/\[\[docref:[^\]]+\]\]/g, (m) => atom(m));

    // 3. Bracket paired-content markers → highlight delimiters, inner plain.
    html = html.replace(/\[\[i:(.+?)\]\]/g, (_m, t) => `${delim('[[i:')}${t}${delim(']]')}`);
    html = html.replace(/\[\[b:(.+?)\]\]/g, (_m, t) => `${delim('[[b:')}${t}${delim(']]')}`);
    html = html.replace(/\[\[sub:(.+?)\]\]/g, (_m, t) => `${delim('[[sub:')}${t}${delim(']]')}`);
    html = html.replace(/\[\[sup:(.+?)\]\]/g, (_m, t) => `${delim('[[sup:')}${t}${delim(']]')}`);

    // 4. Brace markers (term/footnote + legacy emphasis from old files).
    html = html.replace(
      /\{\{term\}\}(.+?)\{\{\/term\}\}/g,
      (_m, t) => `${delim('{{term}}')}${t}${delim('{{/term}}')}`
    );
    html = html.replace(
      /\{\{fn\}\}(.+?)\{\{\/fn\}\}/g,
      (_m, t) => `${delim('{{fn}}')}${t}${delim('{{/fn}}')}`
    );
    html = html.replace(
      /\{\{i\}\}(.+?)\{\{\/i\}\}/g,
      (_m, t) => `${delim('{{i}}')}${t}${delim('{{/i}}')}`
    );
    html = html.replace(
      /\{\{b\}\}(.+?)\{\{\/b\}\}/g,
      (_m, t) => `${delim('{{b}}')}${t}${delim('{{/b}}')}`
    );

    // 5. Legacy single-bracket links + markdown family (old-content tolerance).
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_m, t, u) => `${delim('[')}${t}${delim('](' + u + ')')}`
    );
    html = html.replace(/\[#[A-Za-z0-9_.-]+\]/g, (m) => atom(m));
    html = html.replace(/\[[A-Za-z0-9_.-]+#[A-Za-z0-9_.-]+\]/g, (m) => atom(m));
    html = html.replace(/\[(?:footnote|neðanmálsgrein): [^\]]+\]/g, (m) => atom(m));
    html = html.replace(/\{=(.+?)=\}/g, (_m, t) => `${delim('{=')}${t}${delim('=}')}`);
    html = html.replace(/\*\*(.+?)\*\*/g, (_m, t) => `${delim('**')}${t}${delim('**')}`);
    html = html.replace(
      /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g,
      (_m, t) => `${delim('*')}${t}${delim('*')}`
    );
    html = html.replace(/__(.+?)__/g, (_m, t) => `${delim('__')}${t}${delim('__')}`);
    html = html.replace(
      /(?<!~)~(?!~)(.+?)(?<!~)~(?!~)/g,
      (_m, t) => `${delim('~')}${t}${delim('~')}`
    );
    html = html.replace(/\^(.+?)\^/g, (_m, t) => `${delim('^')}${t}${delim('^')}`);
    html = html.replace(/\+\+(.+?)\+\+/g, (_m, t) => `${delim('++')}${t}${delim('++')}`);

    return html;
  }

  if (typeof root !== 'undefined') root.highlightMarkersInPlace = highlightMarkersInPlace;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { highlightMarkersInPlace };
  }
})(typeof window !== 'undefined' ? window : globalThis);
