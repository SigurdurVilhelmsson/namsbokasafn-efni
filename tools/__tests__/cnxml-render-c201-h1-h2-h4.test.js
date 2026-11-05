import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { renderCnxmlToHtml, _loadBookConfigForTest, _setBooksDirForTest } from '../cnxml-render.js';
import { findMixedScriptWords } from '../lib/mixed-script.js';

/**
 * Register §C201: vefur's requests H1, H2 and H4 for the ② re-render
 * (../namsbokasafn-vefur/docs/handoffs/2026-10-16-reader-branches-requests-for-efni.md).
 */

const FIXTURES = join(import.meta.dirname, 'fixtures');

beforeAll(() => {
  _loadBookConfigForTest('efnafraedi-2e');
});

const doc = (
  body
) => `<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">
<title>Prófun</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:content-id>m00009</md:content-id><md:title>Prófun</md:title><md:uuid>00000000-0000-0000-0000-000000000009</md:uuid></metadata>
<content>
${body}
</content>
</document>`;

function png(w, h) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

describe('H1 — every content <img> carries the size it displays at', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'c201-h1-'));
    mkdirSync(join(dir, '01-source', 'media'), { recursive: true });
    mkdirSync(join(dir, 'media'), { recursive: true });
    writeFileSync(join(dir, '01-source', 'media', 'fig.png'), png(640, 480));
    writeFileSync(
      join(dir, 'media', 'fig_IS.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="117pt" height="90pt"/>'
    );
    _setBooksDirForTest(dir);
  });
  afterEach(() => {
    _setBooksDirForTest(null);
    rmSync(dir, { recursive: true, force: true });
  });

  it('on a figure, a standalone media and an inline media in a table cell', () => {
    const { html } = renderCnxmlToHtml(
      doc(`<figure id="f1"><media id="m1" alt="a"><image mime-type="image/svg+xml" src="../../media/fig_IS.svg"/></media></figure>
<media id="m2" alt="b"><image mime-type="image/png" src="../../media/fig.png"/></media>
<table id="t1" summary="s"><tgroup cols="1"><tbody><row><entry><media id="m3" alt="c"><image mime-type="image/png" src="../../media/fig.png"/></media></entry></row></tbody></tgroup></table>`),
      { moduleId: 'm00009', chapter: 1 }
    );
    const imgs = html.match(/<img [^>]*>/g) || [];
    expect(imgs).toHaveLength(3);
    expect(imgs[0]).toContain(' width="156" height="120"');
    expect(imgs[1]).toContain(' width="640" height="480"');
    expect(imgs[2]).toContain(' width="640" height="480"');
  });

  it('control: an image the media dirs do not hold gets no size, never a guess', () => {
    const { html } = renderCnxmlToHtml(
      doc(
        `<figure id="f1"><media id="m1" alt="a"><image mime-type="image/png" src="../../media/missing.png"/></media></figure>`
      ),
      { moduleId: 'm00009', chapter: 1 }
    );
    expect(html).toMatch(/<img [^>]*src="[^"]*missing\.png"/);
    expect(html).not.toMatch(/<img [^>]*width=/);
  });
});

describe('H2 — an introduction carries its outline, not objectives', () => {
  const cnxml = readFileSync(join(FIXTURES, 'minimal-translated.cnxml'), 'utf8');
  const moduleSections = {
    m00001: { section: '0', titleEn: 'Introduction', titleIs: 'Inngangur', slug: 'introduction' },
    m00002: { section: '1', titleEn: 'First', titleIs: 'Fyrsti hluti', slug: 'fyrsti-hluti' },
  };

  it('emits no objectives, and the outline under its own key', () => {
    const { html, pageData } = renderCnxmlToHtml(cnxml, {
      moduleId: 'm00001',
      chapter: 1,
      moduleSections,
    });
    expect(pageData.objectives).toEqual([]);
    expect(pageData.chapterOutline).toEqual([
      expect.objectContaining({ section: '1.1', title: 'Fyrsti hluti' }),
    ]);
    expect(html).not.toContain('Námsmarkmið');
    expect(html).not.toContain('Fyrsta efni'); // the abstract item
    expect(html).toContain('Yfirlit kafla');
  });

  it('control: without section info the module keeps its objectives', () => {
    const { pageData } = renderCnxmlToHtml(cnxml, { moduleId: 'm00001', chapter: 1 });
    expect(pageData.objectives).toEqual(['Fyrsta efni', 'Annað efni']);
    expect(pageData.chapterOutline).toBeUndefined();
  });
});

describe('H4 — footnote back-link in Icelandic; mixed-script words found', () => {
  it('labels the back-link in Icelandic', () => {
    const { html } = renderCnxmlToHtml(
      doc(`<para id="p1">Texti<footnote id="fn1">Neðanmáls.</footnote> hér.</para>`),
      { moduleId: 'm00009', chapter: 1 }
    );
    expect(html).toContain('class="footnote-backref" aria-label="Aftur í meginmál"');
    expect(html).not.toContain('Back to content');
  });

  it('finds the committed word with Cyrillic letters, and only mixed words', () => {
    // "bóрата": its last four letters are Cyrillic (chemistry m68831, §18.3).
    expect(findMixedScriptWords('<p>natríum bóрата er salt</p>')).toEqual(['bóрата']);
    expect(findMixedScriptWords('Менделеев og bórata')).toEqual([]);
    expect(findMixedScriptWords('')).toEqual([]);
  });
});
