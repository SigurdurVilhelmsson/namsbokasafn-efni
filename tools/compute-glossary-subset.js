#!/usr/bin/env node
/**
 * Compute a chapter's `--glossary-only` subset FROM MEASUREMENT.
 *
 * 🔴 WHY THIS EXISTS. The subsets were hand-curated to dodge substring false
 * positives (`ether` inside *together*), and in doing so they DROPPED approved
 * terms the chapter needed. Measured 2026-09-21 on already-bought chapters:
 *
 *   ch14  buffer          -> stuðpúði          approved, absent from subset, MT said jafnalausn
 *   ch12  catalysis       -> hvötun            approved, absent from subset, MT said hvörf
 *   ch14  polyprotic acid -> fjölvirk sýra     approved, absent from subset, MT said fjölróteindasýra
 *   ch14  conjugate       -> samoka            approved, absent from subset, MT said samtengd
 *   ch10  unit cell       -> grindareining     approved, absent from subset, MT said einingarfruma
 *                                              (67x) AND einingarhólf (10x) — two invented terms
 *
 * ⚠️ AND THE CURATION RESTED ON A FALSE PREMISE. The handoff excluded `cell` from
 * ch10 saying "118x unit cell (already `grindareining`)". Measured: **zero**
 * occurrences of `grindareining` in ch10's MT. ▶ *The plan says X* is a hypothesis
 * to execute, never a finding.
 *
 * 🔴 THE TWO ERROR DIRECTIONS ARE NOT SYMMETRIC, which is what sets the rules
 * below. `headwordAppearsIn`'s own docstring says it: sending a WRONG term is
 * actively harmful (§C73 measured the model OBEYING a bad entry on 2 of 5
 * occurrences, the wrong stem then propagating into every compound), while
 * omitting a term the model already handles costs little. So every rule here
 * EXCLUDES on suspicion and INCLUDES only on evidence.
 *
 * THREE EXCLUSION RULES, each keyed to a measured hazard:
 *
 *  1. SUBSTRING COLLISION. `headwordAppearsIn` matches a headword longer than
 *     `SHORT_HEADWORD_MAX_LEN` as a case-insensitive SUBSTRING — §C116 fixed the
 *     SHORT half only. So `ether` fires inside *together*. A term whose
 *     word-boundary count is a small fraction of its substring count is firing
 *     inside other words and is excluded.
 *     ⚠️ A MULTIWORD term cannot collide this way — the space is its own boundary —
 *     so multiword terms are never excluded by this rule. That is the whole reason
 *     `unit cell`, `buffer solution` and `conjugate acid` are safe to include.
 *
 *  2. SHADOWING. A short headword that is a substring of a longer approved term
 *     present in the same text shadows it: `cell -> ker` is wrong in *unit cell*,
 *     where `grindareining` is right. When the longer term accounts for most of
 *     the shorter one's occurrences, the shorter is excluded and the longer kept.
 *
 *  3. ALREADY HANDLED — §C73's test, and the one that does the most work.
 *     CLAUDE.md: *"the test for whether a term is worth having is §C73's: ask
 *     what the model does UNPROMPTED. The committed 02-mt-output was produced
 *     against an older, smaller glossary, so it IS that control."* If the approved
 *     Icelandic already appears in this chapter's existing MT, the model needs no
 *     help and the term is excluded. This is what separates `energy -> orka` (the
 *     model says *orka* by itself — omit) from `buffer -> stuðpúði` (the model says
 *     *jafnalausn* — include). Without it the subset fills with ordinary English
 *     words that happen to carry a chemistry row: `learning`, `box`, `case`, `row`.
 *
 *  4. RULED-OUT. An explicit per-run list of terms a human has judged harmful for
 *     this book, passed with --exclude. Nothing is hardcoded here: a hardcoded
 *     list is the curation this tool exists to replace.
 *
 * Usage:
 *   node tools/compute-glossary-subset.js --book efnafraedi-2e --chapter 16
 *   node tools/compute-glossary-subset.js --book efnafraedi-2e --chapter 16 --json
 *   node tools/compute-glossary-subset.js --book efnafraedi-2e --chapter 16 --explain
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * ENFORCEABLE VALUES. They live here, beside the code that reads them, with a
 * test over the corpus — never in prose. Each is derived, not chosen:
 *
 * MIN_OCCURRENCES — a term appearing once or twice is noise the model handles;
 *   the measured defects all appeared 20x+. 5 is deliberately below that so a
 *   genuine low-frequency house term is not silently dropped.
 * COLLISION_RATIO — `ether` in ch01 is 27 substring hits and 0 word-boundary
 *   hits, a ratio of 0. `hole` in ch02 is the same shape. A term firing inside
 *   other words more than half the time is not about this chapter.
 * SHADOW_COVERAGE — when a longer approved term explains this fraction or more
 *   of a shorter one's hits, the shorter is the wrong instrument.
 */
export const MIN_OCCURRENCES = 5;
export const COLLISION_RATIO = 0.5;
export const SHADOW_COVERAGE = 0.6;

/**
 * Rule 3's threshold, and it is a COVERAGE RATIO, not a count.
 *
 * 🔴 AN ABSOLUTE COUNT IS THE WRONG INSTRUMENT AND THE CONTROL CAUGHT IT. The
 * first cut asked "does the approved Icelandic appear at all?" with a threshold
 * of 2 — and EXCLUDED `buffer` from ch14 and `catalysis` from ch12, the two terms
 * this tool exists to catch. ch14's MT carries `stuðpúði` 5 times and the
 * competing `jafnalausn` 53; ch12's carries `hvötun` 3 times and `hvörf` 11. The
 * approved term was present, and losing.
 *
 * ▶ So the question is not PRESENCE but DOMINANCE: does the model produce the
 * approved Icelandic for most of the occurrences of the English term? Coverage
 * below this fraction means something else is winning, and the glossary row is
 * doing real work.
 *
 * ⚠️ Coverage can exceed 1 legitimately — Icelandic compounds put the stem inside
 * longer words — and that only strengthens "already handled".
 */
export const ALREADY_HANDLED_COVERAGE = 0.5;

/**
 * Icelandic stem for an approximate inflected match. Takes the FIRST word (a
 * multiword Icelandic term inflects its head) and drops a short inflecting tail.
 * ⚠️ Approximate on purpose, and the direction of its error is the safe one: a
 * stem that is too short over-matches, which excludes a term — the cheap error.
 */
export function icelandicStem(icelandic) {
  const first = String(icelandic || '')
    .trim()
    .split(/\s+/)[0]
    .replace(/[-–—]+$/, '');
  // ⚠️ THE FLOOR IS 3, NOT 5, AND THE CONTROL IS WHY. `orka` stemmed to itself
  // and missed `orku` — the commonest inflected form — so coverage under-counted
  // and `energy` was wrongly INCLUDED for a chapter where the model says *orku*
  // throughout. Icelandic inflects the tail, so the stem must be shorter than
  // feels comfortable. Over-matching excludes a term, which the asymmetry at the
  // top of this file names as the cheap error.
  return first.slice(0, Math.max(3, first.length - 2));
}

/** `headwordAppearsIn`'s threshold, mirrored. Below it the matcher is already
 *  word-boundary + case-sensitive, so rule 1 cannot apply. */
export const SHORT_HEADWORD_MAX_LEN = 3;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Word-boundary count, Unicode-safe. `\b` is ASCII-only and would fire inside a
 *  word carrying an accented letter — the same reason `headwordAppearsIn` spells
 *  its boundaries as lookarounds. */
export function countWordBoundary(text, term) {
  // ⚠️ AN OPTIONAL ENGLISH PLURAL IS LOAD-BEARING, and the control caught its
  // absence: §14.5's title is "Polyprotic Acids", so a bare `polyprotic acid`
  // boundary match scored it below MIN_OCCURRENCES and the approved
  // `fjölvirk sýra` was dropped from the chapter that is literally about it.
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(term)}(?:e?s)?(?![\\p{L}\\p{N}])`, 'giu');
  return (text.match(re) || []).length;
}

/** Substring count — what the matcher actually does for a headword > 3 chars. */
export function countSubstring(text, term) {
  const re = new RegExp(escapeRegex(term), 'gi');
  return (text.match(re) || []).length;
}

/**
 * @param {Array<{english:string, icelandic:string, status:string}>} approved
 * @param {string} text the chapter's English
 * @param {{exclude?: Set<string>, mtText?: string}} [opts]
 * @returns {{subset: string[], excluded: Array<{term:string, why:string, detail:string}>}}
 */
export function computeSubset(approved, text, opts = {}) {
  const exclude = opts.exclude || new Set();
  const mtLower = (opts.mtText || '').toLowerCase();
  const measured = [];
  for (const t of approved) {
    const w = (t.english || '').trim();
    if (!w) continue;
    const wb = countWordBoundary(text, w);
    if (wb < MIN_OCCURRENCES) continue;
    measured.push({ term: w, icelandic: t.icelandic, wb, sub: countSubstring(text, w) });
  }

  const excluded = [];
  const keep = [];
  for (const m of measured) {
    if (exclude.has(m.term.toLowerCase())) {
      excluded.push({ term: m.term, why: 'ruled-out', detail: 'named in --exclude' });
      continue;
    }
    // Rule 3 — §C73: does the model already produce this unprompted, and DOMINANTLY?
    if (mtLower) {
      const stem = icelandicStem(m.icelandic).toLowerCase();
      if (stem.length >= 3) {
        const hits = (mtLower.match(new RegExp(escapeRegex(stem), 'g')) || []).length;
        const coverage = hits / m.wb;
        if (coverage >= ALREADY_HANDLED_COVERAGE) {
          excluded.push({
            term: m.term,
            why: 'already-handled',
            detail: `MT uses "${m.icelandic}" for ${(coverage * 100).toFixed(0)}% of its ${m.wb} occurrences (stem "${stem}" x${hits})`,
          });
          continue;
        }
      }
    }
    const multiword = /\s/.test(m.term);
    // Rule 1 — substring collision. Multiword terms are immune by construction.
    if (!multiword && m.term.length > SHORT_HEADWORD_MAX_LEN && m.sub > 0) {
      const ratio = m.wb / m.sub;
      if (ratio < COLLISION_RATIO) {
        excluded.push({
          term: m.term,
          why: 'substring-collision',
          detail: `${m.wb} word-boundary of ${m.sub} substring hits (${(ratio * 100).toFixed(0)}%)`,
        });
        continue;
      }
    }
    keep.push(m);
  }

  // Rule 2 — shadowing. Longest-first so the longer term always survives.
  const byLen = [...keep].sort((a, b) => b.term.length - a.term.length);
  const shadowed = new Set();
  for (const long of byLen) {
    for (const short of keep) {
      if (short === long || shadowed.has(short.term)) continue;
      if (short.term.length >= long.term.length) continue;
      if (!long.term.toLowerCase().includes(short.term.toLowerCase())) continue;
      if (long.wb / short.wb >= SHADOW_COVERAGE) {
        shadowed.add(short.term);
        excluded.push({
          term: short.term,
          why: 'shadowed',
          detail: `"${long.term}" (${long.wb}x) explains ${((long.wb / short.wb) * 100).toFixed(0)}% of its ${short.wb} hits`,
        });
      }
    }
  }

  return {
    subset: keep.filter((m) => !shadowed.has(m.term)).sort((a, b) => b.wb - a.wb),
    excluded,
  };
}

function main() {
  const args = process.argv.slice(2);
  const get = (n) => {
    const i = args.indexOf(n);
    return i === -1 ? null : args[i + 1];
  };
  const book = get('--book');
  const chapter = get('--chapter');
  if (!book || !chapter) {
    console.error(
      'Usage: --book <slug> --chapter <N|appendices> [--exclude a,b] [--json] [--explain]'
    );
    process.exitCode = 2;
    return;
  }
  const chd = /^\d+$/.test(chapter) ? `ch${String(Number(chapter)).padStart(2, '0')}` : chapter;
  const dir = path.join('books', book, '02-for-mt', chd);
  if (!fs.existsSync(dir)) {
    console.error(`No such chapter directory: ${dir}`);
    process.exitCode = 2;
    return;
  }
  let text = '';
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.en.md')) text += fs.readFileSync(path.join(dir, f), 'utf8');
  }
  const gPath = path.join('books', book, 'glossary', 'glossary-unified.json');
  const g = JSON.parse(fs.readFileSync(gPath, 'utf8'));
  const approved = (g.terms || []).filter((t) => t.status === 'approved');

  // §C73's control: this chapter's existing MT, produced under an older glossary.
  const mtDir = path.join('books', book, '02-mt-output', chd);
  let mtText = '';
  if (fs.existsSync(mtDir)) {
    for (const f of fs.readdirSync(mtDir)) {
      if (f.endsWith('.is.md')) mtText += fs.readFileSync(path.join(mtDir, f), 'utf8');
    }
  }

  const exclude = new Set(
    (get('--exclude') || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  if (!mtText) {
    console.error(
      `⚠️  No existing MT at ${mtDir} — §C73's unprompted control is UNAVAILABLE, so rule 3 is inert and this subset will be far too wide. Review it by hand.`
    );
  }
  const { subset, excluded } = computeSubset(approved, text, { exclude, mtText });

  if (args.includes('--json')) {
    console.log(JSON.stringify({ chapter: chd, subset, excluded }, null, 2));
    return;
  }
  console.log(subset.map((s) => s.term).join(','));
  if (args.includes('--explain')) {
    console.error(`\n# ${chd}: ${subset.length} terms from ${approved.length} approved`);
    for (const s of subset)
      console.error(`  + ${String(s.wb).padStart(4)}x  ${s.term}  ->  ${s.icelandic}`);
    console.error(`\n# excluded: ${excluded.length}`);
    for (const e of excluded) console.error(`  - ${e.term}  [${e.why}]  ${e.detail}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
