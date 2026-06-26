import { describe, it, expect } from 'vitest';
import { applyImageBasenameSwaps } from '../cnxml-inject.js';

// The "from-scratch SVG" image-localization route: swap any <image> whose src
// basename matches a translated variant, regardless of the enclosing element
// (figure / example / exercise / standalone media). Distinct from the legacy
// figure-id mechanism, which only swaps <figure> images.

const MAP = [
  {
    originalImage: 'CNX_Chem_01_05_SigDigits1_img',
    outputName: 'CNX_Chem_01_05_SigDigits1_img_IS.svg',
    extension: '.svg',
  },
];

describe('applyImageBasenameSwaps', () => {
  it('swaps src and mime-type for an image inside an <example>', () => {
    const cnxml =
      '<example><media id="m"><image mime-type="image/jpeg" src="../../media/CNX_Chem_01_05_SigDigits1_img.jpg"/></media></example>';
    const out = applyImageBasenameSwaps(cnxml, MAP);
    expect(out).toContain('src="../../media/CNX_Chem_01_05_SigDigits1_img_IS.svg"');
    expect(out).toContain('mime-type="image/svg+xml"');
    expect(out).not.toContain('SigDigits1_img.jpg');
  });

  it('preserves the path prefix when swapping', () => {
    const cnxml = '<image src="../../media/CNX_Chem_01_05_SigDigits1_img.jpg"/>';
    expect(applyImageBasenameSwaps(cnxml, MAP)).toContain(
      'src="../../media/CNX_Chem_01_05_SigDigits1_img_IS.svg"'
    );
  });

  it('handles src appearing before mime-type (attribute order independence)', () => {
    const cnxml =
      '<image src="../../media/CNX_Chem_01_05_SigDigits1_img.jpg" mime-type="image/jpeg"/>';
    const out = applyImageBasenameSwaps(cnxml, MAP);
    expect(out).toContain('CNX_Chem_01_05_SigDigits1_img_IS.svg');
    expect(out).toContain('mime-type="image/svg+xml"');
  });

  it('leaves images with no mapping entry untouched', () => {
    const cnxml = '<image mime-type="image/jpeg" src="../../media/CNX_Chem_01_99_Other.jpg"/>';
    expect(applyImageBasenameSwaps(cnxml, MAP)).toBe(cnxml);
  });

  it('matches the basename exactly (no partial/prefix collision)', () => {
    // SigDigits1_img must not be swapped by an entry for SigDigits1
    const map = [
      { originalImage: 'CNX_Chem_01_05_SigDigits1', outputName: 'X_IS.svg', extension: '.svg' },
    ];
    const cnxml = '<image src="../../media/CNX_Chem_01_05_SigDigits1_img.jpg"/>';
    expect(applyImageBasenameSwaps(cnxml, map)).toBe(cnxml);
  });

  it('ignores legacy figure-id entries that lack originalImage', () => {
    const legacy = [{ figureId: 'fig-1', outputName: 'Figure_is.jpg', extension: '.jpg' }];
    const cnxml = '<image src="../../media/CNX_Chem_01_05_SigDigits1_img.jpg"/>';
    expect(applyImageBasenameSwaps(cnxml, legacy)).toBe(cnxml);
  });

  it('is a no-op for an empty or missing map', () => {
    const cnxml = '<image src="../../media/x.jpg"/>';
    expect(applyImageBasenameSwaps(cnxml, [])).toBe(cnxml);
    expect(applyImageBasenameSwaps(cnxml, null)).toBe(cnxml);
  });
});
