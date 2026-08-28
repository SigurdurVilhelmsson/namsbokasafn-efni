/**
 * §C82 Plan C — Task N3: the Tier-1 PARTIAL-STATE sweep.
 *
 * QUESTION: does any BLOCKING Tier-0/Tier-1 check return a non-SKIPPED verdict over a ctx key
 * it cannot actually have judged — a silent pass on the pre-spend gate for a ~51,000 ISK run?
 *
 * ── WHY THE OBVIOUS PROBE IS WORTHLESS ──────────────────────────────────────────────────────
 * `test-results/c82-ctx-state-probe-2026-08-27.mjs` supplied ONLY scope keys to all 13
 * Tier-0/1 checks and got `SKIPPED, examined=0` from every one. That measurement is correct
 * and it licenses a false generalisation ("the pre-spend half fails uniformly loud"), because
 * every key was absent TOGETHER. A loader does not produce the all-empty state; it produces
 * PARTIAL states. Vary ONE key against an otherwise fully-populated ctx and G5 PASSes over
 * `{}`, `[]`, `{error}` and `{kind:'ok'}` while correctly FAILing on `null` and absent.
 *
 * ── THE INSTRUMENT, AND THE HOLE IT CLOSES ──────────────────────────────────────────────────
 * 🔴 VERDICT EQUALITY CANNOT TELL "IGNORES THE KEY" FROM "SILENTLY PASSED OVER DAMAGE".
 * G5 over a damaged `payloadVerdict` returns PASS — the same verdict a check that never reads
 * the key returns. So the matrix alone cannot classify its own arms, and a sweep that reported
 * every non-SKIPPED arm would drown 13 real signals in ~1,500 arms of noise.
 * ▶ So every ctx is wrapped in a PROXY that records which keys the check actually touched.
 * The dependency set is then DERIVED BY EXECUTION, never enumerated — the same discipline
 * `probeJudgeableSubset` uses, and for the same reason: an enumeration of what a check reads
 * is exactly what [LEAD] ruled against, and it cannot be derived mechanically anyway (E9 reads
 * all five of its keys through `const c = ctx || {}`).
 * ⚠️ `get` IS NOT THE ONLY READ. `has`, `ownKeys` and `getOwnPropertyDescriptor` are trapped
 * too: a spread or a `Object.keys` inside a helper would touch every key at once and make the
 * dependency set read as "reads everything". No check does that today — the arms record
 * `bulk: true` when one fires, so a future one narrows nothing rather than lying.
 *
 * ── THE BUCKETS ─────────────────────────────────────────────────────────────────────────────
 * A vacuous pass is NOT a silent pass, and `examined` is what separates them:
 *   CANDIDATE  blocking · reads the key · PASS · examined > 0 · examined UNCHANGED from the
 *              well-formed baseline — the check counted the same things while the input it
 *              counted them from was replaced.
 *   SUSPICIOUS blocking · reads the key · PASS · examined CHANGED — it noticed something and
 *              passed anyway. Reported separately, never merged into the above.
 *   NOT A FINDING  verdict FAIL or SKIPPED (loud either way), or the check never touched
 *              the key (the arm is inert, not clean).
 *
 * 🔴 A TYPE-PRESERVING EMPTY IS NOT DAMAGE, AND CONFLATING THE TWO MANUFACTURES FINDINGS.
 * `[]` supplied for a key whose real value IS an array is the legitimate "none" state, not a
 * shapeless one — E9's own source says so of `handEdits` in as many words ("`handEdits: []`
 * is legitimately the GOOD state and must keep counting"), and `handEditCommits` THROWS on a
 * git failure precisely so `[]` can never arrive from an error. So each candidate is tagged
 * `shapePreserved` — `shapeOf(state) === shapeOf(the real loader value)` — derived from the
 * PRODUCER's own value rather than from an assumption about the key.
 * ⚠️ THE TAG NARROWS; IT DOES NOT ADJUDICATE. `payloadVerdict: {}` is shape-preserving and is
 * still a genuine silent pass, because an object with no `producer` means G5's producer leg
 * did not run. Adjudication is a human reading the check's source, and it lives in the .md.
 *
 * ── THE POSITIVE CONTROL IS ARM 0 OF THE ORDINARY MATRIX ────────────────────────────────────
 * 🔴 A CLEAN TIER-1 RESULT IS PLAUSIBLE HERE — E1/E2/E4/E5 share `skipIfCtxUnusable`, E3 opts
 * out with its reason stated, E6 guards on `Array.isArray`, E9 emits `leg-not-checked` per leg
 * and FAILs on any of them. Which is precisely why a clean sweep is worthless without a
 * control that FIRES: `G5 × payloadVerdict × emptyObject` must come back PASS through the
 * SAME code path as every other arm. It is not special-cased and not appended at the end —
 * it is one row of the matrix, and the harness sets a non-zero exit code and prints
 * HARNESS BROKEN as its first line if that row does not reproduce.
 *
 * ── RUN IT ──────────────────────────────────────────────────────────────────────────────────
 *   node test-results/c82-tier1-partial-state-sweep-2026-08-28.mjs > /tmp/sweep.txt 2>&1; echo "exit=$?"
 *
 * 🔴 REDIRECT WITH `>`; NEVER PIPE. `process.exit()` discards queued stdout on a pipe —
 * measured on this repo's own battery at 150,342 bytes through `>` and exactly 65,536 through
 * `| cat`. This file never calls `process.exit()`; it sets `process.exitCode` and lets the
 * process end naturally, and it opens by setting a FAILURE default so a promise that never
 * settles exits non-zero instead of reporting a clean 0 having reached no verdict.
 *
 * Env: SWEEP_REPS (default 3) — representatives probed per unit kind.
 *      SWEEP_JSON=1 — emit the full arm-level JSON after the human report.
 */

// 🔴 FAILURE DEFAULT. A promise that never settles holds no handle, so Node's event loop
// empties and the process exits 0 having produced nothing. Overwritten only at the very end,
// and only if the positive control fired.
process.exitCode = 2;

const REPO = '/home/siggi/dev/repos/namsbokasafn-efni';

const {
  loadTier0Ctx,
  loadTier1Ctx,
  representativeUnitsFor,
  unitsFor,
  RUN_BOOKS,
  UNIT_KINDS,
} = await import(REPO + '/tools/remt-ctx.js');
// The committed run-state factory, NOT a hand-built one — see its own header. A hand-built
// `{segIds, byId}` snapshot made all five of E7's arms SKIP with one message, an absence
// manufactured by the fixture rather than found in the data.
const { runState } = await import(REPO + '/tools/__tests__/helpers/remt-run-state.js');
// Importing a check module is what registers it. Both tiers, or the REGISTRY is short.
await import(REPO + '/tools/lib/remt-checks-glossary.js');
await import(REPO + '/tools/lib/remt-checks-extract.js');
const { REGISTRY, runCheck, VERDICT } = await import(REPO + '/tools/lib/remt-battery.js');

const REPS = Number(process.env.SWEEP_REPS || 3);

/**
 * The ctx states a loader can actually produce, per the task brief.
 *
 * ⚠️ `absent` IS A SENTINEL, NOT A FACTORY, AND THE DIFFERENCE IS LOAD-BEARING. Setting a key
 * to `undefined` leaves `'key' in ctx === true`; genuine absence is `delete`. E9 classifies
 * per leg and a guard elsewhere may use `in`, so the two states are not interchangeable. The
 * harness asserts `key in damaged === false` for this state on every arm it builds.
 */
const ABSENT = Symbol('absent');
const STATES = {
  absent: () => ABSENT,
  null: () => null,
  emptyObject: () => ({}),
  emptyArray: () => [],
  errorShape: () => ({ error: 'spawn failed' }),
  wrongShape: () => ({ kind: 'ok' }),
  emptyString: () => '',
};

/**
 * Wrap `ctx` so every key the check touches is recorded.
 *
 * @param {object} ctx
 * @returns {{proxy: object, read: Set<string>, bulk: boolean}}
 */
function instrument(ctx) {
  const read = new Set();
  const state = { bulk: false };
  const note = (k) => {
    if (typeof k === 'string') read.add(k);
  };
  const proxy = new Proxy(ctx, {
    get(t, k, r) {
      note(k);
      return Reflect.get(t, k, r);
    },
    has(t, k) {
      note(k);
      return Reflect.has(t, k);
    },
    getOwnPropertyDescriptor(t, k) {
      note(k);
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
    ownKeys(t) {
      // A spread / Object.keys touches everything at once. Recording it as "reads every key"
      // would be a lie in the direction that hides findings; flag it instead.
      state.bulk = true;
      return Reflect.ownKeys(t);
    },
  });
  return { proxy, read, get bulk() { return state.bulk; } };
}

/** One arm: run `check` over `ctx`, recording verdict, examined and the keys it touched. */
async function arm(check, ctx) {
  const inst = instrument(ctx);
  let r;
  try {
    r = await runCheck(check, inst.proxy);
  } catch (err) {
    return { verdict: 'THREW', examined: null, read: inst.read, bulk: inst.bulk, message: String(err?.message || err) };
  }
  return {
    verdict: r.verdict,
    examined: r.examined,
    findings: (r.findings || []).length,
    read: inst.read,
    bulk: inst.bulk,
    message: r.message,
  };
}

/**
 * The merged Tier-0 + Tier-1 ctx for a real unit, built by calling the REAL loader.
 *
 * ⚠️ NEVER HAND-BUILT. A hand-built ctx agrees with the author's assumptions and disagrees
 * with the producer — which is exactly how an earlier task on this branch manufactured an
 * absence and read it as a measurement. `loadTier0Ctx`/`loadTier1Ctx` also assert their own
 * postcondition and throw on cross-wired provenance, so the clean ctx comes from them and the
 * damage is applied to a COPY afterwards.
 */
async function baselineCtxFor(unit, state) {
  const { ctx: t0 } = loadTier0Ctx(unit);
  const { ctx: t1 } = await loadTier1Ctx(unit, state);
  return { ...t0, ...t1 };
}

const label = (u) => `${u.book}/${u.chapter}/${u.module}`;

/** The coarse shape of a value — what "type-preserving" is measured against. */
const shapeOf = (v) =>
  v === ABSENT ? 'absent' : v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;

// ── The population ──────────────────────────────────────────────────────────────────────────
const corpus = RUN_BOOKS.flatMap((b) => unitsFor(b));
const byKind = Object.fromEntries(UNIT_KINDS.map((k) => [k, corpus.filter((u) => u.kind === k).length]));
const representatives = UNIT_KINDS.flatMap((k) => representativeUnitsFor(k, REPS));

const t01 = [...REGISTRY.values()].filter((c) => c.tier === 0 || c.tier === 1);
t01.sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));

const rs = runState();
const started = Date.now();

/**
 * ── COVERAGE RESCUE ─────────────────────────────────────────────────────────────────────────
 * 🔴 A CHECK THAT FAILS AT BASELINE ON EVERY SWEPT UNIT CANNOT EXHIBIT A SILENT PASS, SO A
 * CLEAN RESULT OVER IT IS NOT EVIDENCE — it is an absence the sample manufactured. E5 FAILs
 * on 154 of 166 module units and E9 on 220 of 220, so the three representatives leave both
 * structurally unreachable. This phase walks the corpus for ONE unit per unreachable blocking
 * check where that check PASSes at baseline, and adds it to the swept population.
 * ⚠️ Where no such unit exists (E9 today), the scan says so with its denominator rather than
 * leaving the check looking swept. That statement IS the deliverable for those checks.
 */
const RESCUE_SCAN_CAP = Number(process.env.SWEEP_RESCUE_CAP || 60);
const rescued = [];
const rescueLog = [];
{
  const repLabels = new Set(representatives.map(label));
  const baseVerdicts = new Map();
  for (const u of representatives) {
    const ctx = await baselineCtxFor(u, rs);
    for (const c of t01) baseVerdicts.set(`${label(u)}|${c.id}`, (await arm(c, ctx)).verdict);
  }
  const unreachable = t01.filter(
    (c) => c.blocking && representatives.every((u) => baseVerdicts.get(`${label(u)}|${c.id}`) !== VERDICT.PASS)
  );
  // Spread the scan across the corpus rather than taking the first N — `unitsFor` sorts
  // 'appendices' before 'ch00', so the first N module units are one directory of one book.
  const step = Math.max(1, Math.floor(corpus.length / RESCUE_SCAN_CAP));
  const candidates = corpus.filter((_, i) => i % step === 0 && !repLabels.has(label(corpus[i])));
  for (const c of unreachable) {
    let found = null;
    let scanned = 0;
    for (const u of candidates) {
      scanned++;
      const ctx = await baselineCtxFor(u, rs);
      if ((await arm(c, ctx)).verdict === VERDICT.PASS) { found = u; break; }
    }
    if (found && !rescued.some((u) => label(u) === label(found))) rescued.push(found);
    rescueLog.push({ check: c.id, found: found ? label(found) : null, scanned, pool: candidates.length });
  }
}

const units = [...representatives, ...rescued];
const rows = [];
const baselines = new Map(); // `${unit}|${check}` -> baseline arm

for (const unit of units) {
  const base = await baselineCtxFor(unit, rs);
  const keys = Object.keys(base).sort();

  // Baseline first: a fully-populated ctx, one arm per check. Every varying arm is read
  // RELATIVE to this, so it has to exist before any of them means anything.
  for (const check of t01) {
    const a = await arm(check, base);
    baselines.set(`${label(unit)}|${check.id}`, a);
    rows.push({
      unit: label(unit), kind: unit.kind, check: check.id, tier: check.tier,
      blocking: check.blocking, key: '(baseline)', state: '(well-formed)',
      verdict: a.verdict, examined: a.examined, findings: a.findings,
      readsKey: null, bulk: a.bulk, reads: [...a.read].sort(),
    });
  }

  // Then the cross product: one key varied at a time against that same populated ctx.
  for (const key of keys) {
    for (const [stateName, make] of Object.entries(STATES)) {
      const value = make();
      const damaged = { ...base };
      if (value === ABSENT) {
        delete damaged[key];
        if (key in damaged) throw new Error(`harness: '${key}' survived delete — absent state is not absent`);
      } else {
        damaged[key] = value;
      }
      for (const check of t01) {
        const a = await arm(check, damaged);
        const b = baselines.get(`${label(unit)}|${check.id}`);
        rows.push({
          unit: label(unit), kind: unit.kind, check: check.id, tier: check.tier,
          blocking: check.blocking, key, state: stateName,
          // Measured against the REAL loader's value for this key on this unit, not assumed.
          shapePreserved: shapeOf(value) === shapeOf(base[key]),
          realShape: shapeOf(base[key]),
          verdict: a.verdict, examined: a.examined, findings: a.findings,
          // Read in EITHER the damaged arm or the baseline: a check can stop reading a key
          // precisely because an earlier guard tripped, and that still counts as depending on it.
          readsKey: a.read.has(key) || b.read.has(key),
          bulk: a.bulk,
          baseVerdict: b.verdict, baseExamined: b.examined,
        });
      }
    }
  }
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1);

// ── Classification ──────────────────────────────────────────────────────────────────────────
const varied = rows.filter((r) => r.key !== '(baseline)');
const candidates = varied.filter(
  (r) => r.blocking && r.readsKey && r.verdict === VERDICT.PASS && r.examined > 0 && r.examined === r.baseExamined
);
const suspicious = varied.filter(
  (r) => r.blocking && r.readsKey && r.verdict === VERDICT.PASS && r.examined !== r.baseExamined
);
const advisoryPasses = varied.filter(
  (r) => !r.blocking && r.readsKey && r.verdict === VERDICT.PASS && r.examined > 0
);
const threw = varied.filter((r) => r.verdict === 'THREW');

// ── THE POSITIVE CONTROL — arm 0 of the ordinary matrix, asserted, not merely printed ───────
const control = candidates.find(
  (r) => r.check === 'G5' && r.key === 'payloadVerdict' && r.state === 'emptyObject'
);
const controlFired = !!control && control.verdict === VERDICT.PASS && control.readsKey && control.examined > 0;
if (!controlFired) {
  console.log('HARNESS BROKEN — the positive control did not reproduce.');
  console.log(`  expected: G5 × payloadVerdict × emptyObject -> PASS, readsKey=true, examined>0`);
  console.log(`  got:      ${control ? JSON.stringify({ verdict: control.verdict, examined: control.examined, readsKey: control.readsKey }) : 'ARM NOT PRESENT IN MATRIX'}`);
  console.log('  Every clean Tier-1 result below is therefore worth nothing.\n');
}

// ── Report ──────────────────────────────────────────────────────────────────────────────────
const fmt = (n) => String(n).padStart(5);
console.log('§C82 N3 — Tier-0/Tier-1 partial-state sweep');
console.log(`run 2026-08-28 · ${elapsed}s · node ${process.version}\n`);

console.log('POPULATION (state every denominator)');
console.log(`  books swept          : ${RUN_BOOKS.join(', ')}`);
console.log(`  units in corpus      : ${corpus.length} (${UNIT_KINDS.map((k) => `${byKind[k]} ${k}`).join(' + ')})`);
console.log(`  units SWEPT          : ${units.length} = ${representatives.length} representatives (${REPS}/kind, first/middle/last) + ${rescued.length} rescued`);
console.log(`  checks               : ${t01.length} (${t01.filter((c) => c.blocking).length} blocking)`);
console.log(`  states per key       : ${Object.keys(STATES).length} — ${Object.keys(STATES).join(', ')}`);
console.log(`  arms                 : ${rows.length} total, ${varied.length} varying + ${rows.length - varied.length} baseline\n`);

console.log('POSITIVE CONTROL — G5 × payloadVerdict × emptyObject (arm of the ordinary matrix)');
if (control) {
  console.log(`  verdict=${control.verdict} examined=${control.examined} readsKey=${control.readsKey} baseline=${control.baseVerdict}/${control.baseExamined}`);
  console.log(`  ${controlFired ? 'FIRED — the harness can produce the failure mode it is hunting.' : 'DID NOT FIRE — harness broken.'}`);
} else {
  console.log('  ARM NOT PRESENT — harness broken.');
}
console.log();

console.log('BASELINE VERDICT PER CHECK (well-formed ctx from the real loader)');
console.log('  check  tier block   ' + UNIT_KINDS.map((k) => k.padEnd(30)).join(''));
for (const c of t01) {
  const cells = UNIT_KINDS.map((k) => {
    const us = units.filter((u) => u.kind === k);
    const vs = us.map((u) => {
      const b = baselines.get(`${label(u)}|${c.id}`);
      return `${b.verdict[0]}${b.examined}`;
    });
    return vs.join(" ").padEnd(30);
  });
  console.log(`  ${c.id.padEnd(6)} ${c.tier}    ${(c.blocking ? 'BLK' : 'adv').padEnd(6)}${cells.join('')}`);
}
console.log('  (verdict initial + examined, one per representative. P=PASS F=FAIL S=SKIPPED W=WARN)\n');

console.log('COVERAGE RESCUE — a corpus scan for a PASSing unit per unreachable BLOCKING check');
if (rescueLog.length === 0) {
  console.log('  (none needed — every blocking check PASSes at baseline on some representative)');
} else {
  for (const r of rescueLog) {
    console.log(
      r.found
        ? `  ${r.check.padEnd(4)} rescued by ${r.found} (scanned ${r.scanned} of a ${r.pool}-unit spread)`
        : `  ${r.check.padEnd(4)} NO PASSING UNIT FOUND in ${r.scanned} of a ${r.pool}-unit spread over ${corpus.length} — remains unreachable`
    );
  }
}
console.log();

console.log('WHAT THE SWEEP COULD REACH — a check FAILing at baseline cannot exhibit a silent pass');
for (const c of t01) {
  const bs = units.map((u) => baselines.get(`${label(u)}|${c.id}`));
  const passing = bs.filter((b) => b.verdict === VERDICT.PASS).length;
  const note =
    passing === 0
      ? 'NOT REACHABLE — 0 of the swept units PASS at baseline; every arm is loud by construction, so a clean result over this check is NOT EVIDENCE'
      : `${passing}/${bs.length} swept units PASS at baseline — silent-pass behaviour IS observable`;
  console.log(`  ${c.id.padEnd(4)} ${c.blocking ? 'BLK' : 'adv'}  ${note}`);
}
console.log();

console.log('KEY DEPENDENCY, DERIVED BY EXECUTION (keys each check actually touched)');
for (const c of t01) {
  const keys = new Set();
  let bulk = false;
  for (const u of units) {
    const b = baselines.get(`${label(u)}|${c.id}`);
    for (const k of b.read) keys.add(k);
    if (b.bulk) bulk = true;
  }
  console.log(`  ${c.id.padEnd(4)} ${bulk ? '[BULK READ — narrows nothing] ' : ''}${[...keys].sort().join(', ') || '(none)'}`);
}
console.log();

console.log('KEYS A CHECK READS THAT THE LOADER NEVER SUPPLIES — NOT VARIED BY THIS SWEEP');
{
  const supplied = new Set(rows.filter((r) => r.key !== '(baseline)').map((r) => r.key));
  let any = false;
  for (const c of t01) {
    const missing = new Set();
    for (const u of units) {
      for (const k of baselines.get(`${label(u)}|${c.id}`).read) {
        if (!supplied.has(k) && k !== 'then') missing.add(k);
      }
    }
    if (missing.size) { any = true; console.log(`  ${c.id}: ${[...missing].sort().join(', ')}`); }
  }
  if (!any) console.log('  (none)');
  console.log('  A key the loader never supplies has no well-formed baseline to damage, so no');
  console.log('  arm of this matrix touches it. That is a COVERAGE LIMIT, stated, not a clean result.');
}
console.log();

console.log(`CANDIDATES — blocking · reads the key · PASS over a replaced value · examined unchanged: ${candidates.length}`);
console.log('  (shape=preserved means the state is a well-formed inhabitant of the key\'s real type —');
console.log('   a legitimate "none", not shapeless damage. It NARROWS; adjudication is in the .md.)');
for (const r of candidates) {
  console.log(
    `  ${r.check} × ${r.key} × ${r.state} -> ${r.verdict} examined=${r.examined} ` +
      `(baseline ${r.baseVerdict}/${r.baseExamined}) shape=${r.shapePreserved ? 'preserved' : `VIOLATED (real=${r.realShape})`} on ${r.unit} [${r.kind}]`
  );
}
console.log();

console.log('CANDIDATES GROUPED (check × key × state, across units)');
{
  const seen = new Map();
  for (const r of candidates) {
    const k = `${r.check} × ${r.key} × ${r.state}`;
    const e = seen.get(k) || { n: 0, shape: r.shapePreserved, real: r.realShape };
    e.n++; seen.set(k, e);
  }
  for (const [k, e] of [...seen].sort()) {
    console.log(`  ${k} — ${e.n} unit${e.n > 1 ? 's' : ''}, shape ${e.shape ? 'preserved' : `VIOLATED (real=${e.real})`}`);
  }
}
console.log();

console.log(`SUSPICIOUS — blocking · reads the key · PASS but examined CHANGED: ${suspicious.length}`);
for (const r of suspicious.slice(0, 40)) {
  console.log(`  ${r.check} × ${r.key} × ${r.state} -> PASS examined=${r.examined} (baseline ${r.baseExamined}) on ${r.unit}`);
}
if (suspicious.length > 40) console.log(`  … ${suspicious.length - 40} more`);
console.log();

console.log(`ADVISORY checks passing over damage (NOT blocking — recorded, not findings): ${advisoryPasses.length}`);
{
  const seen = new Map();
  for (const r of advisoryPasses) {
    const k = `${r.check} × ${r.key} × ${r.state}`;
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  for (const [k, n] of [...seen].sort()) console.log(`  ${k} (${n} unit${n > 1 ? 's' : ''})`);
}
console.log();

console.log(`ARMS THAT THREW: ${threw.length}`);
for (const r of threw.slice(0, 20)) console.log(`  ${r.check} × ${r.key} × ${r.state} on ${r.unit}: ${r.message}`);
console.log();

console.log('VERDICT DISTRIBUTION over the varying arms');
{
  const dist = {};
  for (const r of varied) {
    const k = `${r.verdict}${r.readsKey ? ' (reads key)' : ' (key inert)'}`;
    dist[k] = (dist[k] || 0) + 1;
  }
  for (const [k, n] of Object.entries(dist).sort()) console.log(`  ${fmt(n)}  ${k}`);
}
console.log();

if (process.env.SWEEP_JSON) {
  console.log('--- JSON ---');
  console.log(JSON.stringify(rows.map(({ reads, ...r }) => r)));
}

// 🔴 The exit code is a verdict about the HARNESS, not about the corpus. A clean sweep exits 0;
// a sweep whose positive control did not fire exits 1, because its clean result is worthless.
process.exitCode = controlFired ? 0 : 1;
