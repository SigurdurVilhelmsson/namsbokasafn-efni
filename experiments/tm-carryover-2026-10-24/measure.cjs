#!/usr/bin/env node
/**
 * How much of a committed chemistry TMX file is carried-over machine translation? Read-only.
 *
 * Compares each translation unit's Icelandic with the MT of the same segment id at a given
 * commit. Both sides are cleaned by tools/lib/tm-export.cjs (parseSegments + cleanSegmentText),
 * the code that wrote the TMX, so a cleaning difference cannot count as an edit.
 *
 * usage: node experiments/tm-carryover-2026-10-24/measure.cjs <tmx-date> <mt-commit> [tmx-ref]
 *   tmx-date   2026-06-23 reads books/efnafraedi-2e/tm/efnafraedi-2e-2026-06-23.tmx
 *   mt-commit  the last commit touching 02-mt-output before the TMX's creationdate
 *   tmx-ref    the ref to read the TMX from (default HEAD)
 *
 * MEASURED while writing it: parseSegments returns a Map of id -> raw text. Iterating it as an
 * array of objects matched 0 of 360 units, which read as "no MT at all". The per-module control
 * line on stderr (segments found) is what tells a real result from that.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
const tm = require(path.join(repo, 'tools/lib/tm-export.cjs'));
const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 });

const [tmxDate, mtCommit, tmxRef = 'HEAD'] = process.argv.slice(2);
if (!tmxDate || !mtCommit) {
  console.error('usage: measure.cjs <tmx-date> <mt-commit> [tmx-ref]');
  process.exitCode = 2;
} else {
  const tmx = git('show', `${tmxRef}:books/efnafraedi-2e/tm/efnafraedi-2e-${tmxDate}.tmx`);
  const unxml = (s) =>
    s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&');
  const units = [...tmx.matchAll(/<tu>([\s\S]*?)<\/tu>/g)].map((m) => ({
    module: /<prop type="module">([^<]+)/.exec(m[1])[1],
    chapter: /<prop type="chapter">([^<]+)/.exec(m[1])[1],
    id: /<prop type="segment-id">([^<]+)/.exec(m[1])[1],
    is: unxml(/<tuv xml:lang="is"><seg>([\s\S]*?)<\/seg>/.exec(m[1])[1]),
  }));

  const cache = new Map();
  const mtOf = (chapter, module) => {
    if (cache.has(module)) return cache.get(module);
    const dir = `ch${String(chapter).padStart(2, '0')}`;
    let map = null;
    try {
      const content = git(
        'show',
        `${mtCommit}:books/efnafraedi-2e/02-mt-output/${dir}/${module}-segments.is.md`
      );
      map = new Map();
      for (const [id, raw] of tm.parseSegments(content)) map.set(id, tm.cleanSegmentText(raw));
    } catch {
      map = null;
    }
    console.error(`control: ${module} at ${mtCommit}: ${map ? map.size : 'NO FILE'} MT segments`);
    cache.set(module, map);
    return map;
  };

  const result = { tmxDate, mtCommit, tmxRef, units: units.length, same: 0, differs: 0, noMt: 0 };
  for (const u of units) {
    const mt = mtOf(u.chapter, u.module);
    if (!mt || !mt.has(u.id)) result.noMt += 1;
    else if (mt.get(u.id) === u.is) result.same += 1;
    else result.differs += 1;
  }
  console.log(JSON.stringify(result));
}
