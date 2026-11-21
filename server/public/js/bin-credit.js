/**
 * The BÍN credit (G1.16; [USER] 2026-11-08: "show the credit" wherever BÍN forms appear).
 *
 * BÍN's terms require three things (docs/decisions/2026-08-06-bin-licensing-corrected-and-malstadur-
 * integration.md, § Attribution): the rights holder credited unambiguously, the link
 * https://bin.arnastofnun.is, and any modification stated. The two term models modify the forms
 * differently, so each has its own modification sentence; a shared one would be false for one of them:
 *   - BOOK_GLOSSARY: the book glossary layer's lookup (server/lib/binInflections.js) chooses one BÍN
 *     entry and drops the base form. Shown on the book glossary page (design §5.3).
 *   - OLD_MODEL: the forms stored on terminology_translations came from the deleted
 *     tools/fetch_bin_inflections.py, which merged the forms of every entry sharing a spelling and
 *     dropped the base form. Shown on the old /terminology screen and carried by its JSON export.
 *
 * UMD: browser global `binCredit` + CommonJS module.exports (the export route needs it), the same
 * pattern as book-glossary-view.js. Pinned by server/__tests__/binCredit.test.js.
 */
(function (root) {
  'use strict';

  const ATTRIBUTION =
    'Beygingarmyndir: Beygingarlýsing íslensks nútímamáls (BÍN). Stofnun Árna Magnússonar í íslenskum fræðum. Höfundur og ritstjóri Kristín Bjarnadóttir. bin.arnastofnun.is — CC BY-SA 4.0.';

  const api = Object.freeze({
    BOOK_GLOSSARY:
      ATTRIBUTION + ' Myndunum er breytt: valið er úr þeim og grunnmyndin felld brott.',
    OLD_MODEL:
      ATTRIBUTION +
      ' Myndunum er breytt: myndir allra BÍN-færslna með sama rithætti eru sameinaðar og grunnmyndin felld brott.',
  });

  root.binCredit = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
