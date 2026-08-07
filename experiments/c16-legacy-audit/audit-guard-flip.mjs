#!/usr/bin/env node
/**
 * C16 audit — the REVERSE direction, which §C16 never measured.
 *
 * (a)'s recorded hazard is the C13 rule: `hasApiMarkers` infers a segment's era
 * from its own EDITABLE text, so an editor deleting the last [[…]] marker flips
 * a modern segment to "legacy era" and ARMS the Markdown converters on it.
 *
 * This measures the blast radius of that flip: for every segment the guard
 * currently classes API-era (hasApiMarkers = TRUE), what would the Markdown
 * converters do if the guard resolved FALSE instead?
 *
 * Method mirrors c16-audit-a.mjs — real reverseInlineMarkup, one variable.
 * READ-ONLY over books/.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve against this file, never process.cwd() (CLAUDE.md durable rule).
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOLS = path.join(REPO, 'tools');
const BOOKS = path.join(REPO, 'books');
const PATCHED = path.join(TOOLS, '__c16_audit_flip.mjs');
const OUT = process.argv[2] || '/tmp/c16-audit-flip.json';
const STAGE = process.env.STAGE || '02-mt-output';

const GUARD =
  /\{\{[ib]\}\}|\{\{[ib]:|\{\{term\}\}|\{\{fn\}\}|\[\[sub:|\[\[sup:|\[\[i:|\[\[b:|\[\[term:|\[\[fn:|\[\[u:|\[\[em:/;

function makePatched() {
  const src = fs.readFileSync(path.join(TOOLS, 'cnxml-inject.js'), 'utf8');
  const re = /const hasApiMarkers =\s*\n\s*\/[^\n]*\n\s*text\n\s*\);/;
  if (!re.test(src)) throw new Error('PATCH TARGET NOT FOUND — guard shape changed.');
  fs.writeFileSync(
    PATCHED,
    src.replace(re, 'const hasApiMarkers = false; /* C16 AUDIT FLIP */')
  );
}

async function main() {
  makePatched();
  const orig = await import(path.join(TOOLS, 'cnxml-inject.js'));
  const flip = await import(PATCHED);
  const noop = () => {};
  const rw = console.warn, re_ = console.error, rl = console.log;
  const mute = () => { console.warn = noop; console.error = noop; console.log = noop; };
  const unmute = () => { console.warn = rw; console.error = re_; console.log = rl; };

  const out = { stage: STAGE, totals: { apiEra: 0, wouldChange: 0 }, perBook: {}, samples: [] };

  for (const book of fs.readdirSync(BOOKS).sort()) {
    const bookDir = path.join(BOOKS, book);
    const stageDir = path.join(bookDir, STAGE);
    if (!fs.existsSync(stageDir)) continue;
    const b = { apiEra: 0, wouldChange: 0, modules: new Set() };
    for (const chDir of fs.readdirSync(stageDir).filter((d) =>
      fs.statSync(path.join(stageDir, d)).isDirectory()
    )) {
      const dir = path.join(stageDir, chDir);
      for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('-segments.is.md'))) {
        const moduleId = f.replace('-segments.is.md', '');
        mute();
        const segments = orig.parseSegments(fs.readFileSync(path.join(dir, f), 'utf8'));
        unmute();
        if (!segments || !segments.size) continue;
        const eqPath = path.join(bookDir, '02-structure', chDir, `${moduleId}-equations.json`);
        const equations = fs.existsSync(eqPath) ? JSON.parse(fs.readFileSync(eqPath, 'utf8')) : {};
        for (const [segId, text] of segments) {
          if (!GUARD.test(text)) continue; // only API-era segments
          b.apiEra++;
          mute();
          let a, c;
          try {
            const args = [equations, [], [], null, null, null, { segmentId: segId }];
            a = orig.reverseInlineMarkup(text, ...args);
            c = flip.reverseInlineMarkup(text, ...args);
          } catch { unmute(); continue; }
          unmute();
          if (a !== c) {
            b.wouldChange++;
            b.modules.add(`${chDir}/${moduleId}`);
            if (out.samples.length < 4000)
              out.samples.push({ book, chDir, moduleId, segId, correct: a, ifFlipped: c });
          }
        }
      }
    }
    if (!b.apiEra) continue;
    out.totals.apiEra += b.apiEra;
    out.totals.wouldChange += b.wouldChange;
    out.perBook[book] = {
      apiEra: b.apiEra,
      wouldChange: b.wouldChange,
      pct: +((100 * b.wouldChange) / b.apiEra).toFixed(1),
      modules: b.modules.size,
    };
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ stage: out.stage, totals: out.totals, perBook: out.perBook }, null, 2));
}
main()
  .catch((e) => { console.error('FAILED:', e); process.exitCode = 1; })
  .finally(() => { if (fs.existsSync(PATCHED)) fs.unlinkSync(PATCHED); });
