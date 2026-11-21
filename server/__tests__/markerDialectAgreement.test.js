/**
 * §C248: the browser and inject must agree on which segments are new-format. The toolbar picks its dialect with
 * markerIntegrity.isBracketDialect; inject converts legacy markup only where its hasApiMarkers is false. A segment
 * on which they disagreed would get a wrap inject leaves raw.
 *
 * Anchored on the corpus, not on the two regexes side by side (CLAUDE.md, the bracket-marker rule: a list-vs-list
 * test passes with both sides wrong). The control is that both classes occur.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { hasApiMarkers } from '../../tools/cnxml-inject.js';

const require = createRequire(import.meta.url);
const { isBracketDialect } = require('../public/js/marker-integrity');
const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');

function* segments() {
  const books = path.join(REPO, 'books');
  for (const book of fs.readdirSync(books)) {
    for (const [tree, ext] of [
      ['02-mt-output', 'is'],
      ['02-for-mt', 'en'],
    ]) {
      const root = path.join(books, book, tree);
      if (!fs.existsSync(root)) continue;
      for (const ch of fs.readdirSync(root).filter((d) => /^(ch\d\d|appendices)$/.test(d))) {
        for (const f of fs
          .readdirSync(path.join(root, ch))
          .filter((x) => x.endsWith(`-segments.${ext}.md`))) {
          const text = fs.readFileSync(path.join(root, ch, f), 'utf8');
          const re = /<!--\s*SEG:([^\s>]+)\s*-->([\s\S]*?)(?=<!--\s*SEG:|$)/g;
          let m;
          while ((m = re.exec(text)) !== null) yield { id: `${book}/${tree}/${m[1]}`, body: m[2] };
        }
      }
    }
  }
}

describe('isBracketDialect agrees with inject on every segment of the corpus', () => {
  const disagree = [];
  let yes = 0;
  let no = 0;
  for (const { id, body } of segments()) {
    const a = hasApiMarkers(body);
    if (a !== isBracketDialect(body)) disagree.push(id);
    if (a) yes++;
    else no++;
  }

  it('no segment is classified differently', () => {
    expect(disagree).toEqual([]);
  });

  it('control: both classes occur', () => {
    expect([yes > 1000, no > 1000]).toEqual([true, true]);
  });
});
