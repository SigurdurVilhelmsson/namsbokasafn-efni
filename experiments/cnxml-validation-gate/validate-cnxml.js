#!/usr/bin/env node
/**
 * validate-cnxml.js — CNXML schema validation gate (EXPERIMENT PROTOTYPE)
 *
 * Validates CNXML files against OpenStax's own RelaxNG schema using jing.
 * Standalone: lives in experiments/cnxml-validation-gate/, imports nothing from
 * tools/ or server/, and is not wired into the pipeline.
 *
 * Usage:
 *   node validate-cnxml.js <file-or-dir>...
 *   node validate-cnxml.js --allowlist allowlist.recommended.json books/efnafraedi-2e/03-translated
 *   node validate-cnxml.js --json books/.../ch12
 *
 * Options:
 *   --allowlist <file>  JSON allowlist of known-benign error classes (default: allowlist.json)
 *   --schema <file>     override the RelaxNG schema
 *   --no-dup-id-check   skip the duplicate-@id scan (see below)
 *   --json              emit machine-readable JSON instead of text
 *   --quiet             suppress the per-file OK lines
 *
 * Exit codes:
 *   0  all files valid (after allowlist filtering)
 *   1  one or more validation errors survived the allowlist
 *   2  setup/fatal error — schema missing, jing missing, no input files,
 *      unreadable path, bad allowlist. NEVER used for document errors.
 *
 * ---------------------------------------------------------------------------
 * Two behaviours worth knowing about (both discovered empirically — see FINDINGS.md):
 *
 * 1. `-i` is REQUIRED. Without it the grammar does not compile at all, because
 *    CNXML declares table/@id as xsd:ID while MathML 3's `anyElement` pattern
 *    matches cnxml:table with an untyped attribute. This is also OpenStax's own
 *    invocation (their cnxml/jing.py:53). The cost is that jing's duplicate-id
 *    checking is off, so this script re-implements that check itself.
 *
 * 2. jing ABORTS THE WHOLE REMAINING BATCH after the first `fatal:` (XML
 *    well-formedness) error. Batching is worth keeping — measured 6.7x faster
 *    than a per-file loop for one chapter and ~68x for a whole book (591 ms of
 *    JVM+grammar startup per invocation) — but a naive batch would silently skip
 *    every file after a malformed one: fail-quiet, the exact opposite of a gate.
 *    runJingComplete() below batches for speed and then re-runs the un-validated
 *    remainder after each fatal, so coverage is always complete.
 * ---------------------------------------------------------------------------
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// Resolve against import.meta.url, never process.cwd() — the gate must behave the
// same whether it is run from the repo root or from server/ (a real bug class in
// this repo: see CLAUDE.md on path resolution).
const DEFAULT_SCHEMA = join(
  HERE,
  'external/cnxml/cnxml/xml/cnxml/schema/rng/0.7/cnxml-jing.rng',
);
const DEFAULT_ALLOWLIST = join(HERE, 'allowlist.json');

function die(msg) {
  console.error(`validate-cnxml: FATAL: ${msg}`);
  process.exit(2);
}

// ---------------------------------------------------------------- arg parsing
const argv = process.argv.slice(2);
const opts = {
  schema: DEFAULT_SCHEMA,
  allowlist: DEFAULT_ALLOWLIST,
  dupIdCheck: true,
  json: false,
  quiet: false,
  inputs: [],
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--schema') opts.schema = argv[++i] ?? die('--schema needs a value');
  else if (a === '--allowlist') opts.allowlist = argv[++i] ?? die('--allowlist needs a value');
  else if (a === '--no-dup-id-check') opts.dupIdCheck = false;
  else if (a === '--json') opts.json = true;
  else if (a === '--quiet') opts.quiet = true;
  else if (a === '-h' || a === '--help') {
    console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(2, 30).join('\n'));
    process.exit(0);
  } else if (a.startsWith('-')) die(`unknown option ${a}`);
  else opts.inputs.push(a);
}

if (opts.inputs.length === 0) die('no input files or directories given');
if (!existsSync(opts.schema)) {
  die(`schema not found: ${opts.schema}\n  The OpenStax schema clone is missing. See SETUP.md §2.`);
}
try {
  execFileSync('jing', [], { stdio: 'ignore' });
} catch (e) {
  if (e.code === 'ENOENT') die('jing not found on PATH. See SETUP.md §1 (`sudo apt install jing`).');
  // jing with no args exits non-zero printing usage — that is fine, it exists.
}

// ------------------------------------------------------------------ allowlist
/**
 * Allowlist format (JSON):
 *   { "rules": [ { "id": "...", "reason": "...", "match": "<substring or /regex/>",
 *                  "scope": "all" | "<path substring>" } ] }
 * A rule suppresses an error whose message contains `match` (or matches it as a
 * regex when written as /.../), optionally only for files whose path contains `scope`.
 */
function loadAllowlist(path) {
  if (!existsSync(path)) {
    if (path !== DEFAULT_ALLOWLIST) die(`allowlist not found: ${path}`);
    return { rules: [] };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    die(`allowlist ${path} is not valid JSON: ${e.message}`);
  }
  if (!Array.isArray(raw.rules)) die(`allowlist ${path} must have a "rules" array`);
  for (const r of raw.rules) {
    if (!r.id || !r.match || !r.reason) {
      die(`allowlist rule missing required field (id, match, reason): ${JSON.stringify(r)}`);
    }
    r._re = r.match.startsWith('/') && r.match.lastIndexOf('/') > 0
      ? new RegExp(r.match.slice(1, r.match.lastIndexOf('/')), r.match.slice(r.match.lastIndexOf('/') + 1))
      : null;
  }
  return raw;
}

const allowlist = loadAllowlist(opts.allowlist);

function allowedBy(err) {
  for (const r of allowlist.rules) {
    if (r.scope && r.scope !== 'all' && !err.file.includes(r.scope)) continue;
    if (r._re ? r._re.test(err.message) : err.message.includes(r.match)) return r;
  }
  return null;
}

// -------------------------------------------------------------- file discovery
function collect(input) {
  const p = resolve(input);
  if (!existsSync(p)) die(`no such file or directory: ${input}`);
  const st = statSync(p);
  if (st.isFile()) return p.endsWith('.cnxml') ? [p] : [];
  const out = [];
  (function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      // An unreadable subdirectory must not abort discovery with a stack trace,
      // but it also must not be swallowed: a gate that silently skips files is
      // worse than one that stops. Warn loudly and keep going.
      console.error(`validate-cnxml: WARNING: cannot read directory ${dir}: ${e.code ?? e.message} — skipped`);
      return;
    }
    for (const e of entries) {
      const f = join(dir, e.name);
      try {
        if (e.isDirectory()) walk(f);
        else if (e.isFile() && e.name.endsWith('.cnxml')) out.push(f);
      } catch (err) {
        console.error(`validate-cnxml: WARNING: cannot stat ${f}: ${err.code ?? err.message} — skipped`);
      }
    }
  })(p);
  return out;
}

const files = [...new Set(opts.inputs.flatMap(collect))].sort();
if (files.length === 0) die(`no .cnxml files found under: ${opts.inputs.join(', ')}`);

// ------------------------------------------------------------------- run jing
const SCHEMA_DIR = resolve(dirname(opts.schema), '..', '..', '..', '..');

function parseLines(out) {
  const rows = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^(.*?):(\d+):(\d+):\s*(\w+):\s*(.*)$/);
    if (m) rows.push({ file: m[1], line: +m[2], col: +m[3], type: m[4], message: m[5] });
    else rows.push({ file: '<jing>', line: 0, col: 0, type: 'unparsed', message: line });
  }
  return rows;
}

function runJingOnce(batch) {
  try {
    return { out: execFileSync('jing', ['-i', opts.schema, ...batch], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }), status: 0 };
  } catch (e) {
    if (e.status === 1) return { out: e.stdout ?? '', status: 1 };
    // exit 2 or a signal: genuinely fatal (bad schema, unreadable file)
    die(`jing exited ${e.status ?? e.signal}: ${(e.stderr || e.stdout || e.message).toString().trim()}`);
  }
}

/**
 * Validate every file, working around jing's batch-abort-on-fatal behaviour.
 * Batches for speed; after a fatal, resumes with the files jing never reached.
 */
function runJingComplete(all) {
  const rows = [];
  let remaining = all.slice();
  let guard = 0;
  while (remaining.length > 0) {
    if (++guard > all.length + 5) die('validation did not converge (internal error)');
    const { out } = runJingOnce(remaining);
    const batchRows = parseLines(out);
    rows.push(...batchRows);

    // If a schema-side diagnostic appears, the grammar failed to compile.
    const schemaErr = batchRows.find((r) => resolve(r.file).startsWith(SCHEMA_DIR) && r.type !== 'unparsed');
    if (schemaErr) {
      die(`the RelaxNG schema failed to compile — this is not a document error:\n  ${schemaErr.file}:${schemaErr.line}: ${schemaErr.message}\n  (Is -i being passed? See SETUP.md §4.)`);
    }

    const fatal = batchRows.find((r) => r.type === 'fatal');
    if (!fatal) break;
    const idx = remaining.findIndex((f) => resolve(f) === resolve(fatal.file));
    if (idx === -1) break;
    remaining = remaining.slice(idx + 1); // resume after the file jing choked on
  }
  return rows;
}

const t0 = Date.now();
const errors = runJingComplete(files);
const jingMs = Date.now() - t0;

// -------------------------------------------------- duplicate-@id check (ours)
/**
 * jing's own ID/IDREF checking is unavailable (see header note 1), so do it here.
 * CNXML ids must be unique within a module. Comments and CDATA are stripped first;
 * only attributes inside start-tags are considered.
 * Limitation: this is a lexical scan, not a full parse. It runs only on files that
 * jing already accepted as well-formed, which keeps it honest in practice.
 */
function duplicateIds(file) {
  let t;
  try {
    t = readFileSync(file, 'utf8');
  } catch (e) {
    die(`cannot read ${file}: ${e.message}`);
  }
  t = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const seen = new Map();
  const dups = [];
  const tagRe = /<[a-zA-Z][^>]*>/g;
  let m;
  while ((m = tagRe.exec(t)) !== null) {
    const idm = /\sid\s*=\s*"([^"]*)"/.exec(m[0]);
    if (!idm) continue;
    const line = t.slice(0, m.index).split('\n').length;
    if (seen.has(idm[1])) dups.push({ file, line, col: 0, type: 'error', message: `duplicate id "${idm[1]}" (first seen on line ${seen.get(idm[1])})`, source: 'dup-id-check' });
    else seen.set(idm[1], line);
  }
  return dups;
}

const fatalFiles = new Set(errors.filter((e) => e.type === 'fatal').map((e) => resolve(e.file)));
if (opts.dupIdCheck) {
  for (const f of files) {
    if (fatalFiles.has(resolve(f))) continue; // not well-formed; dup scan would be noise
    errors.push(...duplicateIds(f));
  }
}

// -------------------------------------------------------------------- reporting
const surviving = [];
const suppressed = [];
for (const e of errors) {
  const rule = allowedBy(e);
  if (rule) suppressed.push({ ...e, rule: rule.id });
  else surviving.push(e);
}

const rel = (f) => {
  const r = relative(process.cwd(), f);
  return r.startsWith('..') ? f : r;
};
const badFiles = new Set(surviving.map((e) => resolve(e.file)));

if (opts.json) {
  console.log(JSON.stringify({
    schema: opts.schema,
    allowlist: opts.allowlist,
    filesChecked: files.length,
    filesWithErrors: badFiles.size,
    jingMs,
    errors: surviving,
    suppressed,
  }, null, 2));
} else {
  const byFile = new Map();
  for (const e of surviving) {
    if (!byFile.has(e.file)) byFile.set(e.file, []);
    byFile.get(e.file).push(e);
  }
  for (const [f, es] of [...byFile].sort()) {
    console.log(`\n✗ ${rel(f)}`);
    for (const e of es.sort((a, b) => a.line - b.line)) {
      const where = e.col ? `${e.line}:${e.col}` : `${e.line}`;
      console.log(`    ${where}  ${e.type}: ${e.message}`);
    }
  }
  if (!opts.quiet && badFiles.size < files.length) {
    console.log(`\n✓ ${files.length - badFiles.size} file(s) valid`);
  }
  console.log(
    `\n${files.length} file(s) checked in ${jingMs} ms — ` +
    `${surviving.length} error(s) in ${badFiles.size} file(s)` +
    (suppressed.length ? `, ${suppressed.length} suppressed by allowlist` : ''),
  );
  if (suppressed.length) {
    const byRule = new Map();
    for (const s of suppressed) byRule.set(s.rule, (byRule.get(s.rule) ?? 0) + 1);
    for (const [id, n] of byRule) console.log(`    allowlist "${id}": ${n} suppressed`);
  }
}

process.exit(surviving.length > 0 ? 1 : 0);
