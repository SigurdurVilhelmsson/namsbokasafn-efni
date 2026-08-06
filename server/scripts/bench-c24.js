/**
 * C24 before/after benchmark. Run: node server/scripts/bench-c24.js <book> <chapter> <moduleId>
 * e.g. node server/scripts/bench-c24.js efnafraedi-2e 3 m68700
 *
 * Reports latency AND RSS. ~85MB resident for the automaton is a real cost on a
 * small Linode; a claim that reports only time is half-measured.
 */
const segmentEditorService = require('../services/segmentEditorService');
const terminologyService = require('../services/terminologyService');

const [book, chapter, moduleId] = process.argv.slice(2);
if (!book || !chapter || !moduleId) {
  console.error('usage: node server/scripts/bench-c24.js <book> <chapter> <moduleId>');
  process.exit(1);
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const rss0 = process.memoryUsage().rss;

const segments = segmentEditorService.buildEffectiveSegments(book, chapter, moduleId);
console.log(`${moduleId}: ${segments.length} segments`);

for (const label of ['cold', 'warm']) {
  const t0 = process.hrtime.bigint();
  const res = terminologyService.findTermsInSegments(segments, book);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const matches = Object.values(res).reduce((n, r) => n + r.matches.length, 0);
  console.log(
    `  ${label}: ${ms.toFixed(1)} ms, ${matches} matches, rss ${mb(process.memoryUsage().rss)}`
  );
}

// The save path: one segment.
const t0 = process.hrtime.bigint();
terminologyService.findTermsInSegments([segments[0]], book);
console.log(
  `  save path (1 segment): ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)} ms`
);
console.log(`  rss delta: ${mb(process.memoryUsage().rss - rss0)}`);
