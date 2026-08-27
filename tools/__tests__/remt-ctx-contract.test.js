/**
 * remt-ctx-contract.test.js — the ctx contract's COMPLETENESS, derived not asserted.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * 🔴 SIX TIMES NOW, A CHECK HAS READ A ctx KEY THE CONTRACT DOES NOT DOCUMENT,
 * AND EVERY TIME THE CONSEQUENCE WAS THE SAME: a loader built to the documented
 * shape leaves that check's detector permanently unrun. G5's `payloadVerdict`
 * (§C82 L41), A2a's `provenance`, R3's `schemaVerdict`, A5's `residueAllowlist`,
 * A2b's `segText` — each found by hand, one at a time, by someone who happened
 * to be reading the right file. The sixth (E7's `committedExtract` /
 * `freshExtract`, §C82 L105) was found at Task 13 by diffing the two sets
 * mechanically, which is what this file now does on every run.
 *
 * ⚠️ THE FAILURE MODE IS QUIET IN EXACTLY THE CASES THAT MATTER LEAST TO NOTICE
 * AND MOST TO FIX. A check that SKIPs for want of an undocumented key is:
 *   - BLOCKING  -> the run halts, loudly, and someone investigates within a day
 *   - ADVISORY  -> it reports SKIPPED forever, and a permanently-skipped advisory
 *                  check is indistinguishable from one with nothing to say
 * E7 is advisory, which is why it survived twelve tasks.
 *
 * ── THE INSTRUMENT LIED FIRST, AND THAT IS WHY THE CONTROLS ARE HERE ─────────
 * 🔴 THE FIRST VERSION OF THIS DIFF REPORTED SIX UNDOCUMENTED KEYS. Four of them
 * (`book`, `locked`, `force`, `costEstimate`) are documented — visibly, on lines
 * anyone can read. The regex used a single space where the source has two, so
 * `@property {boolean}  [locked]` did not match and the key read as missing.
 * A plausible six-item finding, entirely manufactured by the tool.
 * ▶ So the controls below are not ceremony. `KNOWN_DOCUMENTED` names keys that
 * are provably in the typedef and `KNOWN_READ` names keys provably read by a
 * check; if either parse silently stops working, those assertions fail FIRST and
 * name the instrument rather than the code. Without them an empty parse yields
 * "0 undocumented keys" — a green test that has measured nothing.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TOOLS = path.resolve(import.meta.dirname, '..');
const CLI = path.join(TOOLS, 'remt-battery.js');

/**
 * ⚠️ DERIVED BY GLOB, NEVER LISTED. §C82 L71: dropping both blocking checks from
 * the registry left the entire suite byte-identical to baseline, because the
 * tests asserted the exported array rather than the wiring. A hard-coded list of
 * tier modules here would make a SIXTH tier module invisible to this gate on the
 * day it is added.
 */
const tierModules = () =>
  fs
    .readdirSync(path.join(TOOLS, 'lib'))
    .filter((f) => /^remt-checks-.*\.js$/.test(f))
    .sort()
    .map((f) => path.join(TOOLS, 'lib', f));

/** Keys the CheckContext typedef documents. */
function documentedKeys() {
  const src = fs.readFileSync(CLI, 'utf8');
  // `\s+` on BOTH gaps — the single-space form is the bug described above.
  return new Set(
    [...src.matchAll(/@property\s+\{[^}]*\}\s+\[?([A-Za-z][A-Za-z0-9_]*)\]?/g)].map((m) => m[1])
  );
}

/** Keys any check actually reads, as key -> the module that reads it. */
function readKeys() {
  const out = new Map();
  for (const file of tierModules()) {
    // `-a`-equivalent: readFileSync never goes binary-blind the way grep does on
    // a NUL-bearing file (CLAUDE.md § control bytes). Reading in JS sidesteps
    // that class entirely.
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/ctx\??\.([A-Za-z][A-Za-z0-9_]*)/g)) {
      if (!out.has(m[1])) out.set(m[1], path.basename(file));
    }
  }
  return out;
}

/** Provably in the typedef — the control that catches a broken doc parse. */
const KNOWN_DOCUMENTED = [
  'book',
  'chapter',
  'module',
  'cnxml',
  'segText',
  'locked',
  'force',
  'costEstimate',
];
/** Provably read by a check — the control that catches a broken source parse. */
const KNOWN_READ = ['glossary', 'segText', 'isText', 'translatedCnxml', 'chapterInputs'];

describe('the ctx contract is COMPLETE — every key a check reads is documented', () => {
  it('the doc parse works — control keys are found', () => {
    const doc = documentedKeys();
    for (const k of KNOWN_DOCUMENTED) {
      expect(doc.has(k), `control key '${k}' is in the typedef but the parse missed it`).toBe(true);
    }
    // THE CONTAINER IS NOT THE PAYLOAD: a non-empty Set of the wrong things would
    // satisfy the loop above only if it held these exact keys, but assert the
    // magnitude too so a parse that somehow returned only the controls is caught.
    expect(doc.size).toBeGreaterThan(20);
  });

  it('the source parse works — control keys are found, and the module glob is non-empty', () => {
    const mods = tierModules();
    expect(mods.length, 'no tier modules matched the glob — the parse below would be vacuous').toBe(
      5
    );
    const read = readKeys();
    for (const k of KNOWN_READ) {
      expect(read.has(k), `control key '${k}' is read by a check but the parse missed it`).toBe(
        true
      );
    }
    expect(read.size).toBeGreaterThan(20);
  });

  it('no check reads a ctx key the contract does not document', () => {
    const doc = documentedKeys();
    const read = readKeys();
    const undocumented = [...read.entries()]
      .filter(([k]) => !doc.has(k))
      .map(([k, mod]) => `${k} (read in ${mod})`)
      .sort();
    // 🔴 THE ASSERTION IS `toEqual([])`, NOT `toHaveLength(0)`, SO THE FAILURE
    // MESSAGE NAMES THE KEY AND THE FILE. A count tells the next person that
    // something is wrong; this tells them what to add and where it is read.
    expect(undocumented).toEqual([]);
  });

  it('exactly one CheckContext typedef exists — two would split the contract', () => {
    const src = fs.readFileSync(CLI, 'utf8');
    // `documentedKeys` scans the whole file rather than a bounded block, which is
    // correct only while there is one typedef. A second one would silently merge
    // two contracts into one apparently-complete set.
    expect([...src.matchAll(/@typedef\s+\{object\}\s+CheckContext/g)]).toHaveLength(1);
  });
});
