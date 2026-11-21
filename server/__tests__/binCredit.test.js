/**
 * G1.16 ([USER] 2026-11-08: "show the credit"): the BÍN credit, one module for the pages and the server.
 *
 * BÍN's terms (docs/decisions/2026-08-06-bin-licensing-corrected-and-malstadur-integration.md,
 * § Attribution) require the rights holder credited, the link https://bin.arnastofnun.is, and any
 * modification stated. The two term models modify the forms differently, so each states its own:
 * the book layer's lookup (server/lib/binInflections.js) SELECTS one entry and drops the base form;
 * the old model's forms came from the deleted tools/fetch_bin_inflections.py, which MERGED every
 * entry sharing a spelling and dropped the base form. A shared sentence would be false for one.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const binCredit = require('../public/js/bin-credit.js');

// The book glossary page's text as it stood in ui-strings.js before it moved here (stage 2, design §5.3).
const BOOK_GLOSSARY_BEFORE =
  'Beygingarmyndir: Beygingarlýsing íslensks nútímamáls (BÍN). Stofnun Árna Magnússonar í íslenskum fræðum. Höfundur og ritstjóri Kristín Bjarnadóttir. bin.arnastofnun.is — CC BY-SA 4.0. Myndunum er breytt: valið er úr þeim og grunnmyndin felld brott.';

describe('bin-credit', () => {
  it('the book glossary page keeps the exact text it showed before the move', () => {
    expect(binCredit.BOOK_GLOSSARY).toBe(BOOK_GLOSSARY_BEFORE);
  });

  it('the old-model credit names the rights holder as BÍN wants it', () => {
    expect(binCredit.OLD_MODEL).toContain(
      'Stofnun Árna Magnússonar í íslenskum fræðum. Höfundur og ritstjóri Kristín Bjarnadóttir.'
    );
  });

  it('the old-model credit carries the link', () => {
    expect(binCredit.OLD_MODEL).toContain('bin.arnastofnun.is');
  });

  it('the old-model credit states its own modification: entries of one spelling merged', () => {
    expect(binCredit.OLD_MODEL).toContain('sameinaðar');
  });

  it("the old-model credit does not claim the book layer's selection", () => {
    expect(binCredit.OLD_MODEL).not.toContain('valið er úr þeim');
  });
});
