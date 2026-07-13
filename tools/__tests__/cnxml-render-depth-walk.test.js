import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e');

function doc(inner) {
  return (
    '<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">' +
    '<title>T</title><content>' +
    inner +
    '</content></document>'
  );
}

function render(inner, extra = {}) {
  return renderCnxmlToHtml(doc(inner), {
    lang: 'is',
    chapter: 3,
    moduleId: 'mWALK',
    moduleSections: {},
    ...extra,
  });
}

describe('depth-aware section walk', () => {
  it('ID-LESS figure inside an exercise renders exactly once (no registry to save it)', () => {
    // Pre-fix: the flat scan itemizes the nested figure top-level; with no id,
    // renderedFigureIds cannot suppress the duplicate → renders twice.
    const html = render(
      '<exercise id="ex1"><problem id="pr1"><para id="p1">Sp</para>' +
        '<figure><media alt="nafnlaus"><image src="anon_fig.jpg" mime-type="image/jpeg"/></media></figure>' +
        '</problem></exercise>'
    ).html;
    expect(html.split('anon_fig.jpg').length - 1).toBe(1);
  });

  it('ID-LESS table inside a note renders exactly once', () => {
    const html = render(
      '<note id="n1"><para id="p1">Ath</para>' +
        '<table summary="s"><tgroup cols="1"><tbody><row><entry>stak_klefi</entry></row></tbody></tgroup></table>' +
        '</note>'
    ).html;
    expect(html.split('stak_klefi').length - 1).toBe(1);
  });

  it('ID-LESS media-bearing list keeps its document position (E6 residual)', () => {
    // Pre-fix: media-strip mutates the list fullMatch; with no id the position
    // fallback collapses to 0 and the list hoists above the preceding para.
    const html = render(
      '<para id="p-before">Á undan.</para>' +
        '<list><item>Skref<media id="mL" alt="s"><image src="in_list.svg" mime-type="image/svg+xml"/></media></item></list>'
    ).html;
    expect(html.indexOf('Á undan.')).toBeLessThan(html.indexOf('in_list.svg'));
  });

  it('media inside a section-level list item renders INSIDE the li (E6 relocation fixed)', () => {
    const html = render(
      '<list id="Lsec"><item>Skref eitt<media id="mS" class="scaled-down" alt="s">' +
        '<image src="sec_step.svg" mime-type="image/svg+xml"/></media></item></list>'
    ).html;
    const li = html.match(/<li>[\s\S]*?<\/li>/)[0];
    expect(li).toContain('sec_step.svg');
    expect(li).toContain('media-inline');
  });

  it('unknown block element (quote) hits the loud seam and does not leak raw', () => {
    const res = render('<quote id="q1">tilvitnun_texti</quote><para id="p1">Eftir.</para>');
    expect(res.undispatchedBlocks.some((b) => b.tag === 'quote')).toBe(true);
    expect(res.html).not.toContain('<quote');
  });

  it('excluded section classes are still dropped at top level', () => {
    const html = render(
      '<para id="p1">Meginmál.</para>' +
        '<section id="s-ex" class="exercises"><title>Æfingar</title><para id="pe">Falið.</para></section>'
    ).html;
    expect(html).toContain('Meginmál.');
    expect(html).not.toContain('Falið.');
  });

  it('non-excluded nested subsections render recursively with deeper headings', () => {
    const html = render(
      '<section id="s1"><title>Ytri</title><para id="p1">A</para>' +
        '<section id="s2"><title>Innri</title><para id="p2">B</para></section></section>'
    ).html;
    expect(html).toContain('<h2>Ytri</h2>');
    expect(html).toContain('<h3>Innri</h3>');
    expect(html.indexOf('A')).toBeLessThan(html.indexOf('Innri'));
  });

  it('a block hoisted out of a top-level para renders standalone AFTER the para', () => {
    const html = render(
      '<para id="ph">Texti á undan <figure id="fh"><media id="mh" alt="h">' +
        '<image src="hoisted.jpg" mime-type="image/jpeg"/></media></figure> og eftir.</para>'
    ).html;
    expect(html.split('hoisted.jpg').length - 1).toBe(1);
    // the para's trailing text stays in the para; the figure renders after it
    expect(html.indexOf('og eftir.')).toBeLessThan(html.indexOf('hoisted.jpg'));
  });

  it('malformed module content throws an Error naming the module', () => {
    expect(() => render('<para id="p1">Óklárað <emphasis>brot</para>')).toThrow(/mWALK/);
  });

  it('serialized-node handoff preserves multi-class attributes regardless of attribute order', () => {
    // The walk hands renderers the SERIALIZED node (xmldom may normalize
    // attribute order/entities); pin that multi-class + id survive intact.
    const html = render(
      '<note class="chemist-portrait unnumbered" id="nAttr"><para id="pA">Efni.</para></note>'
    ).html;
    expect(html).toContain('id="nAttr"');
    expect(html).toContain('note-chemist-portrait unnumbered'); // class value intact through renderNote
    expect(html).toContain('Efni.');
  });
});
