// tools/verify-reextract-equivalence.js
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

// Reduce text to reader-visible content so equivalent content compares equal
// regardless of marker SYNTAX (re-extract modernizes {{i}} to [[i:]], captures
// sub/sup that March left as plain text, promotes raw refs to docrefs, etc.).
// LOOP-UNTIL-STABLE so nested markers (e.g. [[i:e[[sub:g]]]]) fully unwrap.
// Verified 2026-07-07 over all 149 modules: residual is exactly {m68819, m68852}
// (the two real math-capture changes). An under-built version false-positives on
// ~20 benign modules (sub/sup capture, docref labels, raw refs) and halts the run.
export function normalizeVisibleText(s) {
  let prev,
    t = s ?? '';
  do {
    prev = t;
    t = t
      .replace(/\{\{\/?[a-z]+\}\}/g, '') // legacy paired {{i}}X{{/i}} -> strip delimiters
      .replace(/\[\[[a-z]+:([^\[\]|]*)\|[^\[\]]*\]\]/g, '$1') // labeled [[link|xref|docref:TEXT|id]] -> TEXT (BEFORE pipe)
      .replace(/\[\[(?:xref|docref):[^\[\]]*\]\]/g, '') // unlabeled [[xref|docref:id]] -> '' (no visible text)
      .replace(/\[\[(?:MATH|MEDIA|TABLE):\d+\]\]/gi, '') // opaque placeholders -> ''
      .replace(/\[\[[a-z]+:([^\[\]]*)\]\]/g, '$1') // bracket inline [[i:X]] [[sub:X]] ... -> X (innermost)
      .replace(/\[([^\[\]]*)\]\([^)]*\)/g, '$1') // markdown [text](url) / [text](doc:m123) -> text
      .replace(/\[(?:m\d+)?#[^\[\]]*\]/g, ''); // legacy raw ref [m68674#id] / [#id] -> ''
  } while (t !== prev);
  return t.replace(/\s+/g, ' ').trim();
}

export function compareModule(committed, fresh) {
  const failures = [];
  const aIds = [...committed.segIds].sort().join('|');
  const bIds = [...fresh.segIds].sort().join('|');
  if (aIds !== bIds) failures.push('segment-id-set changed');
  else {
    for (const [id, t] of committed.segText) {
      if (normalizeVisibleText(t) !== normalizeVisibleText(fresh.segText.get(id) ?? '')) {
        failures.push(`same-id EN visible-text changed: ${id}`);
      }
    }
  }
  // equations: shared-key value drift AND key-set (added/removed) -- an added or
  // removed math-N key renumbers the [[MATH:N]] placeholders the existing IS
  // translations carry (the m68852 mechanism). Independent math-capture detector.
  for (const [k, v] of committed.equations) {
    if (fresh.equations.has(k)) {
      if (fresh.equations.get(k) !== v) failures.push(`equations shared-key MathML changed: ${k}`);
    } else {
      failures.push(`equation key removed: ${k}`);
    }
  }
  for (const k of fresh.equations.keys()) {
    if (!committed.equations.has(k)) failures.push(`equation key added: ${k}`);
  }
  if (committed.inlineAttrs !== fresh.inlineAttrs) failures.push('inline-attrs changed');
  return { ok: failures.length === 0, failures };
}

// ---- CLI: compare committed (git HEAD) vs working-tree (post-re-extract) ----
function segMap(text) {
  const ids = new Set(),
    map = new Map();
  for (const p of text.split(/(?=<!-- SEG:[^>]*-->)/)) {
    const m = p.match(/<!-- SEG:([^>]*?) -->/);
    if (!m) continue;
    const id = m[1].trim();
    ids.add(id);
    map.set(
      id,
      p
        .replace(/<!-- SEG:[^>]*-->/, '')
        .replace(/\s+/g, ' ')
        .trim()
    );
  }
  return { ids, map };
}
function eqMap(json) {
  const m = new Map();
  try {
    for (const [k, v] of Object.entries(JSON.parse(json).equations ?? JSON.parse(json)))
      m.set(k, JSON.stringify(v));
  } catch {}
  return m;
}
function loadCommitted(path) {
  try {
    return execSync(`git show HEAD:${path}`, { encoding: 'utf8' });
  } catch {
    return null;
  }
}
function loadDisk(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

export function verifyBook(book, modulesFile, knownExceptions = new Set()) {
  const lines = readFileSync(modulesFile, 'utf8').trim().split('\n').filter(Boolean);
  const report = [];
  for (const line of lines) {
    const [ch, mod] = line.trim().split(/\s+/);
    const seg = `books/${book}/02-for-mt/${ch}/${mod}-segments.en.md`;
    const eq = `books/${book}/02-structure/${ch}/${mod}-equations.json`;
    const ia = `books/${book}/02-structure/${ch}/${mod}-inline-attrs.json`;
    const cSeg = segMap(loadCommitted(seg) ?? '');
    const fSeg = segMap(loadDisk(seg) ?? '');
    const committed = {
      segIds: cSeg.ids,
      segText: cSeg.map,
      equations: eqMap(loadCommitted(eq) ?? '{}'),
      inlineAttrs: loadCommitted(ia) ?? '',
    };
    const fresh = {
      segIds: fSeg.ids,
      segText: fSeg.map,
      equations: eqMap(loadDisk(eq) ?? '{}'),
      inlineAttrs: loadDisk(ia) ?? '',
    };
    const r = compareModule(committed, fresh);
    // downgrade the known-exception segment failures to warnings
    const real = r.failures.filter((_f) => !knownExceptions.has(mod));
    report.push({
      mod,
      ch,
      ok: real.length === 0,
      failures: r.failures,
      exceptionWaived: r.failures.length > 0 && real.length === 0,
    });
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const modulesFile = process.argv[2] || '/tmp/reextract-modules.txt';
  const known = new Set(['m68819', 'm68852']); // the ONLY two real content changes (math-capture); verified whole-book 2026-07-07
  const report = verifyBook('efnafraedi-2e', modulesFile, known);
  const failed = report.filter((r) => !r.ok);
  const waived = report.filter((r) => r.exceptionWaived);
  for (const r of report)
    if (r.failures.length)
      console.log(
        `${r.ok ? (r.exceptionWaived ? 'WAIVED ' : 'OK    ') : 'FAIL  '} ${r.mod}: ${r.failures.join('; ')}`
      );
  console.log(
    `\n${report.length} modules; ${failed.length} FAIL; ${waived.length} waived-known-exception`
  );
  process.exit(failed.length ? 1 : 0);
}
