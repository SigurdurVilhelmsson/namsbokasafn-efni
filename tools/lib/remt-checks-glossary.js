/**
 * remt-checks-glossary.js — Tier 0 of the §C82 battery: G1-G5.
 *
 * Tier 0 is PER BOOK, ONCE, BEFORE THE FIRST ISK. It is free, and it is the only tier whose
 * findings are UNAFFORDABLE to defer: §C78 — propagation is segment-keyed, not term-keyed, so
 * a bad glossary entry that reaches output CANNOT be flipped back across a book. Caught here
 * it costs one DB edit; caught after the run it costs a re-MT.
 *
 * ── THE ONE DECISION THAT SHAPES EVERY GATE HERE: MEASURE THE WIRE, NOT THE FILE ──
 *
 * 🔴 `formatGlossary` (`tools/lib/malstadur-api.js:204`) IS NOT A FORMATTER; IT IS A FILTER
 * WITH TEETH, so the file and what the MT actually receives are DIFFERENT POPULATIONS.
 * It drops entries with an empty side, and it OMITS both candidates of any contested headword
 * (§C18: sending `atom→frumeind` AND `atom→atóm` in one request is a contradiction the API
 * resolves however it likes) and any comma-list value. Measured on today's chemistry glossary:
 * **2,021 file terms → 2,017 on the wire.** A gate reading the file therefore judges entries
 * the MT will never see, and — the direction that matters — can MISS nothing while the wire
 * carries a defect. ▶ G2 and G3 run their predicate over `formatGlossary(...).terms`.
 *
 * ⚠️ AND THE TWO PROTECTIONS ARE INDEPENDENT (CLAUDE.md): `formatGlossary` (MT) omits
 * contested headwords; `buildGlossaryMap` (render) applies NO omission at all and is
 * last-write-wins. **A clean wire says nothing about what readers see.** These gates are
 * MT-side only, and that is stated here so nobody reads a green Tier 0 as a render guarantee.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { defineCheck, registerChecks, VERDICT } from './remt-battery.js';
import { findGlossaryCollisions } from './glossary-collisions.js';
import { formatGlossary } from './malstadur-api.js';

/**
 * The terms array out of a parsed `glossary-unified.json`, or `null` if the shape is unusable.
 *
 * ⚠️ RETURNS `null` RATHER THAN `[]` FOR AN UNUSABLE SHAPE, and the distinction is the whole
 * point: `[]` would flow into `formatGlossary`, produce a clean empty wire, and read as a
 * glossary with no defects. A blocking gate must tell "nothing wrong" from "nothing read".
 * Both committed shapes are accepted (a bare array, and `{terms: […]}`) because both exist
 * across the three producers.
 */
export function glossaryTerms(glossary) {
  if (Array.isArray(glossary)) return glossary;
  if (glossary && typeof glossary === 'object' && Array.isArray(glossary.terms)) {
    return glossary.terms;
  }
  return null;
}

/** The entries the MT would actually receive, or `null` if the glossary is unusable. */
export function wireTerms(glossary) {
  const terms = glossaryTerms(glossary);
  if (terms === null) return null;
  return formatGlossary(terms, { approvedOnly: true }).terms;
}

/** The shared "this ctx cannot be judged" classification, so every gate names the cause. */
function skipUnusable(id, glossary) {
  const terms = glossaryTerms(glossary);
  if (terms === null) {
    return {
      verdict: VERDICT.SKIPPED,
      examined: 0,
      findings: [],
      message: `${id}: ctx.glossary is not a terms array or {terms: []} — nothing to judge`,
    };
  }
  return null;
}

/**
 * G1 — no contested headword and no comma-list value in the glossary.
 *
 * ⚠️ ITS BLIND SPOT IS IN ITS `message` BY DESIGN, NOT ONLY IN THIS COMMENT. `findGlossaryCollisions`
 * detects COMPETITIONS — one English headword with two Icelandic values. **A single-valued
 * WRONG entry is not a competition, so G1 is provably blind to the entire §C73/§C77 class**
 * (`magnesium→magnesín` is uncontested and wrong; `is→lófalægur` is uncontested and a
 * homograph). G2 and G3 exist because of that blindness, and a reader of G1's output must not
 * take a PASS as "the glossary is sound".
 */
export const G1 = defineCheck({
  id: 'G1',
  tier: 0,
  blocking: true,
  version: 1,
  run: (ctx) => {
    const skip = skipUnusable('G1', ctx?.glossary);
    if (skip) return skip;
    const terms = glossaryTerms(ctx.glossary);
    const { competitions, commaLists } = findGlossaryCollisions(terms, { approvedOnly: true });
    const findings = [
      ...competitions.map((c) => ({ kind: 'glossary-competition', ...c })),
      ...commaLists.map((c) => ({ kind: 'glossary-comma-list', ...c })),
    ];
    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: terms.length,
      findings,
      message:
        `${terms.length} terms; ${competitions.length} competitions, ${commaLists.length} comma lists. ` +
        `BLIND to a single-valued WRONG entry (§C73/§C77) — a PASS here is not "the glossary is sound"`,
    };
  },
});

/**
 * The §C73 element-suffix rule: an English `-ium` element name must resolve to Icelandic
 * `-íum`, never to `-ín`/`-in`.
 *
 * 🔴 THERE IS DELIBERATELY NO `-íum` EXCLUSION, AND AN EARLIER DRAFT HAD ONE THAT WAS DEAD
 * CODE. It read `!/íum$/i.test(target)` beside a comment claiming "the exclusion is not
 * redundant with the match". It is: `IN_ENDING` requires the last character to be `n`, and
 * `íum` ends in `m`, so **no string can match both** and the branch could never fire. Mutation
 * testing caught it — deleting the exclusion left every test green — and a guard that reads as
 * protection while being unreachable is worse than no guard, because nobody re-opens a line
 * that looks handled. ▶ The CORRECT form passing is asserted by a test instead of by a branch.
 *
 * ⚠️ `[ií]` COVERS BOTH SPELLINGS ON PURPOSE, and that breadth is a planted control rather
 * than a corpus one: all 44 real §C73 entries use the accented `-ín`, so narrowing this to
 * `/ín$/` also left the suite green until a `-in` fixture was added.
 */
const IUM_HEADWORD = /ium$/i;
const IN_ENDING = /[ií]n$/i;

/**
 * G2 — no `-ium` headword resolves to a `-ín`/`-in` ending.
 *
 * ✅ FIXTURE VERIFIED 2026-08-25, through the real `formatGlossary` wire body: chemistry at
 * `120352b0` → **44** findings, at `b665c43d` → **0**. Those are the plan's own numbers,
 * reproduced exactly. ⚠️ Both are GIT-BLOB pins, not working-tree pins, so unlike a
 * `02-for-mt` fixture they do NOT move at the re-extract — the only thing that invalidates
 * them is history being rewritten.
 *
 * 🔴 WHY THIS CLASS IS INVISIBLE TO EVERY OTHER GATE: the entries are well-formed, `approved`
 * and UNCONTESTED, so G1's collision sweep, the producer gate and the shrink guard all
 * correctly see nothing. Only domain knowledge finds it — which is what this gate encodes.
 * And a wrong entry is worse than no entry: measured, Málstaður renders `magnesium→magnesíum`
 * correctly with NO glossary, and obeys `magnesium→magnesín` when we supply it, propagating
 * the wrong stem into every compound.
 */
export const G2 = defineCheck({
  id: 'G2',
  tier: 0,
  blocking: true,
  version: 1,
  run: (ctx) => {
    const skip = skipUnusable('G2', ctx?.glossary);
    if (skip) return skip;
    const wire = wireTerms(ctx.glossary);
    const findings = wire
      .filter((t) => IUM_HEADWORD.test(t.sourceWord) && IN_ENDING.test(t.targetWord))
      .map((t) => ({ kind: 'element-suffix', english: t.sourceWord, icelandic: t.targetWord }));
    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: wire.length,
      findings,
      message: `${wire.length} wire terms; ${findings.length} -ium headwords resolving to -ín/-in`,
    };
  },
});

/**
 * Closed-class English function words, BY GRAMMATICAL CATEGORY.
 *
 * 🔴 DERIVED, NOT COPIED — and the plan makes that a requirement rather than a preference:
 * "do NOT hand-copy §C77's table, or the check is fitted to the instances it was built from
 * and finds no future homograph." So this list is the closed classes of English — determiners,
 * pronouns, auxiliaries, prepositions, conjunctions, quantifiers — which is what an English
 * frequency list's head IS. §C77's four instances (`is`, `no`, `in`, `at`) are used in the
 * TEST as a validation that the derivation covers them; they were not the source.
 *
 * ⚠️ A MIN-LENGTH RULE MUST NOT FIRE ON ITS OWN, MEASURED. 118 chemistry and 57 organic
 * headwords are ≤3 characters and are almost all legitimate element symbols and unit
 * abbreviations — `Ag→silfur`, `Fe→járn`, `Hz→herts`, `ATP→adenosínþrífosfat`. Length alone
 * would halt both books on a blocking gate for content that is entirely correct.
 * ▶ So membership of the closed-class set is the ONLY predicate, and the match is
 * case-insensitive because `filterGlossaryForText` is: that is precisely why `At→astat` and
 * `As→arsen` are homographs of "at" and "as" rather than harmless capitalised symbols.
 */
export const FUNCTION_WORDS = Object.freeze(
  new Set(
    (
      'a an the this that these those ' +
      'i me my mine we us our ours you your yours he him his she her hers it its they them their theirs ' +
      'am is are was were be been being do does did doing have has had having ' +
      'will would shall should can could may might must ' +
      'in on at by for to of off up out over under with within without from into onto upon ' +
      'about above below between through during before after against among across behind beyond ' +
      'and or but nor so yet if then than as because while when where which who whom whose what why how ' +
      'no not none all any both each either few many more most much neither other others some such ' +
      'only own same very just also too there here now again once ever never'
    ).split(/\s+/)
  )
);

/**
 * G3 — no glossary headword is a common English function word.
 *
 * 🔴 THIS IS THE §C77 CLASS, AND IT IS LIVE IN BOTH KEPT BOOKS TODAY. `filterGlossaryForText`
 * is a case-insensitive SUBSTRING test, so a two-letter headword primes the MT on essentially
 * every chunk. MEASURED 2026-08-25 over the real wire body:
 *   `efnafraedi-2e`    5 — AM→víddarmótun · As→arsen · in→tomma · is→lófalægur · no→blóð-
 *   `lifraen-efnafraedi` 5 — As→arsen · OR→gagnlíkindahlutfall · in→tomma · is→lófalægur · no→blóð-
 * Three of §C77's four named instances are still reaching the wire. ▶ So G3 has a NATURAL
 * known-bad fixture, which is what lets it be blocking under the spec's own rule — and Tier 0
 * is exactly where this is meant to be caught, at the cost of a DB edit rather than a re-MT.
 */
export const G3 = defineCheck({
  id: 'G3',
  tier: 0,
  blocking: true,
  version: 1,
  run: (ctx) => {
    const skip = skipUnusable('G3', ctx?.glossary);
    if (skip) return skip;
    const wire = wireTerms(ctx.glossary);
    const findings = wire
      .filter((t) => FUNCTION_WORDS.has(String(t.sourceWord).trim().toLowerCase()))
      .map((t) => ({
        kind: 'function-word-headword',
        english: t.sourceWord,
        icelandic: t.targetWord,
      }));
    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: wire.length,
      findings,
      message:
        `${wire.length} wire terms; ${findings.length} headwords that are common English function words ` +
        `(matched case-insensitively, because filterGlossaryForText is a case-insensitive substring test)`,
    };
  },
});

/**
 * G4 — ADVISORY. One English headword must not resolve differently across books.
 *
 * ⚠️ ADVISORY IS A RULING, NOT A HEDGE, AND ITS BLIND SPOT IS THE REASON: G4 catches only
 * DISAGREEMENT, so it is structurally blind to anything UNIFORMLY wrong. Of §C73's 44 entries
 * it would have caught **3**. A gate that finds 3 of 44 must not be able to halt a paid run,
 * and it must not be read as cover for the other 41 — G2 is what covers those.
 *
 * ⚠️ Its ctx is `glossariesByBook`, not `glossary`: it is the one Tier-0 gate whose subject is
 * a RELATION between books rather than a property of one, so a single-book ctx examines
 * nothing and reads SKIPPED rather than reporting agreement it never tested.
 */
export const G4 = defineCheck({
  id: 'G4',
  tier: 0,
  blocking: false,
  version: 1,
  run: (ctx) => {
    const byBook = ctx?.glossariesByBook;
    const books = byBook && typeof byBook === 'object' ? Object.keys(byBook) : [];
    if (books.length < 2) {
      return {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message: `G4: needs ctx.glossariesByBook with at least 2 books, got ${books.length}`,
      };
    }
    /** @type {Map<string, Map<string, string[]>>} english -> icelandic -> books */
    const seen = new Map();
    for (const book of books) {
      const wire = wireTerms(byBook[book]);
      if (wire === null) continue;
      for (const t of wire) {
        const en = String(t.sourceWord).trim().toLowerCase();
        if (!seen.has(en)) seen.set(en, new Map());
        const vals = seen.get(en);
        const is = String(t.targetWord).trim();
        if (!vals.has(is)) vals.set(is, []);
        vals.get(is).push(book);
      }
    }
    const findings = [];
    for (const [en, vals] of seen) {
      if (vals.size > 1) {
        findings.push({
          kind: 'cross-book-disagreement',
          english: en,
          values: [...vals].map(([icelandic, inBooks]) => ({ icelandic, books: inBooks })),
        });
      }
    }
    return {
      verdict: findings.length ? VERDICT.WARN : VERDICT.PASS,
      examined: seen.size,
      findings,
      message:
        `${seen.size} distinct headwords across ${books.length} books; ${findings.length} disagree. ` +
        `BLIND to anything uniformly wrong — would have caught 3 of §C73's 44`,
    };
  },
});

/**
 * G5 — the committed payload is a usable glossary object with a recognised producer.
 *
 * 🔴 THE GATE IS PURE AND THE SPAWN IS THE LOADER'S, WHICH IS A DELIBERATE DEVIATION FROM THE
 * PLAN'S "SPAWN IT" AND KEEPS BOTH RULES INTACT. Global Constraint 5 says gates do no I/O; the
 * licence constraint says G5 must not IMPORT `server/`. Both hold if the gate takes VALUES and
 * `spawnGlossaryPayloadCheck` below — a loader helper, not a check — runs the AGPL CLI in a
 * separate process. A gate that spawns could not be unit-tested without a repo, which is the
 * same argument that settled E9's leg 5.
 *
 * 🔴 IT DOES ITS OWN absent/corrupt/ok CLASSIFICATION, BECAUSE THE SERVER'S IS UNREACHABLE.
 * `readExisting` is module-local at `server/scripts/export-terminology.js:234` and that file
 * exports only `{listBooks, runGlossaryExport, parseArgs}` — verified, not assumed. The
 * classification is duplicated in `server/scripts/check-glossary-payload.js`
 * (`classifyPayloadText`) and here, deliberately: one is reachable from AGPL code, the other
 * from MIT code, and an import in either direction is what we are avoiding.
 *
 * 🔴 THE SHRINK HALF IS DELIBERATELY NOT IMPLEMENTED, AND SAYS SO IN ITS OWN `message`.
 * `shrinkVerdict(prev, next)` is a prev-vs-next comparison performed at EXPORT time; a Tier 0
 * pre-run check holds ONE payload, so "not shrunk >50%" has no `next`. The plan offers two
 * resolutions and this takes (b) — record that halving is an export-time gate, not a battery
 * check. ▶ Emitting PASS for a comparison that never happened would be §C60 with extra steps,
 * which is the one thing this battery exists to prevent.
 */
export const G5 = defineCheck({
  id: 'G5',
  tier: 0,
  blocking: true,
  version: 1,
  run: (ctx) => {
    const text = ctx?.payloadText;
    if (typeof text !== 'string') {
      return {
        verdict: VERDICT.SKIPPED,
        examined: 0,
        findings: [],
        message: 'G5: ctx.payloadText must be the raw committed bytes as a string',
      };
    }
    const findings = [];
    let payload = null;
    if (text.trim() === '') {
      findings.push({ kind: 'payload', reason: 'empty file' });
    } else {
      try {
        payload = JSON.parse(text);
      } catch (err) {
        findings.push({ kind: 'payload', reason: `unparseable: ${err.message}` });
      }
      if (findings.length === 0) {
        // 🔴 THE §C21 TYPE COLLISION. Four bytes of `null` PARSE, so a `kind !== 'absent'` test
        // stood down while `null` is the exact sentinel `producerVerdict` uses for "no previous
        // producer" — all three gates stood down and the unattended cron WROTE. Only `null`
        // slipped; `[]`, numbers and strings parse non-null and refuse.
        if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
          findings.push({
            kind: 'payload',
            reason: `payload is ${payload === null ? 'null' : Array.isArray(payload) ? 'an array' : typeof payload}, not an object`,
          });
        }
      }
    }
    // The producer verdict, when the loader spawned the AGPL CLI for it. Its ABSENCE is not a
    // finding — it is a leg not run — but an 'unknown' producer is.
    const v = ctx?.payloadVerdict;
    let producerNote = 'producer not checked (no spawned verdict supplied)';
    if (v && typeof v === 'object') {
      producerNote = `producer ${v.producer}`;
      if (v.producer === 'unknown') {
        findings.push({ kind: 'payload', reason: 'producer is unrecognised' });
      }
    }
    return {
      verdict: findings.length ? VERDICT.FAIL : VERDICT.PASS,
      examined: 1,
      findings,
      message:
        `${text.length} bytes; ${producerNote}. ` +
        `The >50% SHRINK guard is NOT evaluated here — it is a prev-vs-next comparison and belongs to export time`,
    };
  },
});

/**
 * Loader helper — run the AGPL producer CLI in a separate process and return its parsed JSON.
 * NOT a gate: it does I/O, and it exists so `G5` does not have to.
 *
 * ⚠️ THE EXIT CODE IS IGNORED ON PURPOSE — that is the spawn model at
 * `server/services/publicationService.js:124-184`, and Global Constraint 3 ("never infer a pass
 * from exit code 0"). The verdict is stdout. A parse failure REJECTS with stderr attached
 * rather than reading as a pass, and `cwd` is pinned to the repo root because a wrong cwd is
 * exactly the blind spot that prints `Total findings: 0` having read zero files.
 */
export function spawnGlossaryPayloadCheck(filePath, { repoRoot } = {}) {
  const root = repoRoot || path.resolve(import.meta.dirname, '..', '..');
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(root, 'server', 'scripts', 'check-glossary-payload.js'),
        '--file',
        filePath,
        '--json',
      ],
      { cwd: root }
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', () => {
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(
          new Error(`check-glossary-payload produced no parseable JSON. stderr: ${err.trim()}`)
        );
      }
    });
  });
}

export const GLOSSARY_CHECKS = [G1, G2, G3, G4, G5];

// Registration happens at import time; only the CLI imports this module. Same rule, and the
// same reason, as the Tier-1 module: nothing else puts a check in the REGISTRY (§C82 L3).
registerChecks(GLOSSARY_CHECKS);
