/**
 * G1.11: one taxonomy of bracket-marker types, served to the browser without a copy.
 *
 * `tools/lib/marker-types.json` is the one owner of the type list and its tiers (the lead's 2026-08-12 ruling,
 * kept in docs/superpowers/specs/2026-11-21-c248-g111-toolbar-dialect-and-marker-gate-design.md §4.1). The
 * browser gets it from `GET /js/marker-types.js`, which wraps the file at request time.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const TAXONOMY = require('../../tools/lib/marker-types.json');
const { markerTypesScript } = require('../lib/markerTypesScript');

const TIERS = {
  atomic: ['BR', 'MATH', 'MEDIA', 'SPACE', 'TABLE', 'lb', 'rb'],
  structural: ['docref', 'fn', 'link', 'span', 'sub', 'sup', 'term', 'xref'],
  presentational: ['b', 'em', 'i', 'sc', 'u'],
};

function serve() {
  const sent = {};
  const res = {
    type(t) {
      sent.type = t;
      return res;
    },
    set(k, v) {
      sent.headers = { ...(sent.headers || {}), [k]: v };
      return res;
    },
    send(body) {
      sent.body = body;
      return res;
    },
  };
  markerTypesScript({}, res);
  return sent;
}

describe('the marker taxonomy and its browser route', () => {
  it("the route's script defines window.markerTypes equal to the JSON", () => {
    const sandbox = { window: {} };
    vm.runInNewContext(serve().body, sandbox);
    expect(sandbox.window.markerTypes).toEqual(TAXONOMY);
  });

  it('the route answers as JavaScript and is not cached', () => {
    const sent = serve();
    expect([sent.type, sent.headers['Cache-Control']]).toEqual([
      'application/javascript',
      'no-cache',
    ]);
  });

  it('the taxonomy names exactly the 20 measured types, each tiered once', () => {
    const byTier = { atomic: [], structural: [], presentational: [] };
    for (const [type, tier] of Object.entries(TAXONOMY.types)) byTier[tier].push(type);
    for (const tier of Object.keys(byTier)) byTier[tier].sort();
    expect(byTier).toEqual(TIERS);
  });

  it("control: every type in today's corpus is named", () => {
    const found = new Set();
    const books = path.join(REPO, 'books');
    for (const book of fs.readdirSync(books)) {
      for (const tree of ['02-for-mt', '02-mt-output']) {
        const root = path.join(books, book, tree);
        if (!fs.existsSync(root)) continue;
        for (const ch of fs.readdirSync(root).filter((d) => /^(ch\d\d|appendices)$/.test(d))) {
          for (const f of fs
            .readdirSync(path.join(root, ch))
            .filter((x) => /-segments\.(en|is)\.md$/.test(x))) {
            const text = fs.readFileSync(path.join(root, ch, f), 'utf8');
            for (const m of text.matchAll(/\[\[([A-Za-z]+)(?=[:\]|])/g)) found.add(m[1]);
          }
        }
      }
    }
    expect(found.size).toBeGreaterThan(10);
    expect([...found].filter((t) => !(t in TAXONOMY.types))).toEqual([]);
  });
});
