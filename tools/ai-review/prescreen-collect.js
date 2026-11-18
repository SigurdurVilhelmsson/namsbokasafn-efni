/**
 * prescreen-collect.js — merges recorded pre-screen runs into one verdict per population row and
 * renders the committed verdicts file and report (c19; spec §8). Pure: it works on the records
 * the runner has read (`prescreen.json`, parsed responses, `run-end.json`); no I/O and no import
 * from server/ (the MIT to AGPL boundary).
 *
 * Runs merge by item id, so they must share ONE item set: `assembleItems` numbers ids by position
 * within one run's items, so a pilot's `r005` and a full run's `r005` are different rows. Hence:
 * only `full` and `resend` runs merge; every full run carries the same items (a split run records
 * every item in each part); a resend run's items are full-run items, unchanged. A row is never
 * counted as fine because its answer is missing (spec §2): it is `unjudged`.
 */
import { judgeControls } from './prescreen-response.js';
import { FLAG_KINDS } from './prescreen-request.js';

export const VERDICTS_SCHEMA = 'c19-prescreen-verdicts/1';
export const VERDICTS_FILE = 'prescreen-verdicts.json';
export const REPORT_FILE = 'prescreen-report.md';
/** The item kinds that are population rows (physics and biology only when the run included them). */
export const POPULATION_KINDS = Object.freeze(['population', 'physicsBiology']);
const GROUP = Object.freeze({ population: 'chemistry', physicsBiology: 'physicsBiology' });
const GROUP_LABEL = Object.freeze({
  chemistry: 'chemistry',
  physicsBiology: 'physics and biology',
});
const PHASES = new Set(['full', 'resend']);
/** Fields the concept model holds that no committed file may carry (spec §8). */
const PRIVATE_FIELDS = Object.freeze(['alternatives', 'ifRemoved']);

const isPopulation = (kind) => POPULATION_KINDS.includes(kind);
/** What identifies an item: its pair, its role and what the model saw. */
export const itemSig = (it) =>
  JSON.stringify([
    it.english,
    it.icelandic,
    it.kind,
    it.name ?? null,
    it.expected ?? null,
    it.flagKinds ?? null,
    it.sentences,
  ]);
/** Equal as serialised (the harness matches run parameters the same way). */
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Check that runs can be merged and return what they share.
 * @param {Array<{ runId: string, prescreen: object }>} runs
 * @returns {{ model: string, effort: string, maxTokens: number, prompt: object, census: object,
 *   rulingSet: object, excluded: object, includePhysicsBiology: boolean, items: object[],
 *   byId: Map<string, object>, key: Record<string, object> }}
 * @throws {Error} on a pilot (or other) phase, no full run, a different model, effort,
 *   max_tokens, prompt or census, full runs with different items or exclusion counts, or a
 *   resend item that is not the full run's item of the same id
 */
export function checkRuns(runs) {
  if (runs.length === 0) throw new Error('collect needs at least one run');
  for (const { runId, prescreen } of runs) {
    if (!PHASES.has(prescreen.phase)) {
      throw new Error(
        `run ${runId} is a ${prescreen.phase} run; collect merges full and resend runs only ` +
          '(item ids are numbered within one run, so a pilot cannot merge with a full run)'
      );
    }
  }
  const full = runs.filter((r) => r.prescreen.phase === 'full');
  if (full.length === 0) {
    throw new Error('collect needs a full run: the population is the full run’s items');
  }
  const first = full[0];
  for (const { runId, prescreen } of runs) {
    for (const [field, what] of [
      ['model', 'model'],
      ['effort', 'effort'],
      ['maxTokens', 'max_tokens'],
      ['prompt', 'prompt'],
      ['census', 'census'],
    ]) {
      if (!same(prescreen[field], first.prescreen[field])) {
        throw new Error(
          `run ${runId} differs from run ${first.runId} in its ${what} ` +
            `(${JSON.stringify(prescreen[field])} against ${JSON.stringify(first.prescreen[field])})`
        );
      }
    }
  }
  const byId = new Map(first.prescreen.items.map((it) => [it.id, it]));
  for (const { runId, prescreen } of full.slice(1)) {
    const ids = prescreen.items.map((it) => it.id);
    if (ids.length !== byId.size) {
      throw new Error(
        `full runs ${first.runId} and ${runId} hold different items (${byId.size} against ` +
          `${ids.length})`
      );
    }
    for (const field of ['excluded', 'includePhysicsBiology']) {
      if (!same(prescreen[field] ?? null, first.prescreen[field] ?? null)) {
        throw new Error(`full runs ${first.runId} and ${runId} differ in ${field}`);
      }
    }
  }
  for (const { runId, prescreen } of runs) {
    for (const it of prescreen.items) {
      const mine = byId.get(it.id);
      if (!mine || itemSig(mine) !== itemSig(it)) {
        throw new Error(
          `item ${it.id} of run ${runId} is not item ${it.id} of full run ${first.runId}: ` +
            'these runs were assembled apart and cannot merge'
        );
      }
    }
  }
  const items = [...byId.values()];
  const seen = new Set(['id', 'english', 'icelandic', 'sentences']);
  const key = Object.fromEntries(
    items.map((it) => [it.id, Object.fromEntries(Object.entries(it).filter(([k]) => !seen.has(k)))])
  );
  const p = first.prescreen;
  return {
    model: p.model,
    effort: p.effort,
    maxTokens: p.maxTokens,
    prompt: p.prompt,
    census: p.census,
    rulingSet: p.rulingSet,
    excluded: p.excluded,
    includePhysicsBiology: p.includePhysicsBiology === true,
    items,
    byId,
    key,
  };
}

/**
 * One verdict per id over every run. An id answered in two runs is an error: a later run may
 * answer only what every earlier run left unjudged ("earlier" by the sortable run id).
 * @param {Array<{ runId: string, verdicts: Map<string, object> }>} reads
 * @returns {Map<string, object>} id → the verdict, plus the `runId` that gave it
 */
export function mergeVerdicts(reads) {
  const merged = new Map();
  const ordered = [...reads].sort((a, b) => (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0));
  for (const { runId, verdicts } of ordered) {
    for (const [id, v] of verdicts) {
      const earlier = merged.get(id);
      if (earlier) {
        throw new Error(
          `item ${id} is answered in run ${earlier.runId} and again in run ${runId}; a later run ` +
            'may answer only rows every earlier run left unjudged'
        );
      }
      merged.set(id, { ...v, runId });
    }
  }
  return merged;
}

/**
 * The ids a run actually sent: those of its requests whose keys its requests.jsonl records
 * (`sentKeys`; the harness records a request only once its reservation holds, so a run stopped
 * at the cap leaves the rest unrecorded). Without `sentKeys`, every planned id counts as sent:
 * the error that never buys a row twice.
 */
const sentIds = (r) => {
  const keys = r.sentKeys ? new Set(r.sentKeys) : null;
  return r.prescreen.requests.filter((q) => !keys || keys.has(q.key)).flatMap((q) => q.ids);
};

/**
 * The population ids to re-send: unjudged, and never sent by a resend run before (spec §8:
 * re-sent once). Controls are never re-sent.
 * @param {{ base: object, merged: Map<string, object>,
 *   runs: Array<{ prescreen: object, sentKeys?: string[] }> }} args
 * @returns {{ send: string[], resentBefore: string[] }}
 */
export function resendIds({ base, merged, runs }) {
  const resent = new Set(runs.filter((r) => r.prescreen.phase === 'resend').flatMap(sentIds));
  const unjudged = base.items
    .filter((it) => isPopulation(it.kind) && !merged.has(it.id))
    .map((it) => it.id)
    .sort();
  return {
    send: unjudged.filter((id) => !resent.has(id)),
    resentBefore: unjudged.filter((id) => resent.has(id)),
  };
}

/**
 * The committed verdicts document: one row per population id, sorted by id.
 * @returns {{ schema: string, runs: string[], model: string, prompt: object, excluded: object,
 *   controls: object, population: object[] }}
 */
export function buildVerdicts({ base, merged, runIds }) {
  const population = base.items
    .filter((it) => isPopulation(it.kind))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((it) => {
      const v = merged.get(it.id);
      return {
        id: it.id,
        english: it.english,
        icelandic: it.icelandic,
        group: GROUP[it.kind],
        verdict: v ? v.verdict : 'unjudged',
        kind: v ? v.kind : null,
        reason: v ? v.reason : null,
        proposed: v ? v.proposed : [],
        rightSenses: v ? v.rightSenses : null,
        sentences: it.sentences,
      };
    });
  return {
    schema: VERDICTS_SCHEMA,
    runs: [...runIds],
    model: base.model,
    prompt: { path: base.prompt.path, sha256: base.prompt.sha256 },
    excluded: base.excluded,
    controls: judgeControls({ verdicts: merged, key: base.key }),
    population,
  };
}

function findPrivateField(value, where) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = findPrivateField(value[i], `${where}[${i}]`);
      if (hit) return hit;
    }
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (PRIVATE_FIELDS.includes(k)) return `${where}.${k}`;
      const hit = findPrivateField(v, `${where}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Refuse a verdicts document that would publish what the export does not: a population pair the
 * committed reduced census does not hold (the census holds only export-published pairs), or an
 * `alternatives` / `ifRemoved` field anywhere (spec §8).
 * @param {object} doc a buildVerdicts result
 * @param {Array<{ english: string, icelandic: string }>} censusRows the reduced census's rows
 */
export function assertPublishable(doc, censusRows) {
  const leak = findPrivateField(doc, 'verdicts');
  if (leak) throw new Error(`the verdicts would carry a private field: ${leak}`);
  const pairs = new Set(censusRows.map((r) => `${r.english}\0${r.icelandic}`));
  const strays = doc.population.filter((r) => !pairs.has(`${r.english}\0${r.icelandic}`));
  if (strays.length) {
    throw new Error(
      `${strays.length} population rows are not pairs of the reduced census (which holds only ` +
        `pairs the export publishes), e.g. ${JSON.stringify(strays[0].english)} → ` +
        JSON.stringify(strays[0].icelandic)
    );
  }
}

/**
 * Why the outcome needs a person (empty = none): an unjudged population row, a control missed,
 * or a run that did not end complete.
 * @param {object} doc a buildVerdicts result
 * @param {Array<{ runId: string, status: string }>} runs
 * @returns {string[]}
 */
export function stopReasons(doc, runs) {
  const reasons = [];
  const unjudged = doc.population.filter((r) => r.verdict === 'unjudged').length;
  if (unjudged) reasons.push(`${unjudged} population rows are unjudged (open, never fine)`);
  const misses = doc.controls.results.filter((c) => !c.ok);
  if (misses.length) {
    reasons.push(
      `${misses.length} controls missed: ${misses.map((c) => `${c.name} got ${c.got}`).join(', ')}`
    );
  } else if (!doc.controls.pass) {
    reasons.push('the control gate did not pass (no controls)');
  }
  for (const r of runs) {
    if (r.status !== 'complete') reasons.push(`run ${r.runId} ended ${r.status}, not complete`);
  }
  return reasons;
}

/** A table cell: one line, no bare pipe. */
const cell = (v) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\|/g, '\\|');
const usd6 = (x) => Math.round(x * 1e6) / 1e6;

function describeRun(r) {
  const part = r.split ? `, part ${r.split.part} of ${r.split.of}` : '';
  return `\`${r.runId}\` (${r.phase}${part})`;
}

/**
 * The committed report (Markdown): control misses first, the counts by verdict, flag kind and
 * exclusion class, the unjudged rows, the control table, each run's cost in USD (run-end.json)
 * and ISK at the named rate, and the prompt sha256. Each of `pilots` adds a cost-only line and
 * its cost to the total; a pilot contributes no verdict.
 * @param {{ doc: object, merged: Map<string, object>, runs: Array<{ runId: string, phase: string,
 *   split: object|null, model: string, effort: string, status: string, totalUsd: number }>,
 *   pilots?: Array<{ runId: string, model: string, effort: string, status: string,
 *   totalUsd: number }>, iskRate: number, iskRateSource: string }} args
 * @returns {string}
 */
export function renderReport({ doc, merged, runs, pilots = [], iskRate, iskRateSource }) {
  const lines = [];
  const add = (...l) => lines.push(...l);
  const reasonOf = (id) => cell(merged.get(id)?.reason ?? '');
  const controlRow = (c, withOk) =>
    `| ${c.id} | ${cell(c.name)} | ${c.expected} | ${c.got} |` +
    `${withOk ? ` ${c.ok ? 'ok' : 'FAIL'} |` : ''} ${reasonOf(c.id)} |`;
  add('# Glossary pre-screen report (c19)', '');
  add(
    `Runs: ${runs.map(describeRun).join(', ')}. Model ${doc.model}. Prompt \`${doc.prompt.path}\`, ` +
      `sha256 \`${doc.prompt.sha256}\`.`,
    ''
  );
  const misses = doc.controls.results.filter((c) => !c.ok);
  if (misses.length) {
    add('## Control misses (read first)', '');
    add('| id | control | expected | got | the model’s reason |', '|---|---|---|---|---|');
    for (const c of misses) add(controlRow(c, false));
    add('');
  }
  add('## Verdicts', '');
  add('| group | fine | flag | unjudged | rows |', '|---|---|---|---|---|');
  const count = (rows) => {
    const n = { fine: 0, flag: 0, unjudged: 0 };
    for (const r of rows) n[r.verdict] += 1;
    return `| ${n.fine} | ${n.flag} | ${n.unjudged} | ${rows.length} |`;
  };
  for (const g of Object.keys(GROUP_LABEL)) {
    const rows = doc.population.filter((r) => r.group === g);
    if (rows.length) add(`| ${GROUP_LABEL[g]} ${count(rows)}`);
  }
  add(`| all ${count(doc.population)}`, '');
  add('## Flag kinds', '');
  add('| kind | rows |', '|---|---|');
  for (const k of FLAG_KINDS) {
    add(`| ${k} | ${doc.population.filter((r) => r.verdict === 'flag' && r.kind === k).length} |`);
  }
  add('');
  add('## Unjudged rows (open; never counted as fine)', '');
  const open = doc.population.filter((r) => r.verdict === 'unjudged');
  if (open.length === 0) add('None.');
  for (const r of open) add(`- \`${r.id}\` ${r.english} → ${r.icelandic}`);
  add('');
  add('## Excluded from the population', '');
  add('| class | rows |', '|---|---|');
  for (const [cls, n] of Object.entries(doc.excluded ?? {})) add(`| ${cls} | ${n} |`);
  add('');
  const passed = doc.controls.results.filter((c) => c.ok).length;
  add('## Controls', '');
  add(
    `Gate: ${doc.controls.pass ? 'PASS' : 'FAIL'} (${passed} of ${doc.controls.results.length} ` +
      'controls as expected).',
    ''
  );
  add('| id | control | expected | got | ok | the model’s reason |', '|---|---|---|---|---|---|');
  for (const c of doc.controls.results) add(controlRow(c, true));
  add('');
  add('## Cost', '');
  const isk = (usd) => Math.round(usd * iskRate);
  let total = 0;
  const costLine = (r, label) => {
    total += r.totalUsd;
    add(
      `- ${label}: ${r.model}, effort ${r.effort}, ended ${r.status}: ` +
        `USD ${usd6(r.totalUsd)} = ISK ${isk(r.totalUsd)}`
    );
  };
  for (const r of runs) costLine(r, describeRun(r));
  for (const p of pilots) costLine(p, `\`${p.runId}\` (pilot; cost only, no verdicts)`);
  const noPilot = pilots.length ? '' : ' (no pilot named: pilot spend is not in this total)';
  add(`- total: USD ${usd6(total)} = ISK ${isk(total)}${noPilot}`, '');
  add(
    `USD from each run's run-end.json; ISK at ${iskRate} ISK per USD; source: ${cell(iskRateSource)}.`,
    ''
  );
  return lines.join('\n');
}
