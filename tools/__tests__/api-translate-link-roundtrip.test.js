/**
 * §C170 — `[[link:label|url]]` must reach the paid MT as TRANSLATABLE PROSE.
 *
 * 🔴 THE LABEL IS THE WORD A READER CLICKS. Measured 2026-09-21 over both kept
 * books, all chapters: 118 `[[link:]]` labels comparable EN vs IS, **47
 * identical**, of which **5 are proper nouns correctly left alone** (`PhET
 * Reactions & Rates`, `Royal Society of Chemistry`, `Handbook of Chemistry and
 * Physics`) and **42 are common nouns genuinely untranslated** — `video` x12,
 * `site` x7, `link` x6, `website` x4, `here` x3, plus `animation`, `view`,
 * `cartoon`, `information` and others. Spread over 15 chapters, ch01–ch08
 * included, so it is not confined to one campaign.
 *
 * ▶ **THE CLASSIFICATION IS THE FINDING.** Reporting the identical-count as the
 * defect count would have been wrong by 5 and would have prescribed translating
 * `Royal Society of Chemistry`.
 *
 * 🔴 THE WORST SHAPE IS A DUPLICATED WORD, NOT A MISSING ONE. ch14
 * m68808:para:fs-idm108605600 reads
 *   `Skoðaðu [[link:information|http://openstax.org/l/16BufferSystem]] upplýsingar um…`
 * — the model treated the marker as opaque, translated *information* ->
 * *upplýsingar* OUTSIDE it, and left the label English. The reader sees the same
 * word twice, in two languages, and the English one is the link.
 *
 * ✅ THE PRECEDENT IS `docref` (§C118 ⑯) AND THE SHAPE IS IDENTICAL: prose `|`
 * opaque-id. `link` joins `PAIRED_WIRE_TYPES` so the label rides as bare text
 * between delimiters, and `PAIRED_REQUIRES_ID` so a hypothetical bare
 * `[[link:https://…]]` is never sent as prose — the same negative control that
 * protects a bare `[[docref:m00164]]`.
 *
 * ⚠️ MEASURED BEFORE WRITING, AND IT CHANGED THE SCOPE: `xref` looks like the
 * same shape and IS NOT. Over both books: `link` 147 markers, **147 with a
 * top-level `|`, 0 bare**; `xref` 1,579 markers, **1,578 BARE** (they are figure
 * and section target ids such as `CNX_Chem_01_01_Alchemist`). Adding `xref` here
 * would have sent 1,578 identifiers to be translated as prose.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTermFnToPaired, reattachIds } from '../api-translate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SEG = (id, body) => `<!-- SEG:${id} -->\n${body}\n`;

describe('§C170 — a link LABEL rides the wire as translatable prose', () => {
  it('rewrites [[link:label|url]] to paired form, and the URL never rides the wire', () => {
    const chunk = SEG(
      'm1:para:a',
      'Skoðaðu [[link:information|http://openstax.org/l/16Buffer]] hér.'
    );
    const { wireText } = stripTermFnToPaired(chunk);
    expect(wireText).toContain('[[link]]information[[/link]]');
    // The whole point: the model must not be shown the URL.
    expect(wireText).not.toContain('http://openstax.org/l/16Buffer');
  });

  it('re-attaches the URL after an IDENTITY MT — the value survives end to end', () => {
    const original = 'Skoðaðu [[link:information|http://openstax.org/l/16Buffer]] hér.';
    const chunk = SEG('m1:para:a', original);
    const { wireText, segments } = stripTermFnToPaired(chunk);
    const { text } = reattachIds(wireText, segments); // identity MT: unchanged wire
    expect(text).toContain('[[link:information|http://openstax.org/l/16Buffer]]');
  });

  it('carries a TRANSLATED label back into the marker, with its URL intact', () => {
    const chunk = SEG(
      'm1:para:a',
      'Skoðaðu [[link:information|http://openstax.org/l/16Buffer]] hér.'
    );
    const { wireText, segments } = stripTermFnToPaired(chunk);
    const translated = wireText.replace(
      '[[link]]information[[/link]]',
      '[[link]]upplýsingar[[/link]]'
    );
    const { text } = reattachIds(translated, segments);
    expect(text).toContain('[[link:upplýsingar|http://openstax.org/l/16Buffer]]');
    expect(text).not.toContain('information');
  });

  it('NEGATIVE CONTROL — a bare [[link:url]] is left alone, never sent as prose', () => {
    // Same protection a bare [[docref:m00164]] gets. 0 such links exist today;
    // this pins the behaviour so a future one cannot become a translated URL.
    const chunk = SEG('m1:para:a', 'Sjá [[link:https://example.org/thing]] núna.');
    const { wireText } = stripTermFnToPaired(chunk);
    expect(wireText).toContain('[[link:https://example.org/thing]]');
    expect(wireText).not.toContain('[[link]]');
  });

  it('a whole-segment link rides as BARE label, with no marker syntax on the wire', () => {
    const chunk = SEG('m1:para:a', '[[link:density simulation|http://openstax.org/l/16phetdens]]');
    const { wireText, segments } = stripTermFnToPaired(chunk);
    expect(wireText).toContain('density simulation');
    expect(wireText).not.toContain('[[link');
    const { text } = reattachIds(wireText, segments);
    expect(text).toContain('[[link:density simulation|http://openstax.org/l/16phetdens]]');
  });
});

describe('THE CORPUS PREMISE THAT LICENSES THIS — measured, not assumed', () => {
  const topLevelPipe = (inner) => {
    let d = 0;
    for (let i = 0; i < inner.length; i++) {
      if (inner.startsWith('[[', i)) {
        d++;
        i++;
      } else if (inner.startsWith(']]', i)) {
        d--;
        i++;
      } else if (inner[i] === '|' && d === 0) return i;
    }
    return -1;
  };
  const scan = (text, type) => {
    const open = `[[${type}:`;
    const out = [];
    let i = 0;
    while (i < text.length) {
      if (!text.startsWith(open, i)) {
        i++;
        continue;
      }
      let j = i + open.length;
      let d = 1;
      while (j < text.length && d > 0) {
        if (text.startsWith('[[', j)) {
          d++;
          j += 2;
        } else if (text.startsWith(']]', j)) {
          d--;
          if (d === 0) break;
          j += 2;
        } else j++;
      }
      if (d !== 0) break;
      out.push(text.slice(i + open.length, j));
      i = j + 2;
    }
    return out;
  };
  const corpus = (type) => {
    let total = 0;
    let bare = 0;
    for (const b of ['efnafraedi-2e', 'lifraen-efnafraedi']) {
      const root = path.join(ROOT, 'books', b, '02-for-mt');
      if (!fs.existsSync(root)) continue;
      for (const ch of fs.readdirSync(root)) {
        const d = path.join(root, ch);
        if (!fs.statSync(d).isDirectory()) continue;
        for (const f of fs.readdirSync(d)) {
          if (!f.endsWith('.en.md')) continue;
          for (const inner of scan(fs.readFileSync(path.join(d, f), 'utf8'), type)) {
            total++;
            if (topLevelPipe(inner) < 0) bare++;
          }
        }
      }
    }
    return { total, bare };
  };

  it('every [[link:]] in the corpus carries a top-level | — so REQUIRES_ID skips none', () => {
    const { total, bare } = corpus('link');
    expect(total).toBeGreaterThan(100); // non-vacuity
    expect(bare).toBe(0);
  });

  it('🔴 xref is NOT the same shape and must stay out — it is overwhelmingly BARE', () => {
    const { total, bare } = corpus('xref');
    expect(total).toBeGreaterThan(1000);
    // If this ever inverts, someone has changed what an xref is, and adding it
    // to PAIRED_WIRE_TYPES would send target ids to be translated as prose.
    expect(bare / total).toBeGreaterThan(0.9);
  });
});
