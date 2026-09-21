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
 * 🔴 KNOWN LIMIT, MEASURED AND NOT FIXED: RULE 3 CANNOT SEE AN *INVENTED*
 * COMPETING FORM. It asks "does the approved Icelandic appear often enough?" and
 * never "is something else winning?". A listed `alternatives` rival is caught
 * (see the competing-form flag), but an invented one is not:
 *   ch16 `spontaneous` -> sjálfgengur scores >76% coverage while the MT ALSO
 *     carries sjálfsprott- 38 and sjálfkrafa 21, and the section title
 *     *Spontaneity* came back as the invented noun *Sjálfsprotti*.
 *   ch16 `free energy` -> frjáls orka looks handled while fríorka 29 — a form
 *     appearing in NO other chapter of the book — is what the chapter actually uses.
 * ▶ **THE CANDIDATE LIST IS THEREFORE NOT A SUBSET. IT MUST BE AUDITED BY SOMEONE
 * WHO READS ICELANDIC CHEMISTRY**, which is also the only way to catch wrong-sense
 * homographs (`case`, `learning`, `row`). `--explain` now prints each term's
 * `domain` tag and the corpus-wide count of its approved Icelandic precisely so an
 * auditor can spot both classes quickly.
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
export const ALREADY_HANDLED_COVERAGE = 0.5;

/**
 * Rule 3's UPPER bound, and it is not a refinement — it is a correctness fix.
 *
 * 🔴 A COVERAGE RATIO WELL ABOVE 1 IS NOT STRONG EVIDENCE OF HANDLING, IT IS
 * EVIDENCE THE STEM IS MATCHING NOISE. Measured by the 2026-09-21 audit:
 *   `vermi` -> stem `ver` matched verður/verið/veruleg 190x in ch16 = 704%
 *     coverage, and `enthalpy` — a RULED standing term with a paid control
 *     behind it — was silently deleted from all seven subsets.
 *   `grei` (gray) matched greina/greinilega = 1071%.
 *   `sykra` (carbohydrate) matched fjölsykrur/einsykrur/sykursýki = 686%,
 *     while the true rendering of *carbohydrate* was 0 of 7.
 * Above this ceiling the control is UNRELIABLE, so the term is kept and flagged
 * rather than excluded. Keeping costs a term on the wire; excluding cost a ruling.
 */
export const STEM_NOISE_CEILING = 2.0;

/**
 * Terms that ride EVERY chapter's wire for a book, by ruling.
 *
 * 🔴 `docs/decisions/2026-09-19-glossary-subset-standard-per-chapter.md` (Status:
 * **Accepted**) makes `--glossary-only "enthalpy,enthalpy change"` the standard
 * arm for chemistry text MT. The first cut of this tool injected nothing, so the
 * rules deleted the pair from all seven subsets — **a tool causing a ruling
 * violation**, and no reviewer caught it because the removal happened before the
 * candidate list was written.
 *
 * ⚠️ Unioned in AFTER the rules run, so no rule can remove them. On a chapter
 * whose English lacks the term the row fires on zero chunks, so carrying it costs
 * nothing and keeps the arm consistent.
 */
export const STANDING_TERMS = {
  'efnafraedi-2e': ['enthalpy', 'enthalpy change'],
  'lifraen-efnafraedi': ['enthalpy', 'enthalpy change'],
};

/**
 * How much §C73's unprompted control can be trusted for this chapter.
 *
 * 🔴 `schemaVersion: 1` MT HAS NO GLOSSARY RECORD AND COMES FROM THE FULL-GLOSSARY
 * ERA, so a term appearing in it may be there BECAUSE the glossary put it there.
 * §C73's premise — "the committed output was produced against an older, SMALLER
 * glossary, so it IS that control" — does not hold for a term that was on that
 * wire. Rule 3 still runs (it is right about most terms), but its verdict is
 * stamped with the control quality so a human auditor can weigh it.
 */
export function controlQuality(provenances) {
  if (!provenances.length) return { kind: 'none', note: 'no MT for this chapter' };
  const v2 = provenances.filter((p) => p && p.schemaVersion === 2 && p.run && p.run.glossary);
  if (v2.length === provenances.length) {
    const arms = [...new Set(v2.map((p) => p.run.glossary.arm))];
    return { kind: 'restricted', note: `MT arm(s): ${arms.join(', ')} — control is sound` };
  }
  return {
    kind: 'full-glossary',
    note: `${provenances.length - v2.length} of ${provenances.length} sidecars are schemaVersion 1 (no glossary record) — FULL-GLOSSARY era, so an "already-handled" verdict may be glossary-induced`,
  };
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `headwordAppearsIn`'s threshold, mirrored. */
export const SHORT_HEADWORD_MAX_LEN = 3;

/**
 * Strip the bracket-marker vocabulary before counting.
 *
 * 🔴 WITHOUT THIS, `Br` COUNTS THE LINE-BREAK MARKER. Measured by the audit:
 * `[[BR]]` gave `Br` 22 hits in ch16 (20 spurious), 65 in ch20 (60 spurious) and
 * 10 in ch21 — where the chapter contains **no bromine at all**. Several such
 * terms then cleared MIN_OCCURRENCES on the artefact alone.
 */
export function stripMarkerVocabulary(text) {
  return String(text || '').replace(/\[\[\/?[A-Za-z][A-Za-z0-9_]*(?::|\||\]\])/g, ' ');
}

/**
 * Count occurrences the way the REAL matcher sees them.
 *
 * 🔴 CASE-SENSITIVITY IS NOT COSMETIC HERE. `headwordAppearsIn` is case-SENSITIVE
 * at word boundaries for headwords of `SHORT_HEADWORD_MAX_LEN` or fewer (§C116),
 * and case-INsensitive substring above it. Counting case-insensitively made every
 * short-symbol count an artefact: `Po` counted 13 in the appendices and **all 13
 * were `PO`**, the phosphate group; `cd` counted 6 and all were `Cd`, cadmium.
 *
 * @param {string} text
 * @param {string} term
 * @param {{plural?: boolean}} [opts] plural defaults true; pass false to count the bare form only
 */
export function countWordBoundary(text, term, opts = {}) {
  const plural = opts.plural !== false;
  // An optional English plural is load-bearing: §14.5's title is "Polyprotic AcidS".
  const tail = plural ? '(?:e?s)?' : '';
  const flags = term.length <= SHORT_HEADWORD_MAX_LEN ? 'gu' : 'giu';
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(term)}${tail}(?![\\p{L}\\p{N}])`, flags);
  return (text.match(re) || []).length;
}

/** Substring count — what the matcher does for a headword above the short threshold. */
export function countSubstring(text, term) {
  const flags = term.length <= SHORT_HEADWORD_MAX_LEN ? 'g' : 'gi';
  return (text.match(new RegExp(escapeRegex(term), flags)) || []).length;
}

/**
 * ICELANDIC STEM FLOOR AND CAP, both measured.
 *
 * 🔴 TOO SHORT IS NOISE, TOO LONG IS BLIND, and the first cut was both.
 *   floor: `vermi` -> `ver` matched verður/verið 190x and deleted a ruled term.
 *          A 3-character stem is not evidence. The floor is 4.
 *   cap:   it took len-2 of the first word, so `oxunar-afoxunarhvarf` became an
 *          18-character stem that no compound the model writes can match. Cap 8.
 */
export const STEM_FLOOR = 4;
export const STEM_CAP = 8;

export function icelandicStem(icelandic) {
  const first = String(icelandic || '')
    .trim()
    .split(/\s+/)[0]
    .replace(/[-–—]+$/, '');
  if (!first) return '';
  const want = first.length - 2;
  return first.slice(0, Math.min(STEM_CAP, Math.max(STEM_FLOOR, want)));
}

/**
 * A regex that matches the stem THROUGH Icelandic sound alternations.
 *
 * 🔴 A LITERAL STEM IS BLIND TO THE TWO COMMONEST ALTERNATIONS, and both were
 * measured: ð/t — `jákvæður` -> `jákvæð` cannot match the neuter `jákvætt`, so
 * ch16's `positive` scored ~0 when the true coverage is 36/35; u-umlaut a->ö —
 * `oxunartala` -> `oxunarta` cannot match `oxunartölu` (18 vs 17), and
 * `efnablanda` cannot match `efnablöndu` (5 of 5).
 *
 * Applied to the FINAL character only, which is where inflection bites; earlier
 * characters stay literal so the stem does not become a wildcard.
 */
export function stemPattern(stem) {
  if (!stem) return null;
  const chars = [...stem];
  // The u-umlaut moves the stem's LAST VOWEL, which is not always the last
  // character: `efnablanda` -> stem `efnablan`, and the model writes `efnablöndu`.
  // Alternating only the final character missed 5 of 5 such hits.
  let lastVowelIdx = -1;
  for (let i = chars.length - 1; i >= 0; i--) {
    if ('aeiouyáéíóúýæöø'.includes(chars[i])) {
      lastVowelIdx = i;
      break;
    }
  }
  const out = chars.map((c, i) => {
    // a -> ö/u is the u-umlaut; applied to the last vowel wherever it sits.
    if (i === lastVowelIdx && c === 'a') return '[aöu]';
    // ð -> t is the neuter/strong alternation; applied at the tail.
    if (i === chars.length - 1) return { ð: '[ðt]', i: '[iu]', o: '[oö]' }[c] || escapeRegex(c);
    return escapeRegex(c);
  });
  return new RegExp(out.join(''), 'g');
}

/**
 * @param {Array<{english:string, icelandic:string, status:string, domain?:string}>} approved
 * @param {string} text the chapter's English
 * @param {{exclude?: Set<string>, mtText?: string, standing?: string[], control?: object}} [opts]
 */
export function computeSubset(approved, text, opts = {}) {
  const exclude = opts.exclude || new Set();
  const control = opts.control || { kind: 'none', note: '' };
  const standing = new Set((opts.standing || []).map((t) => t.toLowerCase()));
  // Strip marker vocabulary from BOTH sides — [[BR]] was inflating `Br`.
  const en = stripMarkerVocabulary(text);
  const mt = stripMarkerVocabulary(opts.mtText || '');

  const measured = [];
  for (const t of approved) {
    const w = (t.english || '').trim();
    if (!w) continue;
    const wb = countWordBoundary(en, w);
    if (wb < MIN_OCCURRENCES) continue;
    measured.push({
      term: w,
      icelandic: t.icelandic,
      domain: t.domain || null,
      alternatives: Array.isArray(t.alternatives) ? t.alternatives : [],
      wb,
      wbSingular: countWordBoundary(en, w, { plural: false }),
      sub: countSubstring(en, w),
    });
  }

  const excluded = [];
  const flags = [];
  const byTerm = new Map(measured.map((m) => [m.term.toLowerCase(), m]));

  // ── Rule 2 (shadowing) runs over MEASURED, not over the survivors ──────────
  // 🔴 Scanning `keep` meant a longer term that rule 3 had already removed could
  // never shadow the shorter one inside it. Measured: ch17's `fuel` survived
  // although `fuel cell` (21 of its 26 hits) was excluded at 90% already-handled;
  // ch21's `positive` survived although 17 of its 21 hits sit inside
  // `positive sign` / `positive charge`, both excluded.
  // ⚠️ AND CONTAINMENT IS TOKEN-WISE, NOT SUBSTRING. A bare substring test made
  // `galvanic cell` shadow `Al` (g-AL-vanic) and `salt bridge` shadow `Br`
  // (BRidge). Those outcomes were right by accident; the bug would one day drop a
  // term that matters.
  const tokens = (t) => t.toLowerCase().split(/\s+/);
  const shadowed = new Set();
  for (const long of [...measured].sort((a, b) => b.term.length - a.term.length)) {
    for (const short of measured) {
      if (short === long || shadowed.has(short.term)) continue;
      if (short.term.length >= long.term.length) continue;
      if (!tokens(long.term).includes(short.term.toLowerCase())) continue;
      if (long.wb / short.wb >= SHADOW_COVERAGE) {
        shadowed.add(short.term);
        excluded.push({
          term: short.term,
          why: 'shadowed',
          detail: `"${long.term}" (${long.wb}x) covers ${((long.wb / short.wb) * 100).toFixed(0)}% of its ${short.wb} hits`,
        });
      }
    }
  }

  const keep = [];
  for (const m of measured) {
    if (shadowed.has(m.term)) continue;
    if (exclude.has(m.term.toLowerCase())) {
      excluded.push({ term: m.term, why: 'ruled-out', detail: 'named in --exclude' });
      continue;
    }

    // ── Rule 3 — §C73: does the model already produce this, dominantly? ──────
    // 🔴 AN IDENTITY MAP IS EXEMPT, AND THE REASON IS THAT ITS EVIDENCE IS
    // CIRCULAR. `Lewis -> Lewis` scores ~100% coverage by construction: the
    // English word appears verbatim in the Icelandic whatever the model did, so
    // its presence is not evidence the model CHOSE it. §C164 measured *Lewis
    // structure* splitting into Lewis-bygging 72 / Lewis-formúla 67 /
    // Lewis-mynd 42 / Lewis-formgerð 14 in ch07, which forced a paid re-buy.
    // ⚠️ And an identity row cannot corrupt anything, so the two-directions
    // asymmetry does not bite — including it is free.
    if (
      String(m.icelandic || '')
        .trim()
        .toLowerCase() === m.term.toLowerCase()
    ) {
      flags.push({
        term: m.term,
        flag: 'identity-map',
        detail: `"${m.icelandic}" is the English word — rule 3 cannot judge it, and the row cannot corrupt; kept`,
      });
      keep.push(m);
      continue;
    }

    // 🔴 A LISTED ALTERNATIVE THAT OUTSCORES THE APPROVED FORM IS A COMPETING
    // RENDERING, AND COVERAGE CANNOT SEE IT. Rule 3 asks "does the approved form
    // appear enough?" — it never asks "is something else winning?". Measured:
    // ch21's `laser -> ljósleysir` (0 hits in the book) against the alternative
    // `leysir`, which is what the model writes.
    const alts = Array.isArray(m.alternatives) ? m.alternatives : [];
    if (mt && alts.length) {
      const stemHits = (x) => {
        const st = icelandicStem(x);
        return st.length >= STEM_FLOOR ? (mt.match(stemPattern(st)) || []).length : 0;
      };
      const mine = stemHits(m.icelandic);
      const rival = Math.max(0, ...alts.map(stemHits));
      if (rival > mine) {
        flags.push({
          term: m.term,
          flag: 'competing-form',
          detail: `a listed alternative outscores the approved form in the MT (${rival} vs ${mine}) — kept for review`,
        });
        keep.push(m);
        continue;
      }
    }

    const stem = icelandicStem(m.icelandic);
    if (mt && stem.length >= STEM_FLOOR) {
      const hits = (mt.match(stemPattern(stem)) || []).length;
      const coverage = hits / m.wb;
      if (coverage > STEM_NOISE_CEILING) {
        // The stem is matching noise, not the term. Keeping is the cheap error.
        flags.push({
          term: m.term,
          flag: 'stem-noise',
          detail: `stem "${stem}" hits ${hits}x for ${m.wb} occurrences (${(coverage * 100).toFixed(0)}%) — control UNRELIABLE, kept`,
        });
      } else if (coverage >= ALREADY_HANDLED_COVERAGE) {
        excluded.push({
          term: m.term,
          why: 'already-handled',
          detail:
            `MT uses "${m.icelandic}" for ${(coverage * 100).toFixed(0)}% of its ${m.wb} occurrences` +
            (control.kind === 'full-glossary'
              ? ' ⚠️ FULL-GLOSSARY control — may be glossary-induced'
              : ''),
        });
        continue;
      }
    } else if (mt) {
      flags.push({
        term: m.term,
        flag: 'control-unavailable',
        detail: `Icelandic "${m.icelandic}" gives no stem of ${STEM_FLOOR}+ chars — rule 3 could not run`,
      });
    }

    // ── Rule 1 — substring collision. Multiword terms are immune. ────────────
    const multiword = /\s/.test(m.term);
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

    // ⚠️ The optional plural folds a noun into an adjective's count. ch16's
    // `thermodynamic` scored 42 = 24 adjective + 18 `thermodynamics`, and the
    // noun was separately excluded as already-handled. Report, do not merge.
    if (m.wbSingular !== m.wb && byTerm.has(`${m.term.toLowerCase()}s`)) {
      flags.push({
        term: m.term,
        flag: 'plural-fold',
        detail: `${m.wb} hits = ${m.wbSingular} bare + ${m.wb - m.wbSingular} plural, and a sibling headword "${m.term}s" exists`,
      });
    }
    keep.push(m);
  }

  // ── Standing terms are unioned in LAST, so no rule can remove them ─────────
  const have = new Set(keep.map((k) => k.term.toLowerCase()));
  const added = [];
  for (const t of approved) {
    const w = (t.english || '').trim();
    if (!standing.has(w.toLowerCase()) || have.has(w.toLowerCase())) continue;
    keep.push({
      term: w,
      icelandic: t.icelandic,
      domain: t.domain || null,
      wb: countWordBoundary(en, w),
      sub: 0,
      standing: true,
    });
    added.push(w);
  }

  return {
    subset: keep.sort((a, b) => b.wb - a.wb),
    excluded,
    flags,
    standingAdded: added,
    control,
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

  // ── Read EN and IS as SEGMENT MAPS, so coverage is computed over ALIGNED pairs ──
  // 🔴 COUNTING ENGLISH THE MT NEVER TRANSLATED MAKES RULE 3 INCLUDE ON AN ABSENCE.
  // Measured: ch17's MT contains ZERO of its 20 figure-alt segments, so 17 of 29
  // candidates were alt-only — superscript 59/59, beaker 50/50, region 31/31. ch20
  // has 134 untranslated alt segments = 50.3% of the chapter's English characters.
  // The old "no MT at all" warning could not see any of it.
  const parseSegs = (p) => {
    const t = fs.readFileSync(p, 'utf8');
    const out = new Map();
    const re = /<!--\s*SEG:([^\s]+?)\s*-->/g;
    let m,
      last = null,
      lastIdx = 0;
    while ((m = re.exec(t))) {
      if (last !== null) out.set(last, t.slice(lastIdx, m.index));
      last = m[1];
      lastIdx = re.lastIndex;
    }
    if (last !== null) out.set(last, t.slice(lastIdx));
    return out;
  };
  const enSegs = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.en.md')) for (const [k, v] of parseSegs(path.join(dir, f))) enSegs.set(k, v);
  }
  const mtDir = path.join('books', book, '02-mt-output', chd);
  const isSegs = new Map();
  const provenances = [];
  if (fs.existsSync(mtDir)) {
    for (const f of fs.readdirSync(mtDir)) {
      if (f.endsWith('.is.md'))
        for (const [k, v] of parseSegs(path.join(mtDir, f))) isSegs.set(k, v);
      else if (f.endsWith('-provenance.json')) {
        try {
          provenances.push(JSON.parse(fs.readFileSync(path.join(mtDir, f), 'utf8')));
        } catch {
          /* ignore */
        }
      }
    }
  }
  // Only the aligned half is evidence, on BOTH sides.
  let alignedEn = '',
    alignedIs = '';
  for (const [k, v] of enSegs) {
    if (!isSegs.has(k)) continue;
    alignedEn += v + '\n';
    alignedIs += isSegs.get(k) + '\n';
  }
  const alignedShare = enSegs.size
    ? [...enSegs.keys()].filter((k) => isSegs.has(k)).length / enSegs.size
    : 0;

  const control = controlQuality(provenances);
  const g = JSON.parse(
    fs.readFileSync(path.join('books', book, 'glossary', 'glossary-unified.json'), 'utf8')
  );
  const approved = (g.terms || []).filter((t) => t.status === 'approved');
  const exclude = new Set(
    (get('--exclude') || '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  );

  const res = computeSubset(approved, alignedEn || [...enSegs.values()].join('\n'), {
    exclude,
    mtText: alignedIs,
    standing: STANDING_TERMS[book] || [],
    control,
  });

  if (args.includes('--json')) {
    console.log(JSON.stringify({ chapter: chd, alignedShare, ...res }, null, 2));
    return;
  }
  console.log(res.subset.map((x) => x.term).join(','));
  if (!args.includes('--explain')) return;

  // ── --explain carries what an auditor needs and the first cut withheld ─────
  // The `domain` tag (nearly every wrong-sense homograph the audit caught carries
  // a NON-chemistry domain: case=biology, box=physics, backbone=biology) and the
  // corpus-wide hit count of the approved Icelandic — a kept term whose target
  // form is absent from 4M characters of the book's own output is the strongest
  // single signal available, and it is free.
  let corpus = '';
  const mtRoot = path.join('books', book, '02-mt-output');
  if (fs.existsSync(mtRoot)) {
    for (const c of fs.readdirSync(mtRoot)) {
      const d = path.join(mtRoot, c);
      if (!fs.statSync(d).isDirectory()) continue;
      for (const f of fs.readdirSync(d))
        if (f.endsWith('.is.md')) corpus += fs.readFileSync(path.join(d, f), 'utf8');
    }
  }
  const corpusHits = (is) => {
    const st = icelandicStem(is);
    return st.length >= STEM_FLOOR ? (corpus.match(stemPattern(st)) || []).length : null;
  };
  const e = console.error;
  e(`\n# ${chd}: ${res.subset.length} terms from ${approved.length} approved`);
  e(`# control: ${control.kind} — ${control.note}`);
  e(
    `# aligned EN<->IS segments: ${(alignedShare * 100).toFixed(0)}% ${alignedShare < 0.9 ? '⚠️ LOW — untranslated segments are NOT evidence' : ''}`
  );
  if (res.standingAdded.length)
    e(`# standing arm re-added (ruled): ${res.standingAdded.join(', ')}`);
  e('');
  for (const x of res.subset) {
    const ch = corpusHits(x.icelandic);
    const warn = ch === 0 ? '  🔴 approved form appears 0x in the whole book' : '';
    e(
      `  + ${String(x.wb).padStart(4)}x  ${x.term}  ->  ${x.icelandic}  [${x.domain || 'no-domain'}]  corpus:${ch ?? 'n/a'}${warn}`
    );
  }
  if (res.flags.length) {
    e(`\n# flags (kept, but look): ${res.flags.length}`);
    for (const f of res.flags) e(`  ! ${f.term}  [${f.flag}]  ${f.detail}`);
  }
  e(`\n# excluded: ${res.excluded.length}`);
  for (const x of res.excluded) e(`  - ${x.term}  [${x.why}]  ${x.detail}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
