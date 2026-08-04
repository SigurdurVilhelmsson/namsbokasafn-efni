#!/usr/bin/env node
/**
 * Gate on unresolved glossary term competitions (register C18).
 *
 * A competition is one English headword with two or more approved Icelandic
 * translations. Row order currently decides which one wins, silently. This
 * tool fails on any competition NOT recorded in the book's baseline file.
 *
 * The baseline is a WORKLIST, not an approval: every entry is an unresolved
 * editorial decision (register C14 (2)). Shrink it by resolving terms; do not
 * grow it to silence the gate.
 *
 * Usage:
 *   node tools/validate-glossary.js --book efnafraedi-2e
 *   node tools/validate-glossary.js --book efnafraedi-2e --update-baseline
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, requireBook } from './lib/parseArgs.js';
import { findGlossaryCollisions } from './lib/glossary-collisions.js';

// Resolve books/ against this file, never process.cwd() — the server runs
// with cwd=server/ and a cwd-relative books/ path silently points elsewhere.
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function glossaryPath(bookDir) {
  return path.join(bookDir, 'glossary', 'glossary-unified.json');
}

export function baselinePath(bookDir) {
  return path.join(bookDir, 'glossary', 'glossary-collisions-baseline.json');
}

export function loadBaseline(bookDir) {
  const p = baselinePath(bookDir);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Compare findings against a baseline.
 * @returns {{newCompetitions: Array<object>, changedChoices: Array<object>,
 *            newCommaLists: Array<object>, resolved: string[]}}
 */
export function diffAgainstBaseline(collisions, baseline) {
  const baseComps = (baseline && baseline.competitions) || {};
  const baseLists = (baseline && baseline.commaLists) || {};

  const newCompetitions = [];
  const changedChoices = [];
  for (const c of collisions.competitions) {
    const b = baseComps[c.english];
    if (!b) {
      newCompetitions.push(c);
      continue;
    }
    // A changed `chosen` for an unchanged candidate set is the drift this
    // fence exists to catch: row order shifted and readers silently got a
    // different word.
    if (b.chosen !== c.chosen || b.candidates.join(' ') !== c.candidates.join(' ')) {
      changedChoices.push({ english: c.english, was: b, now: c });
    }
  }

  const newCommaLists = collisions.commaLists.filter((c) => baseLists[c.english] !== c.value);
  const seen = new Set(collisions.competitions.map((c) => c.english));
  const resolved = Object.keys(baseComps).filter((k) => !seen.has(k));

  return { newCompetitions, changedChoices, newCommaLists, resolved };
}

function buildBaseline(collisions) {
  const competitions = {};
  for (const c of collisions.competitions) {
    competitions[c.english] = { candidates: c.candidates, chosen: c.chosen };
  }
  const commaLists = {};
  for (const c of collisions.commaLists) commaLists[c.english] = c.value;
  return {
    _note:
      'Accepted term competitions (register C18). This file is a WORKLIST, not an approval. ' +
      'Every entry is an unresolved editorial decision (register C14 (2)) that row order is ' +
      'currently making on readers’ behalf. Shrink it by resolving terms in the terminology ' +
      'DB; do not grow it to silence the gate.',
    competitions,
    commaLists,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2), [
    BOOK_OPTION,
    { name: 'updateBaseline', flags: ['--update-baseline'], type: 'boolean', default: false },
  ]);
  if (args.help) {
    console.log('validate-glossary.js — gate on unresolved term competitions. See file header.');
    process.exit(0);
  }
  requireBook(args);

  const bookDir = path.join(REPO_ROOT, 'books', args.book);
  const gp = glossaryPath(bookDir);
  if (!fs.existsSync(gp)) {
    console.log(`${args.book}: no glossary-unified.json — nothing to check`);
    process.exit(0);
  }

  const glossary = JSON.parse(fs.readFileSync(gp, 'utf8'));
  const collisions = findGlossaryCollisions(glossary.terms || [], { approvedOnly: true });

  if (args.updateBaseline) {
    const out = buildBaseline(collisions);
    fs.writeFileSync(baselinePath(bookDir), JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(
      `Wrote ${baselinePath(bookDir)} — ${collisions.competitions.length} competition(s), ` +
        `${collisions.commaLists.length} comma-list(s)`
    );
    process.exit(0);
  }

  const baseline = loadBaseline(bookDir);
  const d = diffAgainstBaseline(collisions, baseline);

  for (const c of d.newCompetitions) {
    console.error(
      `NEW competition: ${c.english} → ${c.candidates.join(' | ')} (using: ${c.chosen})`
    );
  }
  for (const c of d.changedChoices) {
    console.error(
      `CHANGED choice: ${c.english} was "${c.was.chosen}", now "${c.now.chosen}" — row order shifted`
    );
  }
  for (const c of d.newCommaLists) {
    console.error(`NEW comma-list: ${c.english} → "${c.value}"`);
  }
  for (const k of d.resolved) {
    console.log(`resolved since baseline (remove from baseline): ${k}`);
  }

  const findings = d.newCompetitions.length + d.changedChoices.length + d.newCommaLists.length;
  console.log(
    `\n${args.book}: ${collisions.competitions.length} competition(s), ` +
      `${collisions.commaLists.length} comma-list(s), ${findings} beyond baseline` +
      (baseline ? '' : ' (NO BASELINE FILE — every finding is new)')
  );
  process.exit(findings > 0 ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
