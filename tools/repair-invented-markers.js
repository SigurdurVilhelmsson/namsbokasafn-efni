#!/usr/bin/env node
/**
 * repair-invented-markers.js — unwrap model-INVENTED markers of a KNOWN type
 * from an MT output file, but ONLY where the document proves them separable.
 *
 * 🔴 THE DEFECT (§C118 ⑳). The Málstaður model fuses the structured `glossaries`
 * API field with the bracket syntax it sees in the text and EMPHASISES glossary
 * target words: `[[i:basa]]`, `[[i:rafeinda]]`, `[[i:hvarfganginn]]` where the
 * English carried no marker at all. That is §C67 class 3 — except the model
 * reaches for a KNOWN type (`i`, `b`) instead of inventing a type name, so
 * `api-translate.js`'s `unwrapInventedMarkers` structurally cannot see it: it
 * unwraps only types ABSENT from `KNOWN_BRACKET_TYPES`, and rightly so, because
 * a real `[[i:β]]` must never be stripped.
 *
 * Measured enrichment of invented payloads toward glossary terms the run
 * actually SENT, normalised by population size: 15x on ch23's `[[i:]]` and 107x
 * on m00038's `[[b:]]`. ⚠️ The run-LEVEL causal test is underpowered and does
 * NOT confirm it — only 7 same-vintage files ran without a glossary, and a 3.7%
 * base rate predicts 0.26 hits there, so 0 of 7 is not evidence. **The trigger is
 * supported at the payload level and unproven at the run level.**
 *
 * 🔴 WHY THIS IS A PRECONDITION AND NOT A HEURISTIC — the obvious rule is FALSE.
 * "A marker whose payload is absent from the English is invented" looked exact on
 * the first file inspected (19 of 19 real markers survived verbatim). Across all
 * 61 same-vintage corpus pairs it is not: `[[i:]]` payloads survive verbatim
 * 91.2% of the time and `[[b:]]` only 75.5%, because a real
 * `[[b:Chemistry in Everyday Life]]` is PROSE and gets translated. Applied blind,
 * the rule would delete 181 real italics and 125 real bolds.
 *
 * ▶ SO IT IS APPLIED ONLY WHERE THE DOCUMENT ITSELF PROVES SEPARABILITY, PER TYPE:
 *     (a) every source marker of that type still has a payload present in the
 *         output — nothing real was translated away, so nothing real is at risk;
 *     (b) no surplus payload also occurs in the source segment — so no occurrence
 *         is ambiguous between real and invented.
 * Either failing REFUSES that type and returns its text untouched. Measured: the
 * precondition holds for ch23's `[[i:]]` and FAILS for m00038's `[[b:]]`, and 44
 * of 61 same-vintage files fail it somewhere. **Refusing most of the corpus is
 * the feature, not a limitation.**
 *
 * ⚠️ WRITES INTO `02-mt-output/`, WHICH IS READ-ONLY BY PROJECT CONVENTION.
 * Dry-run by default; `--apply` is required, and it backs the file up first.
 * The sanctioned way to change that tree is to re-run `api-translate`; this tool
 * exists because a re-run costs money and may reproduce the defect, and because
 * the surplus here is provably separable without one.
 *
 * ── AND THE MIRROR CASE, WHICH IS NOT SYMMETRIC. `--restore` puts back a marker
 * the model DROPPED. That is NOT mechanically decidable: unwrapping a surplus
 * needs only "which markers are absent from the source", while restoring a drop
 * needs "which WORD in the translation was the emphasised one" — a
 * correspondence ACROSS a translation. Measured over all 61 same-vintage pairs,
 * of 308 dropped markers only **4 (1.3%)** have their source payload sitting
 * unambiguously in the output. ▶ So the operator names the target and the tool
 * only verifies: the segment must really be short a marker, the target must occur
 * EXACTLY ONCE, and it must not already sit inside a marker. One segment per
 * call, never part of the sweep.
 *
 * Usage:
 *   node tools/repair-invented-markers.js --book <slug> --chapter <n> [--module <id>]
 *   node tools/repair-invented-markers.js --book <slug> --chapter 23 --module exercises --apply
 *   node tools/repair-invented-markers.js --book <slug> --chapter 14 --module exercises \
 *        --restore '<segId>|<type>|<target text>' --apply
 *
 * Options:
 *   --book <slug>     Book slug (required)
 *   --chapter <n>     Chapter number, or `appendices` (required)
 *   --module <id>     Single unit: mNNNNN, `exercises`, `chapter-metadata`
 *   --types <list>    Comma-separated marker types (default: i,b,em,u)
 *   --apply           Actually write. Without it, nothing is modified.
 *   --restore <spec>  Put back ONE dropped marker: "<segId>|<type>|<target>".
 *                     Needs exactly one --module. The target is your judgement;
 *                     the tool only verifies it is unambiguous.
 *   --force-vintage   Proceed even if the EN was re-extracted after the MT ran.
 *                     ⚠️ There a "surplus" is just different source text.
 *   -v, --verbose     List every removal
 *   -h, --help
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  parseArgs,
  BOOK_OPTION,
  CHAPTER_OPTION,
  MODULE_OPTION,
  requireBook,
} from './lib/parseArgs.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Inline types whose payload is prose the model may wrap around a glossary word.
 *  Deliberately excludes `sub`/`sup` (digits and charges, never glossary targets)
 *  and every opaque placeholder. */
export const DEFAULT_TYPES = ['i', 'b', 'em', 'u'];

const SEG_SPLIT_RE = /(?=<!-- SEG:)/;
const SEG_ID_RE = /<!-- SEG:(\S+?) -->/;

/**
 * Depth-aware scan for `[[type:...]]` occurrences.
 *
 * ⚠️ NOT `\[\[type:([^\]]*)\]\]`. Real payloads nest — `C[[i:[[sub:n]]]]H` is in
 * the corpus — and a character class used to find the end of a structured token
 * is this repo's §C115 defect, now met three times over. A truncating scan would
 * report a nested real marker as an unmatched payload and delete it.
 *
 * @returns {Array<{start:number, end:number, payload:string}>}
 */
export function scanMarkers(text, type) {
  const open = `[[${type}:`;
  const out = [];
  let i = 0;
  while (i < text.length) {
    if (!text.startsWith(open, i)) {
      i++;
      continue;
    }
    let j = i + open.length;
    let depth = 1;
    while (j < text.length && depth > 0) {
      if (text.startsWith('[[', j)) {
        depth++;
        j += 2;
      } else if (text.startsWith(']]', j)) {
        depth--;
        if (depth === 0) break;
        j += 2;
      } else j++;
    }
    if (depth !== 0) break; // unbalanced — stop rather than guess
    out.push({ start: i, end: j + 2, payload: text.slice(i + open.length, j) });
    i = j + 2;
  }
  return out;
}

function splitSegments(text) {
  const out = [];
  for (const part of text.split(SEG_SPLIT_RE)) {
    if (!part.length) continue;
    const m = part.match(SEG_ID_RE);
    out.push({ segId: m ? m[1] : null, text: part });
  }
  return out;
}

const tally = (arr) => arr.reduce((a, v) => ((a[v] = (a[v] || 0) + 1), a), {});

/**
 * Plan (and apply, in memory) a marker-surplus repair.
 *
 * @param {string} enText - the English segment file (the source of truth for
 *   which markers are real).
 * @param {string} isText - the MT output to repair.
 * @param {{types?: string[]}} [options]
 * @returns {{perType: Record<string, {enCount:number, kept:number, surplus:number,
 *   ambiguous:number, ok:boolean, reason:string|null}>,
 *   removals: Array<{segId:string, type:string, payload:string}>, text:string}}
 */
export function planMarkerRepair(enText, isText, { types = DEFAULT_TYPES } = {}) {
  const enSegs = new Map(splitSegments(enText).map((s) => [s.segId, s.text]));
  const isSegs = splitSegments(isText);

  // ── Pass 1: decide per type, over the WHOLE document, before touching anything.
  const perType = {};
  for (const type of types) {
    let enCount = 0;
    let kept = 0;
    let surplus = 0;
    let ambiguous = 0;
    for (const seg of isSegs) {
      const en = enSegs.get(seg.segId);
      if (en === undefined) continue;
      const enPay = scanMarkers(en, type).map((m) => m.payload);
      const isPay = scanMarkers(seg.text, type).map((m) => m.payload);
      const ec = tally(enPay);
      const ic = tally(isPay);
      for (const p of enPay) {
        enCount++;
        if ((ic[p] || 0) > 0) kept++;
      }
      for (const [p, n] of Object.entries(ic)) {
        const extra = n - (ec[p] || 0);
        if (extra > 0) {
          surplus += extra;
          if (ec[p]) ambiguous += extra;
        }
      }
    }
    let reason = null;
    if (enCount !== kept) {
      reason = `${enCount - kept} of ${enCount} source marker(s) not present in the output — translated away, so real and invented are indistinguishable`;
    } else if (ambiguous > 0) {
      reason = `${ambiguous} surplus occurrence(s) share a payload with a real marker in the same segment — ambiguous`;
    }
    perType[type] = { enCount, kept, surplus, ambiguous, ok: reason === null, reason };
  }

  // ── Pass 2: rewrite only the types that passed, and only their surplus.
  const repairable = new Set(types.filter((t) => perType[t].ok && perType[t].surplus > 0));
  const removals = [];
  if (repairable.size === 0) return { perType, removals, text: isText };

  let out = '';
  for (const seg of isSegs) {
    const en = enSegs.get(seg.segId);
    if (en === undefined) {
      out += seg.text;
      continue;
    }
    // Collect every cut across all repairable types, then splice right-to-left
    // so earlier offsets stay valid.
    const cuts = [];
    for (const type of repairable) {
      const enPay = new Set(scanMarkers(en, type).map((m) => m.payload));
      for (const m of scanMarkers(seg.text, type)) {
        // The precondition guarantees a surplus payload occurs 0 times in the
        // source segment, so "absent from the source" IS "invented" here — and
        // only here.
        if (!enPay.has(m.payload)) {
          cuts.push({ ...m, type });
          removals.push({ segId: seg.segId, type, payload: m.payload });
        }
      }
    }
    cuts.sort((a, b) => b.start - a.start);
    let s = seg.text;
    for (const c of cuts) s = s.slice(0, c.start) + c.payload + s.slice(c.end);
    out += s;
  }
  return { perType, removals, text: out };
}

/**
 * Put back a marker the model DROPPED, at a target the caller names.
 *
 * 🔴 A DROP IS NOT THE MIRROR OF AN INVENTION AND IS NOT MECHANICALLY DECIDABLE.
 * Unwrapping a surplus needs only "which markers are absent from the source".
 * Restoring a drop needs "which WORD in the translation is the one that was
 * emphasised" — a correspondence ACROSS a translation. Measured over all 61
 * same-vintage corpus pairs: of 308 dropped markers only **4 (1.3%)** have their
 * source payload sitting unambiguously in the output. ch14's `[[i:enamine]]` is
 * in the other 98.7% — it became `enamíns`.
 *
 * ▶ SO THE JUDGEMENT IS THE OPERATOR'S AND ONLY THE MECHANICS ARE THE TOOL'S.
 * The caller names the target text; this refuses unless the segment really is
 * missing a marker of that type, the target occurs EXACTLY ONCE, and the target
 * is not already inside a marker. Deliberately NOT wired into the sweep: there
 * is no rule here to run unattended.
 *
 * @param {string} enText
 * @param {string} isText
 * @param {{segId:string, type:string, target:string}} spec
 * @returns {{ok:boolean, reason:string|null, text:string}}
 */
export function planMarkerRestore(enText, isText, { segId, type, target }) {
  const refuse = (reason) => ({ ok: false, reason, text: isText });
  const enSeg = splitSegments(enText).find((s) => s.segId === segId);
  const isSegs = splitSegments(isText);
  const idx = isSegs.findIndex((s) => s.segId === segId);
  if (!enSeg || idx === -1) return refuse(`segment ${segId} not found in both files`);

  const enCount = scanMarkers(enSeg.text, type).length;
  const isMarkers = scanMarkers(isSegs[idx].text, type);
  if (enCount <= isMarkers.length) {
    return refuse(
      `no dropped [[${type}:]] in ${segId} — source has ${enCount}, output has ${isMarkers.length}`
    );
  }

  const body = isSegs[idx].text;
  const occurrences = [];
  for (let at = body.indexOf(target); at !== -1; at = body.indexOf(target, at + 1)) {
    occurrences.push(at);
  }
  if (occurrences.length === 0) return refuse(`target "${target}" not found in ${segId}`);
  if (occurrences.length > 1) {
    return refuse(
      `target "${target}" occurs ${occurrences.length} times in ${segId} — ambiguous, it must occur exactly once`
    );
  }

  // Never nest a marker inside another marker's payload: the emphasis would be
  // wrong and the depth-aware scanners would then disagree about the boundary.
  const at = occurrences[0];
  for (const t of new Set([...DEFAULT_TYPES, type, 'sub', 'sup', 'term', 'fn', 'link', 'docref'])) {
    for (const m of scanMarkers(body, t)) {
      if (at >= m.start && at < m.end) {
        return refuse(`target "${target}" is already inside a [[${t}:]] marker in ${segId}`);
      }
    }
  }

  const restored = `${body.slice(0, at)}[[${type}:${target}]]${body.slice(at + target.length)}`;
  const after = scanMarkers(restored, type).length;
  // Defensive: unreachable today, since a marker is only added when there IS a
  // gap, so the count can never pass the source's. Kept because a silent
  // overshoot would be an emphasis the source never had.
  if (after > enCount) return refuse(`restoring would overshoot: ${after} > ${enCount}`);
  // ⚠️ A segment can be missing MORE than one marker — orverufraedi m58781
  // drops two `[[b:]]` from a single segment. Reporting the gap beats refusing:
  // refusing would make a multi-drop segment permanently unrepairable, and the
  // operator needs to know one call did not finish the job.
  const remaining = enCount - after;
  const out = isSegs.map((s, i) => (i === idx ? restored : s.text)).join('');
  return { ok: true, reason: null, text: out, remaining };
}

/**
 * Is the English source no newer than the MT output that was made from it?
 *
 * 68.2% of committed pairs are STALE — the EN was re-extracted after the MT ran —
 * and there a "surplus" is simply different source text, not a defect. Pure over
 * two timestamps on purpose: a git/mtime-based check would be vacuous in CI,
 * which clones at depth 1 and stamps every mtime with the checkout instant.
 */
export function sameVintage(enCommittedIso, mtGeneratedIso) {
  if (!enCommittedIso || !mtGeneratedIso) return false;
  const a = new Date(enCommittedIso).getTime();
  const b = new Date(mtGeneratedIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return a <= b;
}

// ─── CLI ────────────────────────────────────────────────────────────

function printHelp() {
  console.log(
    fs
      .readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => l.startsWith(' * ') || l.startsWith(' *   '))
      .map((l) => l.slice(3))
      .join('\n')
  );
}

function formatChapter(chapter) {
  return chapter === 'appendices' ? 'appendices' : `ch${String(chapter).padStart(2, '0')}`;
}

function unitsIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^(m\d+|exercises|chapter-metadata)-segments\.en\.md$/.test(f))
    .map((f) => f.replace('-segments.en.md', ''))
    .sort();
}

function enCommitIso(file) {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cI', '--', file], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    return;
  }
  const args = parseArgs(argv, [
    BOOK_OPTION,
    CHAPTER_OPTION,
    MODULE_OPTION,
    { name: 'types', flags: ['--types'], type: 'string', default: DEFAULT_TYPES.join(',') },
    { name: 'apply', flags: ['--apply'], type: 'boolean', default: false },
    { name: 'restore', flags: ['--restore'], type: 'string', default: null },
    { name: 'forceVintage', flags: ['--force-vintage'], type: 'boolean', default: false },
    { name: 'verbose', flags: ['--verbose', '-v'], type: 'boolean', default: false },
  ]);
  requireBook(args);
  if (args.chapter == null) {
    console.error('Error: --chapter is required');
    process.exitCode = 1;
    return;
  }
  const types = String(args.types)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const bookDir = path.join(REPO_ROOT, 'books', args.book);
  const ch = formatChapter(args.chapter);
  const enDir = path.join(bookDir, '02-for-mt', ch);
  const isDir = path.join(bookDir, '02-mt-output', ch);
  let units = unitsIn(enDir);
  if (args.module) units = units.filter((u) => u === args.module);
  if (units.length === 0) {
    console.error(
      `Error: no units found for ${args.book}/${ch}${args.module ? `/${args.module}` : ''}`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\nrepair-invented-markers — ${args.book}/${ch}  types: ${types.join(',')}`);
  console.log(
    args.apply ? '  MODE: APPLY (files will be written)' : '  MODE: dry run (nothing written)'
  );
  console.log('═'.repeat(66));

  // ── RESTORE: put back a DROPPED marker at a target the operator names.
  // Separate from the sweep on purpose — there is no rule here to run
  // unattended (only 1.3% of dropped markers are mechanically locatable), so the
  // target is always supplied by hand and this never touches more than one.
  if (args.restore) {
    const [segId, type, ...rest] = String(args.restore).split('|');
    const target = rest.join('|');
    if (!segId || !type || !target) {
      console.error('Error: --restore takes "<segId>|<type>|<target text>"');
      process.exitCode = 1;
      return;
    }
    if (units.length !== 1) {
      console.error(`Error: --restore needs exactly one --module (matched ${units.length})`);
      process.exitCode = 1;
      return;
    }
    const unit = units[0];
    const enPath = path.join(enDir, `${unit}-segments.en.md`);
    const isPath = path.join(isDir, `${unit}-segments.is.md`);
    const r = planMarkerRestore(fs.readFileSync(enPath, 'utf8'), fs.readFileSync(isPath, 'utf8'), {
      segId,
      type,
      target,
    });
    if (!r.ok) {
      console.error(`  REFUSED — ${r.reason}`);
      process.exitCode = 1;
      return;
    }
    console.log(`  ${unit}: restored [[${type}:${target}]] in ${segId}`);
    if (r.remaining > 0) {
      console.log(
        `  ⚠️  ${r.remaining} further [[${type}:]] marker(s) still missing from that segment`
      );
    }
    if (args.apply) {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      fs.copyFileSync(isPath, `${isPath}.${stamp}.bak`);
      fs.writeFileSync(isPath, r.text, 'utf8');
      console.log(`      → written (backup: ${path.basename(isPath)}.${stamp}.bak)`);
    } else {
      console.log('  (dry run — re-run with --apply to write)');
    }
    return;
  }

  let totalRemovals = 0;
  let repairedFiles = 0;
  let refusedTypes = 0;

  for (const unit of units) {
    const enPath = path.join(enDir, `${unit}-segments.en.md`);
    const isPath = path.join(isDir, `${unit}-segments.is.md`);
    const provPath = path.join(isDir, `${unit}-provenance.json`);
    if (!fs.existsSync(isPath)) continue;

    let generatedAt = null;
    try {
      generatedAt = JSON.parse(fs.readFileSync(provPath, 'utf8')).generatedAt;
    } catch {
      /* no sidecar — handled by the vintage guard below */
    }
    const vintageOk = sameVintage(enCommitIso(enPath), generatedAt);
    if (!vintageOk && !args.forceVintage) {
      console.log(
        `  ${unit}: SKIPPED — the English is newer than this MT output (or the sidecar is missing). ` +
          `A "surplus" here is different source text, not an invented marker. Use --force-vintage to override.`
      );
      continue;
    }

    const enText = fs.readFileSync(enPath, 'utf8');
    const isText = fs.readFileSync(isPath, 'utf8');
    const plan = planMarkerRepair(enText, isText, { types });

    const acted = [];
    for (const type of types) {
      const t = plan.perType[type];
      if (!t || (t.enCount === 0 && t.surplus === 0)) continue;
      if (!t.ok) {
        console.log(`  ${unit}: [[${type}:]] REFUSED — ${t.reason}`);
        refusedTypes++;
      } else if (t.surplus > 0) {
        acted.push(`[[${type}:]] ${t.surplus} invented marker(s) unwrapped`);
      }
    }
    if (acted.length === 0) {
      if (args.verbose) console.log(`  ${unit}: nothing to repair`);
      continue;
    }

    console.log(`  ${unit}: ${acted.join(' · ')}`);
    if (args.verbose) {
      for (const r of plan.removals) console.log(`      - ${r.segId}  [[${r.type}:${r.payload}]]`);
    }
    totalRemovals += plan.removals.length;
    repairedFiles++;

    if (args.apply) {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      fs.copyFileSync(isPath, `${isPath}.${stamp}.bak`);
      fs.writeFileSync(isPath, plan.text, 'utf8');
      console.log(`      → written (backup: ${path.basename(isPath)}.${stamp}.bak)`);
    }
  }

  console.log('═'.repeat(66));
  console.log(
    `  files with repairs: ${repairedFiles} · markers unwrapped: ${totalRemovals} · types refused: ${refusedTypes}`
  );
  if (!args.apply && totalRemovals > 0) console.log('  (dry run — re-run with --apply to write)');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
