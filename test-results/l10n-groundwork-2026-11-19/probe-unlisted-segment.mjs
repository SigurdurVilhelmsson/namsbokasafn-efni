// Read-only probe (B7, 2026-11-19): what does cnxml-inject's buildCnxml do with a
// translated segment whose id 02-structure does not list? Writes nothing under books/.
// Usage: node probe-unlisted-segment.mjs <repo> [module] [chapter]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const repo = process.argv[2];
const mod = process.argv[3] || 'm68667';
const ch = process.argv[4] || 'ch01';
const B = path.join(repo, 'books/efnafraedi-2e');
const { buildCnxml, parseSegments } = await import(pathToFileURL(path.join(repo, 'tools/cnxml-inject.js')));
const rd = (p) => fs.readFileSync(path.join(B, p), 'utf8');
const structure = JSON.parse(rd(`02-structure/${ch}/${mod}-structure.json`));
const equations = JSON.parse(rd(`02-structure/${ch}/${mod}-equations.json`));
const inlineAttrs = fs.existsSync(path.join(B, `02-structure/${ch}/${mod}-inline-attrs.json`)) ? JSON.parse(rd(`02-structure/${ch}/${mod}-inline-attrs.json`)) : {};
const enSegments = parseSegments(rd(`02-for-mt/${ch}/${mod}-segments.en.md`));
const originalCnxml = rd(`01-source/${ch}/${mod}.cnxml`);
const base = parseSegments(rd(`02-mt-output/${ch}/${mod}-segments.is.md`));
const run = (segs) => {
  const errs = []; const orig = console.error; console.error = (...a) => errs.push(a.join(' '));
  try { return { ...buildCnxml(structure, segs, equations, originalCnxml, { enSegments, checkResidue: true }, inlineAttrs), errs }; }
  finally { console.error = orig; }
};
const A = run(new Map(base));
// B: three ids 02-structure does not list, in shapes an overlay might use
const extra = {
  [`${mod}:para:loc-new-001`]: 'ZQXSENTINELPARA',
  [`${mod}:note:loc-box-001`]: 'ZQXSENTINELNOTE',
  [`${mod}:exercise:loc-ex-001`]: 'ZQXSENTINELEX',
};
const segB = new Map(base); for (const [k, v] of Object.entries(extra)) segB.set(k, v);
const Bres = run(segB);
// C: positive control, replace one EXISTING para segment's text
const paraId = [...base.keys()].find((k) => k.includes(':para:'));
const segC = new Map(base); segC.set(paraId, 'ZQXSENTINELCONTROL');
const C = run(segC);
const count = (s, t) => s.split(t).length - 1;
const out = {
  module: mod,
  baseSegments: base.size,
  A: { complete: A.report.complete, found: A.report.segmentsFound, missing: A.report.segmentsMissing.length, bytes: A.cnxml.length },
  B: { complete: Bres.report.complete, found: Bres.report.segmentsFound, missing: Bres.report.segmentsMissing.length, bytes: Bres.cnxml.length,
       identicalToA: Bres.cnxml === A.cnxml,
       sentinelsInOutput: Object.values(extra).map((t) => [t, count(Bres.cnxml, t)]),
       stderrMentionsUnused: Bres.errs.filter((e) => /not referenced|unused/i.test(e)),
       stderrLines: Bres.errs.length },
  C: { controlId: paraId, sentinelInOutput: count(C.cnxml, 'ZQXSENTINELCONTROL'), complete: C.report.complete },
};
console.log(JSON.stringify(out, null, 2));
