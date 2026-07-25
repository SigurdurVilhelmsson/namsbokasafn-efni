#!/usr/bin/env node
/**
 * Paired baseline analysis for the CNXML validation-gate experiment.
 *
 * Validates each reinjected module AND its pristine original with the same schema
 * and the same jing invocation, then diffs the two error sets.
 *
 * Join key is (moduleId, normalizedMessage) with a count — deliberately NOT
 * file:line:col, because reinjected Icelandic text has different lengths than the
 * English original, so line numbers drift and every original error would look "new".
 *
 * Usage: node analyze-paired.mjs <book> <chapter...>
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const SCHEMA = join(
  HERE,
  'external/cnxml/cnxml/xml/cnxml/schema/rng/0.7/cnxml-jing.rng',
);
const RESULTS = join(HERE, 'results');

/** Run jing over a batch of files; return raw stdout (jing exits 1 on errors). */
function runJingOnce(files) {
  if (files.length === 0) return '';
  try {
    return execFileSync('jing', ['-i', SCHEMA, ...files], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (err) {
    if (err.status === 1) return err.stdout ?? '';
    // exit 2 = fatal (bad schema path, unreadable file) — fail loud, never swallow
    throw new Error(
      `jing exited ${err.status} (fatal, not a validation failure):\n${err.stdout}\n${err.stderr}`,
    );
  }
}

/**
 * jing ABORTS the remaining batch after the first `fatal:` (well-formedness) error,
 * so a single malformed file silently hides every file after it. Batch for speed,
 * then resume past each fatal until every file has actually been validated.
 * Without this, the paired diff reports phantom "pipeline dropped something"
 * findings for files jing never even opened.
 */
function runJing(all) {
  let out = '';
  let remaining = all.slice();
  let guard = 0;
  while (remaining.length > 0) {
    if (++guard > all.length + 5) throw new Error('validation did not converge');
    const chunk = runJingOnce(remaining);
    out += chunk;
    // Parse first and match on the structured `file` field. Deriving the filename
    // by string-slicing the raw line would silently truncate the path for any fatal
    // line that doesn't contain ".cnxml", making findIndex miss and leaving the
    // remainder unvalidated — reintroducing the very fail-quiet this works around.
    const fatal = parseJing(chunk).find((r) => r.type === 'fatal');
    if (!fatal) break;
    const idx = remaining.findIndex((f) => resolve(f) === resolve(fatal.file));
    if (idx === -1) {
      throw new Error(
        `fatal error reported for a file not in the batch: ${fatal.file}\n` +
          `  Refusing to continue — the remaining ${remaining.length} file(s) would go unvalidated.`,
      );
    }
    remaining = remaining.slice(idx + 1);
  }
  return out;
}

/** Collapse quoted literals so messages compare across documents. */
const normalize = (msg) => msg.replace(/"[^"]*"/g, '"X"').trim();

/** Parse `path:line:col: type: message` lines into structured records. */
function parseJing(out) {
  const rows = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^(.*?):(\d+):(\d+):\s*(\w+):\s*(.*)$/);
    if (m) {
      rows.push({
        file: m[1],
        line: +m[2],
        col: +m[3],
        type: m[4],
        message: m[5],
        norm: normalize(m[5]),
      });
    } else {
      rows.push({ file: '?', line: 0, col: 0, type: 'unparsed', message: line, norm: normalize(line) });
    }
  }
  return rows;
}

const moduleId = (p) => basename(p, '.cnxml');

/** Map moduleId -> Map(normalizedMessage -> {count, samples[]}) */
function bucket(rows) {
  const byModule = new Map();
  for (const r of rows) {
    const id = moduleId(r.file);
    if (!byModule.has(id)) byModule.set(id, new Map());
    const sigs = byModule.get(id);
    if (!sigs.has(r.norm)) sigs.set(r.norm, { count: 0, samples: [] });
    const e = sigs.get(r.norm);
    e.count += 1;
    if (e.samples.length < 4) e.samples.push(r);
  }
  return byModule;
}

const [book, ...chapters] = process.argv.slice(2);
if (!book || chapters.length === 0) {
  console.error('usage: node analyze-paired.mjs <book> <chapter...>');
  process.exit(2);
}
if (!existsSync(SCHEMA)) {
  console.error(`FATAL: schema not found at ${SCHEMA}\nRun the clone steps in SETUP.md.`);
  process.exit(2);
}
mkdirSync(RESULTS, { recursive: true });

const pairs = [];
for (const ch of chapters) {
  const injDir = join(REPO, `books/${book}/03-translated/mt-preview/${ch}`);
  const srcDir = join(REPO, `books/${book}/01-source/${ch}`);
  if (!existsSync(injDir)) {
    console.error(`FATAL: no reinjected dir ${injDir}`);
    process.exit(2);
  }
  for (const f of readdirSync(injDir).filter((x) => x.endsWith('.cnxml')).sort()) {
    const src = join(srcDir, f);
    if (!existsSync(src)) {
      console.error(`WARN: reinjected ${ch}/${f} has NO pristine original at ${src} — excluded from pairing`);
      continue;
    }
    pairs.push({ ch, id: moduleId(f), inj: join(injDir, f), src });
  }
}

console.error(`Pairs: ${pairs.length} modules across ${chapters.length} chapters`);

const tInj = Date.now();
const injRows = parseJing(runJing(pairs.map((p) => p.inj)));
const injMs = Date.now() - tInj;
const srcRows = parseJing(runJing(pairs.map((p) => p.src)));

writeFileSync(join(RESULTS, `paired-${book}-injected.txt`), injRows.map((r) => `${r.file}:${r.line}:${r.col}: ${r.type}: ${r.message}`).join('\n'));
writeFileSync(join(RESULTS, `paired-${book}-original.txt`), srcRows.map((r) => `${r.file}:${r.line}:${r.col}: ${r.type}: ${r.message}`).join('\n'));

const injB = bucket(injRows);
const srcB = bucket(srcRows);

const findings = { onlyInjected: [], higherInjected: [], onlyOriginal: [], shared: [] };

for (const p of pairs) {
  const i = injB.get(p.id) ?? new Map();
  const s = srcB.get(p.id) ?? new Map();
  const sigs = new Set([...i.keys(), ...s.keys()]);
  for (const sig of sigs) {
    const ic = i.get(sig)?.count ?? 0;
    const sc = s.get(sig)?.count ?? 0;
    const rec = { module: p.id, ch: p.ch, sig, injected: ic, original: sc, samples: i.get(sig)?.samples ?? [] };
    if (sc === 0) findings.onlyInjected.push(rec);
    else if (ic === 0) findings.onlyOriginal.push(rec);
    else if (ic > sc) findings.higherInjected.push(rec);
    else findings.shared.push(rec);
  }
}

const sum = (a) => a.reduce((n, r) => n + r.injected, 0);
const report = {
  book,
  chapters,
  modules: pairs.length,
  jingMsForInjectedBatch: injMs,
  totals: {
    injectedErrors: injRows.length,
    originalErrors: srcRows.length,
    injectedFilesWithErrors: new Set(injRows.map((r) => r.file)).size,
    originalFilesWithErrors: new Set(srcRows.map((r) => r.file)).size,
  },
  classCounts: {
    onlyInjected: sum(findings.onlyInjected),
    higherInjected_delta: findings.higherInjected.reduce((n, r) => n + (r.injected - r.original), 0),
    shared_sameCount: sum(findings.shared),
    onlyOriginal: findings.onlyOriginal.reduce((n, r) => n + r.original, 0),
  },
  findings,
};
writeFileSync(join(RESULTS, `paired-${book}-analysis.json`), JSON.stringify(report, null, 2));

const bySig = (arr, key) => {
  const m = new Map();
  for (const r of arr) {
    if (!m.has(r.sig)) m.set(r.sig, { n: 0, mods: new Set() });
    const e = m.get(r.sig);
    e.n += key(r);
    e.mods.add(r.module);
  }
  return [...m].sort((a, b) => b[1].n - a[1].n);
};

console.log(`\n===== PAIRED ANALYSIS: ${book} [${chapters.join(' ')}] =====`);
console.log(`modules paired: ${pairs.length}`);
console.log(`injected: ${injRows.length} errors in ${report.totals.injectedFilesWithErrors} files  (jing batch: ${injMs} ms)`);
console.log(`original: ${srcRows.length} errors in ${report.totals.originalFilesWithErrors} files`);
console.log(`\n-- CLASS (a)/(b) candidates: signatures ONLY in reinjected --`);
for (const [sig, e] of bySig(findings.onlyInjected, (r) => r.injected)) console.log(`  ${String(e.n).padStart(5)}  [${e.mods.size} mods]  ${sig}`);
if (findings.onlyInjected.length === 0) console.log('  (none)');
console.log(`\n-- CLASS (a)/(b) candidates: same signature but MORE in reinjected --`);
for (const [sig, e] of bySig(findings.higherInjected, (r) => r.injected - r.original)) console.log(`  +${String(e.n).padStart(4)}  [${e.mods.size} mods]  ${sig}`);
if (findings.higherInjected.length === 0) console.log('  (none)');
console.log(`\n-- CLASS (c) schema noise: identical signature+count on both sides --`);
for (const [sig, e] of bySig(findings.shared, (r) => r.injected)) console.log(`  ${String(e.n).padStart(5)}  [${e.mods.size} mods]  ${sig}`);
if (findings.shared.length === 0) console.log('  (none)');
console.log(`\n-- DIVERGENCE: present in ORIGINAL, absent in reinjected (pipeline dropped something) --`);
for (const [sig, e] of bySig(findings.onlyOriginal, (r) => r.original)) console.log(`  ${String(e.n).padStart(5)}  [${e.mods.size} mods]  ${sig}`);
if (findings.onlyOriginal.length === 0) console.log('  (none)');
console.log(`\nFull detail: results/paired-${book}-analysis.json`);
