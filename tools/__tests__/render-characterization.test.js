import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml } from '../cnxml-render.js';
import { getBookRenderConfig } from '../lib/book-rendering-config.js';

// Render inline module CNXML with a book's real config.
function renderFor(slug, contentCnxml) {
  const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Próf</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00001</md:content-id><md:title>Próf</md:title></metadata>
<content>${contentCnxml}</content>
</document>`;
  return renderCnxmlToHtml(cnxml, {
    moduleId: 'm00001',
    chapter: 1,
    lang: 'is',
    bookConfig: getBookRenderConfig(slug),
  }).html;
}

describe('render characterization: efnafraedi-2e (chemistry)', () => {
  it('renders a chemistry note with its Icelandic label', () => {
    const html = renderFor(
      'efnafraedi-2e',
      '<note id="n" class="chemistry everyday-life"><para id="p">x</para></note>'
    );
    expect(html).toContain('Efnafræði í daglegu lífi');
  });
  it('renders an <example> box', () => {
    const html = renderFor('efnafraedi-2e', '<example id="ex"><para id="p">Dæmi.</para></example>');
    expect(html.toLowerCase()).toContain('example');
  });
});

describe('render characterization: liffraedi-2e (biology)', () => {
  it('liffraedi-2e: renders an inline PhET/YouTube iframe embed', () => {
    const embedMap = {
      'https://www.openstax.org/l/diet_detective': {
        resolved: 'https://www.youtube.com/embed/xyz',
        kind: 'youtube',
        status: 'ok',
      },
    };
    const cnxml = `<document xmlns="http://cnx.rice.edu/cnxml"><content>
    <note id="n1" class="interactive"><para id="p1">Horfðu á myndbandið
      <media id="m1" alt="diet_detective"><iframe width="660" height="371.4"
        src="https://www.openstax.org/l/diet_detective"/></media>.</para></note>
  </content></document>`;
    const { html } = renderCnxmlToHtml(cnxml, { bookSlug: 'liffraedi-2e', chapter: 29, embedMap });
    expect(html).toContain('class="embed-responsive"');
    expect(html).toContain('https://www.youtube.com/embed/xyz');
    expect(html).not.toContain('openstax.org/l/');
  });
  it('renders biology note classes with Icelandic labels', () => {
    const html = renderFor(
      'liffraedi-2e',
      '<note id="a" class="evolution"><para id="p1">x</para></note>' +
        '<note id="b" class="visual-connection"><para id="p2">y</para></note>' +
        '<note id="c" class="career"><para id="p3">z</para></note>'
    );
    expect(html).toContain('Þróun');
    expect(html).toContain('Sjónræn tenging');
    expect(html).toContain('Starfsferill');
  });
  it('renders an inline <exercise> (biology uses inline exercises)', () => {
    const html = renderFor(
      'liffraedi-2e',
      '<exercise id="e"><problem id="pr"><para id="p">Spurning?</para></problem>' +
        '<solution id="so"><para id="ps">Svar.</para></solution></exercise>'
    );
    expect(html.toLowerCase()).toContain('exercise');
  });
  it('renders a biology-shaped module (notes + no <example>) cleanly', () => {
    const html = renderFor(
      'liffraedi-2e',
      '<para id="p">Inngangur.</para><note id="n" class="evolution"><para id="pn">x</para></note>'
    );
    expect(html).toContain('Inngangur.');
    expect(html).toContain('Þróun');
  });
});

describe('render characterization: orverufraedi (microbiology)', () => {
  it('renders a microbiology note class with its Icelandic label', () => {
    const html = renderFor(
      'orverufraedi',
      '<note id="n" class="microbiology clinical-focus"><para id="p">x</para></note>'
    );
    expect(html).toContain('Klínísk sjónarmið');
  });
});

describe('render characterization: lifraen-efnafraedi (organic)', () => {
  it('renders a title-based note (organic has no class-based note labels)', () => {
    const html = renderFor(
      'lifraen-efnafraedi',
      '<note id="n"><title>Athugið</title><para id="p">Texti.</para></note>'
    );
    expect(html).toContain('Athugið');
  });
});

describe('render characterization: edlisfraedi-2e (physics)', () => {
  it('renders a SHARED note label (link-to-learning) for a config without book-specific notes', () => {
    const html = renderFor(
      'edlisfraedi-2e',
      '<note id="n" class="link-to-learning"><para id="p">x</para></note>'
    );
    expect(html).toContain('Tengill til náms');
  });
});
