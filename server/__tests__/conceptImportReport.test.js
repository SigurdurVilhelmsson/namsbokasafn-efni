// server/__tests__/conceptImportReport.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { formatImportReport } = require('../scripts/run-concept-import');

const s = (over = {}) => ({
  collection: 'EFNAFR',
  entries: 100,
  imported: 90,
  skippedNoIcelandic: 10,
  terms: 150,
  byLang: { en: 80, is: 70, la: 0 },
  ...over,
});

describe('formatImportReport', () => {
  it('names every collection', () => {
    const out = formatImportReport([s(), s({ collection: 'PODDUR' })]);
    expect(out).toMatch(/EFNAFR/);
    expect(out).toMatch(/PODDUR/);
  });

  it('reports a zero-yield collection LOUDLY — a silent one bulks out the editor', () => {
    const out = formatImportReport([s({ collection: 'RISAEDLUR', imported: 0, terms: 0 })]);
    expect(out).toMatch(/ZERO YIELD/);
  });

  it('does not flag a healthy collection as zero yield', () => {
    // The control: without this, a formatter that flagged EVERYTHING would pass above.
    expect(formatImportReport([s()])).not.toMatch(/ZERO YIELD/);
  });

  it('flags a Latin-only collection so its editor-only reach is not mistaken for MT reach', () => {
    const out = formatImportReport([
      s({ collection: 'PODDUR', byLang: { en: 0, is: 300, la: 300 } }),
    ]);
    expect(out).toMatch(/LATIN-ONLY/);
  });

  it('totals the imported concepts', () => {
    expect(formatImportReport([s(), s({ imported: 10 })])).toMatch(/100 concepts/);
  });
});
