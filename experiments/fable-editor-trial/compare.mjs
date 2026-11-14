#!/usr/bin/env node
/**
 * compare.mjs — compare MT, the term pass (TP) and Fable's edit (FE) for a promoted trial run,
 * and build and score the blind ranking. 0 ISK, offline; reads books/, never writes there.
 *
 *   report  node experiments/fable-editor-trial/compare.mjs report --run <runId> [--sample 60]
 *           → results/<runId>/: report.md, metrics.json, segments.jsonl, fe-layer/,
 *             blind-sheet.md, blind-answers.csv, blind-key.b64 (do not open before ranking)
 *   score   node experiments/fable-editor-trial/compare.mjs score --run <runId> --answers <csv>
 *           → results/<runId>/blind-results.md and blind-results.json
 *
 * Plan §6. The automatic numbers say how different FE is and whether it is safe to handle;
 * only the blind ranking and the comparison with the editors' text say whether it is better.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  REPO_ROOT,
  TRIAL_DIR,
  BOOK_DIR,
  TRIAL_RECORD,
  TAGS,
  readPinnedInputs,
  unitSegments,
  parseAnswer,
  markerProblem,
  editDistance,
  chrF,
  readLayerMap,
  tpFile,
  huFile,
  chooseSample,
  blindItems,
  readable,
  scoreBlind,
} from './lib.mjs';
import { readJsonl, readJsonOrNull } from './records-io.mjs';

const runDirOf = (root, runId) => path.join(root, 'runs', runId);
const resultsDirOf = (root, runId) => path.join(root, 'results', runId);
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '–');
const words = (s) =>
  new Set((s.toLowerCase().match(/[\p{L}\p{N}-]+/gu) || []).filter((w) => w.length > 2));

/** Load a promoted run and turn its answers into per-segment rows. */
export function buildRows({ trialRoot, runId, bookDir = BOOK_DIR, inputOptions }) {
  const dir = runDirOf(trialRoot, runId);
  const trial = readJsonOrNull(path.join(dir, TRIAL_RECORD));
  if (!trial) throw new Error(`compare: ${dir} has no ${TRIAL_RECORD}; promote the run first`);
  const run = readJsonOrNull(path.join(dir, 'run.json'));
  const runEnd = readJsonOrNull(path.join(dir, 'run-end.json'));
  const responses = fs.existsSync(path.join(dir, 'responses.jsonl'))
    ? readJsonl(path.join(dir, 'responses.jsonl'))
    : [];
  const errors = fs.existsSync(path.join(dir, 'errors.jsonl'))
    ? readJsonl(path.join(dir, 'errors.jsonl'))
    : [];
  const chapterDir = trial.chapterDir;
  const { inputs } = readPinnedInputs(chapterDir, { bookDir, ...(inputOptions ?? {}) });

  const byKey = new Map(responses.map((r) => [r.key, r]));
  const edits = new Map();
  const answers = [];
  for (const req of trial.requests) {
    const a = parseAnswer(byKey.get(req.key), req.keys);
    answers.push({ key: req.key, usable: a.usable, edits: a.edits.length, problems: a.problems });
    for (const e of a.edits) edits.set(`${req.stem}\u0000${e.key}`, e);
  }
  const sent = new Set(trial.requests.flatMap((r) => r.keys.map((k) => `${r.stem}\u0000${k}`)));
  const answeredStems = new Set(
    trial.requests.filter((r) => answers.find((a) => a.key === r.key)?.usable).map((r) => r.key)
  );

  const rows = [];
  const units = [];
  for (const unit of inputs) {
    const tp = readLayerMap(tpFile(chapterDir, unit.stem, bookDir));
    const hu = readLayerMap(huFile(chapterDir, unit.stem, bookDir));
    const feBodies = new Map();
    for (const s of unitSegments(unit)) {
      const id = `${unit.stem}\u0000${s.key}`;
      if (!sent.has(id)) continue;
      const req = trial.requests.find((r) => r.stem === unit.stem && r.keys.includes(s.key));
      const e = edits.get(id);
      let fe = s.is;
      let status = answeredStems.has(req.key) ? 'unchanged' : 'unanswered';
      let problem = null;
      if (e && e.text !== s.is) {
        problem = markerProblem(s.is, e.text);
        if (problem) status = 'refused-markers';
        else {
          fe = e.text;
          status = 'edited';
        }
      }
      if (fe !== s.is) feBodies.set(s.key, fe);
      rows.push({
        stem: unit.stem,
        key: s.key,
        segmentId: s.segmentId,
        en: s.en,
        mt: s.is,
        tp: tp?.get(s.key) ?? s.is,
        fe,
        hu: hu?.get(s.key) ?? null,
        status,
        tags: e?.tags ?? [],
        proposed: e?.text ?? null,
        markerProblem: problem,
      });
    }
    units.push({ unit, feBodies });
  }
  return { trial, run, runEnd, responses, errors, answers, rows, units, chapterDir };
}

/** The FE text of each unit as a layer file (same markers and whitespace as layer 1). */
export function feLayerText(parsed, feBodies) {
  return (
    parsed.prefix +
    parsed.records
      .map(
        (r) =>
          r.markerText + r.lead + (feBodies.has(r.key) ? feBodies.get(r.key) : r.body) + r.trail
      )
      .join('')
  );
}

export function computeMetrics({ rows, responses, answers }) {
  const n = rows.length;
  const changed = (a, b) => rows.filter((r) => r[a] !== r[b]);
  const meanDist = (list, a, b) =>
    list.length ? list.reduce((s, r) => s + editDistance(r[a], r[b]), 0) / list.length : 0;
  const tpChanged = changed('tp', 'mt');
  const feChanged = changed('fe', 'mt');
  const both = rows.filter((r) => r.tp !== r.mt && r.fe !== r.mt);
  const mtChars = rows.reduce((s, r) => s + [...r.mt].length, 0);
  const totalDist = (a) => rows.reduce((s, r) => s + editDistance(r[a], r.mt), 0);
  // Words the term pass put in that MT did not have: does FE carry them too?
  let introduced = 0;
  let carried = 0;
  for (const r of tpChanged) {
    const mtW = words(r.mt);
    const feW = words(r.fe);
    for (const w of words(r.tp)) {
      if (mtW.has(w)) continue;
      introduced++;
      if (feW.has(w)) carried++;
    }
  }
  const tags = Object.fromEntries(TAGS.map((t) => [t, 0]));
  for (const r of rows) if (r.status === 'edited') for (const t of r.tags) tags[t]++;
  const status = {};
  for (const r of rows) status[r.status] = (status[r.status] || 0) + 1;
  const outcomes = {};
  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let thinkingTokens = 0;
  for (const r of responses) {
    outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;
    costUsd += r.costUsd ?? 0;
    const u = r.usage ?? {};
    inputTokens +=
      (u.input_tokens ?? 0) +
      (u.cache_read_input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0);
    outputTokens += u.output_tokens ?? 0;
    thinkingTokens += u.output_tokens_details?.thinking_tokens ?? 0;
  }
  const hu = rows.filter((r) => r.hu !== null);
  let huBlock = null;
  if (hu.length) {
    const edited = hu.filter((r) => r.hu !== r.mt);
    const feEd = hu.filter((r) => r.fe !== r.mt);
    const agree = edited.filter((r) => r.fe !== r.mt).length;
    huBlock = {
      segments: hu.length,
      editorsChanged: edited.length,
      meanDistanceToHU: {
        MT: meanDist(hu, 'mt', 'hu'),
        TP: meanDist(hu, 'tp', 'hu'),
        FE: meanDist(hu, 'fe', 'hu'),
      },
      meanChrF: Object.fromEntries(
        ['mt', 'tp', 'fe'].map((c) => [
          c.toUpperCase(),
          hu.reduce((s, r) => s + chrF(r[c], r.hu), 0) / hu.length,
        ])
      ),
      feCloserThanMT: hu.filter((r) => editDistance(r.fe, r.hu) < editDistance(r.mt, r.hu)).length,
      feFurtherThanMT: hu.filter((r) => editDistance(r.fe, r.hu) > editDistance(r.mt, r.hu)).length,
      editRecall: edited.length ? agree / edited.length : null,
      editPrecision: feEd.length ? feEd.filter((r) => r.hu !== r.mt).length / feEd.length : null,
    };
  }
  return {
    segments: n,
    answers: { total: answers.length, usable: answers.filter((a) => a.usable).length },
    outcomes,
    status,
    tpChanged: tpChanged.length,
    feChanged: feChanged.length,
    bothChanged: both.length,
    meanDistanceFromMT: {
      TP: meanDist(tpChanged, 'tp', 'mt'),
      FE: meanDist(feChanged, 'fe', 'mt'),
    },
    charsChangedShare: { TP: totalDist('tp') / mtChars, FE: totalDist('fe') / mtChars },
    tpIntroducedWordsCarriedByFE: { introduced, carried },
    tags,
    usage: { costUsd, inputTokens, outputTokens, thinkingTokens },
    hu: huBlock,
  };
}

function renderReport({ runId, run, runEnd, trial, metrics: m, answers, rows }) {
  const L = [];
  L.push(`# Fable editor trial — ${trial.book} ${trial.chapterDir}, run ${runId}`, '');
  L.push(
    'Generated by `compare.mjs report`. Plan: `docs/plans/2026-11-14-fable-editor-trial-plan.md` §6.',
    ''
  );
  L.push('## The run', '');
  L.push(
    `- Model ${run?.model}, effort ${run?.effort}, max_tokens ${run?.max_tokens}, mode ${run?.mode}; status **${runEnd?.status}**`
  );
  L.push(
    `- Inputs: term-pass run ${trial.termPassRun}, layer 1 at \`${trial.layer1Commit}\`` +
      (trial.enDrift?.length
        ? `; English re-extracted since (G1.12, later repeats removed) for ${trial.enDrift.map((d) => d.stem).join(', ')}`
        : '')
  );
  L.push(
    `- Prompt ${run?.prompts?.[0]?.path} (sha256 \`${run?.prompts?.[0]?.sha256?.slice(0, 12)}…\`), ruling set sha256 \`${run?.rulingSet?.sha256?.slice(0, 12)}…\``
  );
  L.push(
    `- Answers usable: ${m.answers.usable} of ${m.answers.total}; outcomes ${JSON.stringify(m.outcomes)}`
  );
  L.push(
    `- Cost **$${m.usage.costUsd.toFixed(4)}** (input ${m.usage.inputTokens} tokens, output ${m.usage.outputTokens}, of which thinking ${m.usage.thinkingTokens}). Record the ISK figure in the run README.`,
    ''
  );
  L.push('## How much each changed (segments sent: ' + m.segments + ')', '');
  L.push('| | TP (term pass) | FE (Fable) |', '|---|---|---|');
  L.push(
    `| Segments changed from MT | ${m.tpChanged} (${pct(m.tpChanged, m.segments)}) | ${m.feChanged} (${pct(m.feChanged, m.segments)}) |`
  );
  L.push(
    `| Mean character edits per changed segment | ${m.meanDistanceFromMT.TP.toFixed(1)} | ${m.meanDistanceFromMT.FE.toFixed(1)} |`
  );
  L.push(
    `| Share of MT characters changed | ${(100 * m.charsChangedShare.TP).toFixed(2)}% | ${(100 * m.charsChangedShare.FE).toFixed(2)}% |`,
    ''
  );
  L.push(
    `Both changed: ${m.bothChanged} segments. Of the ${m.tpIntroducedWordsCarriedByFE.introduced} words the term pass put in that MT lacked, FE has ${m.tpIntroducedWordsCarriedByFE.carried} (${pct(m.tpIntroducedWordsCarriedByFE.carried, m.tpIntroducedWordsCarriedByFE.introduced)}). This is a rough terminology agreement: an inflected form FE chose differently counts as missing.`,
    ''
  );
  L.push('## Structural safety', '');
  L.push(
    `Segment status: ${Object.entries(m.status)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}.`
  );
  const refused = rows.filter((r) => r.status === 'refused-markers');
  if (refused.length) {
    L.push(
      '',
      `${refused.length} proposed edits changed a marker's fixed part and were left out (MT kept):`,
      ''
    );
    for (const r of refused.slice(0, 50)) L.push(`- \`${r.stem} ${r.key}\`: ${r.markerProblem}`);
  } else L.push('', 'Every proposed edit kept every marker.');
  const probs = answers.filter((a) => a.problems.length);
  if (probs.length) {
    L.push('', 'Answer problems:', '');
    for (const a of probs)
      L.push(
        `- ${a.key}: ${a.problems.slice(0, 5).join('; ')}${a.problems.length > 5 ? ` (+${a.problems.length - 5})` : ''}`
      );
  }
  L.push('', "## Fable's own tags (its report, not a measurement)", '');
  L.push(
    Object.entries(m.tags)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · '),
    ''
  );
  L.push("## Against the editors' text (HU)", '');
  if (!m.hu)
    L.push(
      'No `03-faithful-translation` file for this chapter yet. Re-run this report once the chapter is applied.'
    );
  else {
    const h = m.hu;
    L.push(
      '⚠️ A faithful file holds MT for every segment nobody edited (register §C202), and the editors start from MT, so these measures lean toward MT (plan §6.3).',
      ''
    );
    L.push(`Segments: ${h.segments}; editors changed ${h.editorsChanged}.`, '');
    L.push('| | MT | TP | FE |', '|---|---|---|---|');
    L.push(
      `| Mean character distance to HU | ${h.meanDistanceToHU.MT.toFixed(1)} | ${h.meanDistanceToHU.TP.toFixed(1)} | ${h.meanDistanceToHU.FE.toFixed(1)} |`
    );
    L.push(
      `| Mean chrF to HU | ${h.meanChrF.MT.toFixed(1)} | ${h.meanChrF.TP.toFixed(1)} | ${h.meanChrF.FE.toFixed(1)} |`,
      ''
    );
    L.push(
      `FE closer to HU than MT: ${h.feCloserThanMT}; further: ${h.feFurtherThanMT}. Edit recall ${h.editRecall?.toFixed(3) ?? '–'}, precision ${h.editPrecision?.toFixed(3) ?? '–'}.`
    );
  }
  L.push('');
  return L.join('\n');
}

function renderSheet(items, runId) {
  const L = [`# Blind ranking — run ${runId}`, ''];
  L.push(
    'For each item: the English, then two or three Icelandic versions in random order. Rank the versions (1 = best) and mark each `y` (would accept as is) or `n`, in `blind-answers.csv`. Identical versions are shown once. Do not open `blind-key.b64` until you have finished.',
    ''
  );
  for (const it of items) {
    L.push(`## ${it.item}`, '', `**EN:** ${readable(it.en)}`, '');
    for (const v of it.versions) L.push(`**${v.letter}:** ${readable(v.text)}`, '');
  }
  return L.join('\n');
}

function renderCsvTemplate(items) {
  const L = ['item,rank_A,rank_B,rank_C,accept_A,accept_B,accept_C'];
  for (const it of items) {
    const has = (l) => it.versions.some((v) => v.letter === l);
    L.push(
      [
        it.item,
        ...['A', 'B', 'C'].map((l) => (has(l) ? '' : '-')),
        ...['A', 'B', 'C'].map((l) => (has(l) ? '' : '-')),
      ].join(',')
    );
  }
  return L.join('\n') + '\n';
}

export function report({
  trialRoot = path.join(REPO_ROOT, TRIAL_DIR),
  runId,
  sampleSize = 60,
  bookDir,
  inputOptions,
}) {
  const data = buildRows({ trialRoot, runId, bookDir, inputOptions });
  const metrics = computeMetrics(data);
  const out = resultsDirOf(trialRoot, runId);
  fs.mkdirSync(path.join(out, 'fe-layer'), { recursive: true });
  fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  fs.writeFileSync(
    path.join(out, 'segments.jsonl'),
    data.rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
  );
  for (const { unit, feBodies } of data.units) {
    fs.writeFileSync(
      path.join(out, 'fe-layer', `${unit.stem}-segments.is.md`),
      feLayerText(unit.base.parsed, feBodies)
    );
  }
  fs.writeFileSync(path.join(out, 'report.md'), renderReport({ runId, ...data, metrics }));
  const sample = chooseSample(data.rows, { size: sampleSize, seed: runId });
  const { items, key } = blindItems(sample, { seed: runId });
  fs.writeFileSync(path.join(out, 'blind-sheet.md'), renderSheet(items, runId));
  const csv = path.join(out, 'blind-answers.csv');
  if (!fs.existsSync(csv)) fs.writeFileSync(csv, renderCsvTemplate(items));
  fs.writeFileSync(
    path.join(out, 'blind-key.b64'),
    Buffer.from(JSON.stringify(key)).toString('base64') + '\n'
  );
  return { out, metrics, sampled: items.length };
}

export function score({ trialRoot = path.join(REPO_ROOT, TRIAL_DIR), runId, answersFile }) {
  const out = resultsDirOf(trialRoot, runId);
  const key = JSON.parse(
    Buffer.from(fs.readFileSync(path.join(out, 'blind-key.b64'), 'utf8').trim(), 'base64').toString(
      'utf8'
    )
  );
  const res = scoreBlind(fs.readFileSync(answersFile, 'utf8'), key);
  fs.writeFileSync(path.join(out, 'blind-results.json'), JSON.stringify(res, null, 2) + '\n');
  const L = [
    `# Blind ranking results — run ${runId}`,
    '',
    `Items answered: ${res.answered} of ${res.items}.`,
    '',
  ];
  L.push('| | Mean rank (1 = best) | Ranked first | Would accept |', '|---|---|---|---|');
  for (const c of ['MT', 'TP', 'FE']) {
    const s = res.summary[c];
    L.push(
      `| ${c} | ${s.meanRank?.toFixed(2) ?? '–'} | ${s.rankedFirst} of ${s.rated} | ${s.acceptRate === null ? '–' : `${(100 * s.acceptRate).toFixed(0)}%`} |`
    );
  }
  L.push(
    '',
    "Where two conditions gave the same text, both get that version's rank and acceptance.",
    ''
  );
  fs.writeFileSync(path.join(out, 'blind-results.md'), L.join('\n'));
  return res;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  process.exitCode = 1;
  try {
    const [cmd, ...rest] = process.argv.slice(2);
    const { values } = parseArgs({
      args: rest,
      strict: true,
      options: {
        run: { type: 'string' },
        sample: { type: 'string', default: '60' },
        answers: { type: 'string' },
      },
    });
    if (!values.run) throw new Error('--run <runId> is required');
    if (cmd === 'report') {
      const r = report({ runId: values.run, sampleSize: Number(values.sample) });
      process.stdout.write(
        `wrote ${path.relative(REPO_ROOT, r.out)}/ (report.md, ${r.sampled} blind items)\n`
      );
    } else if (cmd === 'score') {
      if (!values.answers) throw new Error('--answers <csv> is required');
      const r = score({ runId: values.run, answersFile: values.answers });
      process.stdout.write(`${JSON.stringify(r.summary)}\n`);
    } else throw new Error('usage: compare.mjs report|score --run <runId> [--answers file]');
    process.exitCode = 0;
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
  }
}
