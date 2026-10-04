/**
 * §C140 ㊾ — every translated figure in `books/<slug>/media/` embeds its fonts under the ㉗ rule, and none embeds
 * the June-era Liberation Sans 1.07.4 TrueType (GPLv2 with the font exception).
 *
 * WHY THIS IS PINNED HERE: the Python checks of the composer (`figis.py`, `refont.py`) run in no CI job, and the
 * re-font of the June copies [USER] keeps (refont.py) brought the TrueType count in media/ to 0 on 2026-10-04. A
 * `keptCopies` entry for another June copy, or a blob restored by hand, would bring the GPL face back with every
 * other gate green (`figure-config-validate` checks that a kept copy EXISTS, not what it embeds).
 *
 * The rule, per file that declares an @font-face:
 *   - no TrueType data URI and no 'LiberationSans' family name anywhere;
 *   - every @font-face family is FigIS (Liberation 2.1.5, figis.py) or FigSym (STIX 1.1.0, figsym.py), as woff2;
 *   - one <metadata> per family embedded (figis.metadata_element / figsym.metadata_element).
 * The rendered copies under 05-publication/ are deliberately NOT checked: they are an older vintage that step 3's
 * re-render replaces (see the register, §C140 ㊾); this file would only pin a known state there.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BOOKS = fileURLToPath(new URL('../../books/', import.meta.url));

/** Problems with one SVG's embedded fonts under the ㉗ rule; [] when it embeds none or follows the rule. */
function fontProblems(svg) {
  const faces = [...svg.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  if (faces.length === 0) return [];
  const out = [];
  if (/data:font\/ttf/.test(svg)) out.push('embeds TrueType (data:font/ttf)');
  if (/LiberationSans/.test(svg)) out.push("names the family 'LiberationSans'");
  const families = new Set();
  for (const body of faces) {
    const fam = (body.match(/font-family:\s*'([^']+)'/) || [])[1];
    if (fam !== 'FigIS' && fam !== 'FigSym') out.push(`@font-face family ${JSON.stringify(fam)}`);
    families.add(fam);
    if (!/data:font\/woff2;base64,/.test(body))
      out.push(`@font-face ${fam} is not a woff2 data URI`);
  }
  const metadata = (svg.match(/<metadata>/g) || []).length;
  if (metadata !== families.size)
    out.push(`${metadata} <metadata> for ${families.size} embedded families`);
  return out;
}

function mediaSvgs() {
  const files = [];
  for (const slug of readdirSync(BOOKS)) {
    const media = join(BOOKS, slug, 'media');
    if (!existsSync(media)) continue;
    for (const f of readdirSync(media)) if (f.endsWith('.svg')) files.push(join(media, f));
  }
  return files;
}

describe('translated figures in media/ embed fonts only under the ㉗ rule (§C140 ㊾)', () => {
  const files = mediaSvgs();
  const withFaces = files.filter((f) => /@font-face/.test(readFileSync(f, 'utf-8')));

  it('the population is real (control: the corpus was read and holds embedded fonts)', () => {
    expect(withFaces.length).toBeGreaterThan(500);
  });

  it('CONTROL — a June-shaped copy (LiberationSans TrueType, no metadata) is reported', () => {
    const june =
      "<svg><style>@font-face{font-family:'LiberationSans';font-weight:normal;font-style:normal;" +
      "src:url(data:font/ttf;base64,AAEA) format('truetype');}</style>" +
      '<text font-family="LiberationSans">a</text></svg>';
    expect(fontProblems(june)).toEqual([
      'embeds TrueType (data:font/ttf)',
      "names the family 'LiberationSans'",
      '@font-face family "LiberationSans"',
      '@font-face LiberationSans is not a woff2 data URI',
      '0 <metadata> for 1 embedded families',
    ]);
  });

  it('CONTROL — a FigIS copy that lost its <metadata> is reported', () => {
    const bare =
      "<svg><style>@font-face{font-family:'FigIS';font-weight:400;font-style:normal;" +
      'src:url(data:font/woff2;base64,d09G) format(\'woff2\');}</style><text font-family="FigIS">a</text></svg>';
    expect(fontProblems(bare)).toEqual(['0 <metadata> for 1 embedded families']);
  });

  it('no media/ SVG embeds TrueType, names LiberationSans, or carries a face without its licence', () => {
    const bad = withFaces
      .map((f) => [f.slice(BOOKS.length), fontProblems(readFileSync(f, 'utf-8'))])
      .filter(([, p]) => p.length);
    expect(bad).toEqual([]);
  });
});
