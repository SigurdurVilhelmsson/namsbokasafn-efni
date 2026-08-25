#!/usr/bin/env node
'use strict';
/**
 * check-glossary-payload.js — a `--json` CLI over the AGPL glossary producer verdicts,
 * built so the §C82 battery's G5 can reach them WITHOUT creating an MIT→AGPL import edge.
 *
 * 🔴 WHY A CLI AND NOT AN EXPORT. `tools/` is MIT and `server/` is AGPL-3.0; root `LICENSE`
 * enumerates the existing edges and neither `glossaryProducer.js` nor
 * `glossaryExportDecision.js` is among them. Both are CommonJS and have no MIT equivalent, so
 * G5 is the battery's only genuine E-2 edge. **A separate process is not a static import**, so
 * spawning creates no edge and root `LICENSE` needs no change (Plan B, Global Constraints).
 *
 * ⚠️ IT REPORTS; IT NEVER DECIDES. The battery applies its own threshold — Global Constraint
 * 3, "never infer a pass from exit code 0". This script's exit code is deliberately NOT a
 * verdict: it is 0 when the check RAN and 2 when it could not run at all. The caller reads
 * stdout. `server/services/publicationService.js:124-184` is the spawn model and ignores the
 * exit code entirely; G5's helper copies that.
 *
 * 🔴 `process.exitCode`, NEVER `process.exit()` — CLAUDE.md's durable rule. Node writes stdout
 * to a PIPE asynchronously, so `process.exit()` discards whatever is still queued, silently,
 * with the exit code still correct. A `>` redirect is synchronous and stays clean, which is
 * why a hand check misses it entirely.
 *
 * Usage: node server/scripts/check-glossary-payload.js --file <path> --json
 */
const fs = require('fs');
const { detectProducer, PRODUCER_UNKNOWN } = require('../lib/glossaryProducer');

/**
 * Classify one payload file WITHOUT reference to any previous version.
 *
 * ⚠️ THIS RE-IMPLEMENTS THE absent/corrupt/ok CLASSIFIER ON PURPOSE. `readExisting`, which
 * does exactly this, is module-local at `server/scripts/export-terminology.js:234` and that
 * file exports only `{ listBooks, runGlossaryExport, parseArgs }` — verified. There is no way
 * to import it, so planning around doing so would fail at the first run.
 *
 * 🔴 THE `null` CASE IS THE ONE THAT MATTERS AND IT IS NOT A HYPOTHETICAL. A committed
 * `glossary-unified.json` holding the four bytes `null` PARSED, so the export's own
 * `readExisting` returned `{kind:'ok', payload:null}` — `kind` was not `'absent'`, so §C21's
 * gate never fired, while `null` is the exact sentinel `producerVerdict` uses for "no previous
 * producer". All three gates stood down and the unattended cron WROTE. Only `null` slipped;
 * `[]`, numbers and strings parse non-null and refuse. ▶ A non-object payload is `corrupt`
 * here, which is what closed it: **a gate keyed on one representation of "nothing" can be
 * walked past by another representation of "nothing".**
 */
function classifyPayload(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return { kind: 'absent', producer: PRODUCER_UNKNOWN };
    return { kind: 'unreadable', producer: PRODUCER_UNKNOWN, error: String(err.message || err) };
  }
  return classifyPayloadText(text);
}

/** The pure half, so the battery's own G5 can apply the identical classification offline. */
function classifyPayloadText(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { kind: 'corrupt', producer: PRODUCER_UNKNOWN, reason: 'empty file' };
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    return { kind: 'corrupt', producer: PRODUCER_UNKNOWN, reason: `unparseable: ${err.message}` };
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      kind: 'corrupt',
      producer: PRODUCER_UNKNOWN,
      reason: `payload is ${payload === null ? 'null' : Array.isArray(payload) ? 'an array' : typeof payload}, not an object`,
    };
  }
  return { kind: 'ok', producer: detectProducer(payload) };
}

function main(argv) {
  // 🔴 A FAILURE DEFAULT, set before anything can go wrong: a promise that never settles
  // exits 0 having reached no verdict, so an exit code that IS a verdict must start wrong.
  process.exitCode = 2;
  const fileIdx = argv.indexOf('--file');
  if (fileIdx === -1 || !argv[fileIdx + 1]) {
    process.stderr.write('usage: check-glossary-payload.js --file <path> --json\n');
    return;
  }
  const out = classifyPayload(argv[fileIdx + 1]);
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exitCode = 0; // the check RAN; the verdict is in stdout, not here
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { classifyPayload, classifyPayloadText, main };
