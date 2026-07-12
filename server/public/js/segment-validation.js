/**
 * Shared structural-marker validation (SR-OOS-2).
 *
 * ONE rule set, three consumers: the segment-editor pane, the
 * localization-editor pane, and the server-side save backstop. Rules are
 * pure and return structured violation codes; each consumer formats its
 * own wording (clients via UI.validation, server via its 400 body).
 *
 * blocked  = hard integrity rules (injection/render breaks without them);
 *            the server rejects these on save.
 * warnings = advisory only; NEVER enforced server-side (design D3).
 *
 * UMD: browser global `segmentValidation` + CommonJS module.exports,
 * same pattern as marker-highlight.js.
 */
(function (root) {
  'use strict';

  /**
   * @param {string} enText     EN source segment (trusted, server-loaded)
   * @param {string} originalIs baseline IS text (segment editor: seg.is;
   *                            localization: seg.faithful)
   * @param {string} editedIs   the proposed content
   * @returns {{ blocked: Array<{code:string, params:Object}>|null,
   *             warnings: Array<{code:string, params:Object}>|null }}
   */
  function validateStructure(enText, originalIs, editedIs) {
    const blocked = [];
    const warnings = [];
    const en = enText || '';
    const orig = originalIs || '';
    const edited = editedIs || '';

    // Hard block: [[MATH:N]] in EN but missing from edited IS
    const enMath = en.match(/\[\[MATH:\d+\]\]/g) || [];
    for (let i = 0; i < enMath.length; i++) {
      if (edited.indexOf(enMath[i]) === -1) {
        blocked.push({ code: 'math-missing', params: { marker: enMath[i] } });
      }
    }

    // Hard block: [[BR]] removed (present in original IS but not edited)
    const origBR = orig.match(/\[\[BR\]\]/g) || [];
    const editBR = edited.match(/\[\[BR\]\]/g) || [];
    if (origBR.length > editBR.length) {
      blocked.push({ code: 'br-removed', params: { from: origBR.length, to: editBR.length } });
    }

    // Hard block: [#CNX_...] cross-references in EN but missing from edited IS
    const enXrefs = en.match(/\[#[A-Za-z0-9_.-]+\]/g) || [];
    for (let j = 0; j < enXrefs.length; j++) {
      if (edited.indexOf(enXrefs[j]) === -1) {
        blocked.push({ code: 'xref-missing', params: { ref: enXrefs[j] } });
      }
    }

    // Hard block: [text](#anchor) or [text](doc#target) links in original IS but removed
    const origLinks = orig.match(/\[[^\]]+\]\([^)]+\)/g) || [];
    for (let l = 0; l < origLinks.length; l++) {
      if (edited.indexOf(origLinks[l]) === -1) {
        blocked.push({ code: 'link-removed', params: { link: origLinks[l] } });
      }
    }

    // Hard block: [doc#target] self-closing document refs in EN but missing from edited IS
    const enDocRefs = en.match(/\[[A-Za-z0-9_.-]+#[A-Za-z0-9_.-]+\]/g) || [];
    for (let k = 0; k < enDocRefs.length; k++) {
      if (edited.indexOf(enDocRefs[k]) === -1) {
        blocked.push({ code: 'docref-missing', params: { ref: enDocRefs[k] } });
      }
    }

    // Hard block: [[MEDIA:N]] in EN but missing from edited IS
    const enMedia = en.match(/\[\[MEDIA:\d+\]\]/g) || [];
    for (let n = 0; n < enMedia.length; n++) {
      if (edited.indexOf(enMedia[n]) === -1) {
        blocked.push({ code: 'media-missing', params: { marker: enMedia[n] } });
      }
    }

    // Hard block: [[SPACE]] / [[SPACE:N]] in original IS but removed
    const origSpaces = orig.match(/\[\[SPACE(?::\d+)?\]\]/g) || [];
    const editSpaces = edited.match(/\[\[SPACE(?::\d+)?\]\]/g) || [];
    if (origSpaces.length > editSpaces.length) {
      blocked.push({
        code: 'space-removed',
        params: { from: origSpaces.length, to: editSpaces.length },
      });
    }

    // Hard block: a literal segment-file marker inside the edited content
    // (LEAD-APPROVED design amendment). Content carrying a real marker
    // passes every other guard today and corrupts segment-boundary parsing
    // on apply — parseSegments splits on this exact token, and an injected
    // marker can even shadow a different segment via last-wins duplicate
    // handling. Checks both marker dialects' openings: the canonical
    // `<!-- SEG:` (tools/lib/seg-markers.cjs SEG_MARKER) and the legacy
    // `{{SEG:` mustache form (segmentParser.parseSegments normalizes it to
    // the HTML-comment form before parsing) — either would still corrupt
    // boundaries if it reached a segment file.
    if (edited.indexOf('<!-- SEG:') !== -1) {
      blocked.push({ code: 'seg-marker-injected', params: { marker: '<!-- SEG:' } });
    }
    if (edited.indexOf('{{SEG:') !== -1) {
      blocked.push({ code: 'seg-marker-injected', params: { marker: '{{SEG:' } });
    }

    // Warning: unmatched formatting pairs (odd count)
    const pairs = [
      { marker: '**', re: /\*\*/g },
      { marker: '__', re: /__/g },
      { marker: '++', re: /\+\+/g },
    ];
    for (let p = 0; p < pairs.length; p++) {
      const count = (edited.match(pairs[p].re) || []).length;
      if (count % 2 !== 0) {
        warnings.push({
          code: 'unmatched-pair',
          params: { marker: pairs[p].marker, count: count },
        });
      }
    }

    // Asymmetric pair: {= must match =}
    const openEmph = (edited.match(/\{=/g) || []).length;
    const closeEmph = (edited.match(/=\}/g) || []).length;
    if (openEmph !== closeEmph) {
      warnings.push({ code: 'unmatched-emphasis', params: { open: openEmph, close: closeEmph } });
    }

    // Warning: unmatched ~ for subscript (ignore ~~ strikethrough)
    const tildeCount = (edited.match(/(?<![~])~(?!~)/g) || []).length;
    if (tildeCount % 2 !== 0) {
      warnings.push({ code: 'unmatched-subscript', params: { count: tildeCount } });
    }

    // Warning: unmatched ^ for superscript
    const caretCount = (edited.match(/\^/g) || []).length;
    if (caretCount % 2 !== 0) {
      warnings.push({ code: 'unmatched-superscript', params: { count: caretCount } });
    }

    // Warning: segment cleared when original had content
    if (orig.trim() && !edited.trim()) {
      warnings.push({ code: 'segment-cleared', params: {} });
    }

    return {
      blocked: blocked.length > 0 ? blocked : null,
      warnings: warnings.length > 0 ? warnings : null,
    };
  }

  if (typeof root !== 'undefined')
    root.segmentValidation = { validateStructure: validateStructure };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { validateStructure: validateStructure };
  }
})(typeof window !== 'undefined' ? window : globalThis);
