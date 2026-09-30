/**
 * §C140 ⑭ — the pure parts of experiments/figure-text-translation/browser-sweep.mjs.
 *
 * The sweep renders every translated figure in three browser engines; these tests pin the parts whose failure would
 * silently mis-measure: the artwork-only split (which must match figparts.split()'s framing contract exactly), the
 * quote-aware open-tag scan, the size rules and the strict flag parser.
 */
import { describe, it, expect } from 'vitest';
import {
  artworkOnly,
  svgOpenTag,
  intrinsicSize,
  displaySize,
  stripFontFaces,
  parseCli,
} from '../../experiments/figure-text-translation/browser-sweep.mjs';

// The framing svgout.write_svg writes: the artwork minus its closing tag, then '\n'-joined parts, then '\n</svg>\n'.
const ART_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100pt" height="50pt" viewBox="0 0 100 50">';
const ART_BODY = '<rect x="0" y="0" width="10" height="10"/>\n';
const composed = (artBody = ART_BODY) =>
  `${ART_OPEN}${artBody}` +
  [
    "<style>@font-face{font-family:'FigIS';font-weight:400;font-style:normal;src:url(data:font/woff2;base64,AAAA) format('woff2');}</style>",
    '<g text-rendering="geometricPrecision">',
    '<metadata>Font: FigIS …</metadata>',
    '<text x="1" y="2" font-family="FigIS">Þyngd</text>',
    '</g>',
  ].join('\n') +
  '\n</svg>\n';

describe('importing the module', () => {
  it('does not set a failure exit code on the importing process (the failure default belongs to main())', () => {
    // The static import at the top of this file has already run by now.
    expect(process.exitCode).not.toBe(1);
  });
});

describe('artworkOnly — the composed figure without its text layer', () => {
  it('drops the last <style> and the text group, keeping the artwork byte-for-byte', () => {
    expect(artworkOnly(composed())).toBe(`${ART_OPEN}${ART_BODY}</svg>\n`);
  });

  it('splits at the LAST <style>, so a <style> inside the artwork survives', () => {
    const body = '<style>.a{fill:red}</style>\n<rect class="a" width="5" height="5"/>\n';
    expect(artworkOnly(composed(body))).toBe(`${ART_OPEN}${body}</svg>\n`);
  });

  it('returns null for an SVG without the composer framing (a June figure), never a guess', () => {
    const june = `${ART_OPEN}<style>@font-face{font-family:LiberationSans}</style><text>x</text></svg>`;
    expect(artworkOnly(june)).toBeNull();
    expect(artworkOnly(`${ART_OPEN}${ART_BODY}</svg>\n`)).toBeNull();
  });
});

describe('svgOpenTag — quote-aware', () => {
  it('does not stop at a ">" inside an attribute value', () => {
    const tag = '<svg data-x="a>b" width="10">';
    expect(svgOpenTag(`<?xml version="1.0"?>\n${tag}<rect/></svg>`)).toBe(tag);
  });
});

describe('intrinsicSize / displaySize', () => {
  it('converts pt to CSS px (96/72)', () => {
    expect(intrinsicSize('<svg width="117pt" height="11.25pt">')).toEqual({ w: 156, h: 15 });
  });

  it('falls back to the viewBox when width/height are absent', () => {
    expect(intrinsicSize('<svg viewBox="0 0 432 115">')).toEqual({ w: 432, h: 115 });
  });

  it('scales down to the max width keeping the aspect, and never scales up', () => {
    expect(displaySize({ w: 1600, h: 400 }, 800)).toEqual({ w: 800, h: 200 });
    expect(displaySize({ w: 156, h: 15 }, 800)).toEqual({ w: 156, h: 15 });
  });
});

describe('stripFontFaces — the nofont control', () => {
  it('removes every @font-face rule and nothing else', () => {
    const s =
      "<style>@font-face{font-family:'A';src:url(x)}.k{fill:red}@font-face{font-family:'B'}</style>";
    expect(stripFontFaces(s)).toBe('<style>.k{fill:red}</style>');
  });
});

describe('parseCli — strict', () => {
  it('refuses an unknown flag rather than ignoring it', () => {
    expect(() => parseCli(['--out', '/tmp/x', '--output-dir', '/tmp/y'])).toThrow(
      /unknown argument/
    );
  });

  it('refuses a valued flag with no value, and an unknown variant', () => {
    expect(() => parseCli(['--out'])).toThrow(/needs a value/);
    expect(() => parseCli(['--out', '/tmp/x', '--variant', 'bogus'])).toThrow(/--variant/);
  });

  it('accepts the notext variant', () => {
    expect(parseCli(['--out', '/tmp/x', '--variant', 'notext']).variant).toBe('notext');
  });

  it('accepts --dir, and refuses it together with --book (two sources of figures is ambiguous)', () => {
    expect(parseCli(['--out', '/tmp/x', '--dir', '/tmp/svgs']).dir).toBe('/tmp/svgs');
    expect(() =>
      parseCli(['--out', '/tmp/x', '--dir', '/tmp/svgs', '--book', 'efnafraedi-2e'])
    ).toThrow(/--dir.*--book|--book.*--dir/);
  });
});

describe('listFigures — the two sources', () => {
  it('lists every *.svg in --dir, named by its basename, sorted', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { listFigures } =
      await import('../../experiments/figure-text-translation/browser-sweep.mjs');
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-dir-'));
    try {
      for (const n of ['b.svg', 'a_IS.svg', 'notes.txt'])
        fs.writeFileSync(path.join(d, n), '<svg/>');
      const got = listFigures({ dir: d, only: null }).map((f) => f.basename);
      expect(got).toEqual(['a_IS', 'b']);
    } finally {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });
});
