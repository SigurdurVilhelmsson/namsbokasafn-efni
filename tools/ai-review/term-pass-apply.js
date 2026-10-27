/**
 * term-pass-apply.js — the term pass's deterministic second half: recorded responses in,
 * gated edits, change records and a complete layer-2 chapter out. Costs nothing and can be
 * re-run from the committed records at any time, which is what makes layer 2 reproducible.
 *
 * Design: docs/superpowers/specs/2026-10-27-ai-layer-runner-design.md ("Three rules … and one
 * guard", "The glue").
 *
 * - Refuses (`stale-inputs`, `stale-presented`) unless every input still has the sha256 the
 *   run recorded (layer 1, overlay, English, ruling set, prompt) and every segment a request
 *   showed the model is still the current base, byte for byte.
 * - Gates each segment over ALL its occurrences (gate.js `gateOccurrences`) with the GROUP
 *   RULE: when any operation of a ruling in a segment fails — refused by the gate, refused by
 *   the parser (term-pass-response.js), or turned into a `sense-unclear` flag — every
 *   operation of that ruling there is withdrawn (`group-incomplete`) and the segment is
 *   re-gated without them, to a fixpoint. A term change whose forced agreement was refused
 *   would otherwise leave the sentence ungrammatical.
 * - Chains one change record per accepted operation per occurrence, in the gate's applied
 *   order, so each record's `before` is the previous record's `after`.
 * - Builds every unit of the chapter (zero-change units included), because layer 2 is
 *   complete per chapter (mt-layers.js `writeRevisedChapter`).
 * - Writes nothing unless asked (`writeApplied`); `renderReport` is a reviewer's markdown.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gateOccurrences } from './gate.js';
import { parseTermPassResponse } from './term-pass-response.js';
import { pairUnit } from './worklist.js';
import { USE, parseUserMessage } from './term-pass-request.js';
import { assertBookSlug } from './config.js';
import { RECORD_FILES, openRunDir, createRecordWriter } from './records.js';
import {
  LAYER_DIRS,
  CHAPTER_DIR_RE,
  listChapterUnits,
  readBase,
  parseLayerFile,
  applyBodyEdits,
  buildChangeRecord,
  writeRevisedChapter,
} from '../lib/mt-layers.js';

export const TERM_PASS_RECORD = 'term-pass.json';
/** /2 (2026-10-27) adds `plannedRequestKeys`: the chapter's whole plan, before any --limit. */
export const TERM_PASS_SCHEMA = 'ai-review-term-pass/2';
export const APPLY_SCHEMA = 'ai-review-apply/1';
export const APPLIED_DIR = 'applied';
export const APPLIED_FILES = Object.freeze({
  summary: 'apply.json',
  gate: 'gate.jsonl',
  flags: 'flags.jsonl',
  senses: 'senses.jsonl',
});
/** A request with no usable response (every attempt errored, or none was recorded). */
export const REQUEST_ERROR = 'request-error';
export const GROUP_INCOMPLETE = 'group-incomplete';
/** An op of a ruling the model itself flagged, in that segment, with a "make no edit" kind. */
export const FLAGGED_NO_EDIT = 'flagged-no-edit';
/**
 * The flag kinds the prompt pairs with "make no edit" for that ruling (runner review,
 * 2026-10-27). mistranslation-suspected is not one: it concerns the sentence, and a term
 * edit beside it can be legitimate.
 */
export const WITHDRAWING_FLAG_KINDS = Object.freeze([
  'compound-term',
  'needs-rewrite',
  'sense-unclear',
  'target-other-sense',
]);
/** Rejection reasons the runner adds on its own, as opposed to the gate's. */
const RUNNER_WITHDRAWALS = new Set([GROUP_INCOMPLETE, FLAGGED_NO_EDIT]);

/**
 * Whether a parsed answer reviewed its request: it parsed with no request problem AND answered
 * every segment it was shown. The one definition of "usable", for apply's coverage and for the
 * CLI's stop rule alike (final review, 2026-10-27: an answer that skipped segments, or answered
 * none, used to count).
 * @param {{ problem: string|null, missing: string[] }} parsed parseTermPassResponse's result
 */
export const isUsableParse = (parsed) => !parsed.problem && parsed.missing.length === 0;

const refusal = (code, message) => Object.assign(new Error(`[${code}] ${message}`), { code });
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── Inputs ───────────────────────────────────────────────────────────────────────────────

/** The English segment file a unit pairs with. */
export function enFilePath(bookDir, chapterDir, stem) {
  return path.join(bookDir, '02-for-mt', chapterDir, `${stem}-segments.en.md`);
}

/**
 * Read one chapter's inputs: for each unit, its base (layer 1 with the layer-1s overlay),
 * its English, and their pairing (worklist.js `pairUnit`).
 * @param {{ bookDir: string, chapterDir: string }} args
 * @returns {Array<{ stem: string, base: object, en: object, enSha256: string, pair: object }>}
 */
export function readChapterInputs({ bookDir, chapterDir }) {
  return listChapterUnits({ bookDir, chapterDir }).map((stem) => {
    const base = readBase({ bookDir, chapterDir, stem });
    const enFile = enFilePath(bookDir, chapterDir, stem);
    if (!fs.existsSync(enFile)) throw refusal('missing-en', `${enFile} does not exist`);
    const enBytes = fs.readFileSync(enFile);
    const en = parseLayerFile(enBytes.toString('utf8'));
    return { stem, base, en, enSha256: sha256(enBytes), pair: pairUnit({ en, is: base.parsed }) };
  });
}

/** What a run records about each unit's inputs, and what apply compares. */
export function unitFingerprints(inputs) {
  return inputs.map((u) => ({
    stem: u.stem,
    layer1Sha256: u.base.layer1Sha256,
    overlaySha256: u.base.overlaySha256,
    enSha256: u.enSha256,
  }));
}

/**
 * Load one finished run's records.
 * @param {{ recordsDir: string, runId: string }} args
 */
export function loadRunRecords({ recordsDir, runId }) {
  const dir = openRunDir(recordsDir, runId);
  const r = createRecordWriter({ dir });
  if (!r.exists(RECORD_FILES.runEnd)) {
    throw refusal('run-unfinished', `run ${runId} has no ${RECORD_FILES.runEnd}; resume it first`);
  }
  if (!r.exists(TERM_PASS_RECORD)) {
    throw refusal('not-a-term-pass-run', `run ${runId} has no ${TERM_PASS_RECORD}`);
  }
  return {
    runId,
    run: r.readJson(RECORD_FILES.run),
    runEnd: r.readJson(RECORD_FILES.runEnd),
    termPass: r.readJson(TERM_PASS_RECORD),
    requests: r.readJsonl(RECORD_FILES.requests),
    responses: r.readJsonl(RECORD_FILES.responses),
    errors: r.readJsonl(RECORD_FILES.errors),
  };
}

// ── The group rule ───────────────────────────────────────────────────────────────────────

/**
 * Gate one segment's operations over all its occurrences, all or nothing per ruling.
 * @param {{ ops: object[], item: { occurrences: Array<{ occurrence: number, en: string, is: string }> },
 *   chapterDir: string, rulingsById: Map<string, object>, preFailed?: Set<string>, limits?: object }} args
 *   `preFailed`: rulings already failed in this segment before the gate (the parser refused one
 *   of their operations, or turned one into a sense-unclear flag).
 *   `flagged`: ruling id → flag kind, for rulings the model flagged in this segment with a
 *   WITHDRAWING_FLAG_KINDS kind; their operations never reach the gate (FLAGGED_NO_EDIT).
 * @returns {{ accepted: object[], occurrences: Array<{ occurrence: number, accepted: object[], after: string }>,
 *   rejected: Array<{ op: object, reasons: string[], perOccurrence?: string[][], flag?: string }> }}
 */
export function gateWithGroups({
  ops,
  item,
  chapterDir,
  rulingsById,
  preFailed = new Set(),
  flagged = new Map(),
  limits,
}) {
  const multi = item.occurrences.length > 1;
  const withdrawn = new Map();
  // Each rejected op's verdict from the round in which it FIRST failed: that is the root cause
  // (agreement-too-far, duplicate-divergent, find-not-found). A later round re-gates it without
  // the ops the group rule withdrew and would report only the consequence. Kept even if the op
  // passes a later round, because a once-failed ruling stays failed and the op is withdrawn.
  const firstFail = new Map();
  for (const op of ops) {
    if (flagged.has(op.rulingId)) withdrawn.set(op, [FLAGGED_NO_EDIT]);
  }
  let live = ops.filter((op) => !withdrawn.has(op));
  for (;;) {
    const res = gateOccurrences({
      ops: live,
      en: item.occurrences.map((o) => o.en),
      isOccurrences: item.occurrences.map((o) => o.is),
      chapterDir,
      rulingsById,
      limits,
    });
    const accepted = new Set(res.accepted);
    for (const op of live) {
      if (!accepted.has(op) && !firstFail.has(op)) {
        const per = res.occurrences.map((o) => o.rejected.find((x) => x.op === op)?.reasons ?? []);
        firstFail.set(op, { reasons: [...new Set(per.flat())], per });
      }
    }
    const failed = new Set([...preFailed, ...flagged.keys()]);
    for (const op of ops) if (!accepted.has(op)) failed.add(op.rulingId);
    const pull = res.accepted.filter((op) => failed.has(op.rulingId));
    if (pull.length === 0) {
      return {
        accepted: res.accepted,
        occurrences: res.occurrences.map((o, k) => ({
          occurrence: item.occurrences[k].occurrence,
          accepted: o.accepted,
          after: o.after,
        })),
        rejected: ops
          .filter((op) => !accepted.has(op))
          .map((op) => {
            const first = firstFail.get(op);
            if (withdrawn.has(op)) {
              // The reason it first failed for (if it ever reached the gate), then why the
              // runner withdrew it.
              const reasons = [...new Set([...(first?.reasons ?? []), ...withdrawn.get(op)])];
              return {
                op,
                reasons,
                ...(multi && first ? { perOccurrence: first.per } : {}),
                ...(flagged.has(op.rulingId) ? { flag: flagged.get(op.rulingId) } : {}),
              };
            }
            return multi
              ? { op, reasons: first.reasons, perOccurrence: first.per }
              : { op, reasons: first.reasons };
          }),
      };
    }
    for (const op of pull) withdrawn.set(op, [GROUP_INCOMPLETE]);
    live = live.filter((op) => !withdrawn.has(op));
  }
}

/**
 * One change record per accepted operation, chained in applied order over one occurrence.
 * @returns {object[]} change records (mt-layers.js `buildChangeRecord`)
 */
export function chainChanges({ stem, segmentId, occurrence, before, accepted, after, runId }) {
  let text = before;
  const out = [];
  for (const op of accepted) {
    const at = text.indexOf(op.find);
    if (at < 0 || text.indexOf(op.find, at + 1) !== -1) {
      throw new Error(`term-pass: ${op.opId}: find does not occur exactly once while chaining`);
    }
    const next = text.slice(0, at) + op.replace + text.slice(at + op.find.length);
    out.push(
      buildChangeRecord({
        module: stem,
        segmentId,
        occurrence,
        opId: op.opId,
        source: 'ai',
        rulingId: op.rulingId,
        category: op.category,
        find: op.find,
        replace: op.replace,
        before: text,
        after: next,
        runId,
      })
    );
    text = next;
  }
  if (text !== after) {
    throw new Error(`term-pass: ${segmentId}#${occurrence}: the chained text is not the gate's`);
  }
  return out;
}

// ── Applying one chapter ─────────────────────────────────────────────────────────────────

function checkRuns(runs, { chapterDir, prompt, rulingSet }) {
  if (!Array.isArray(runs) || runs.length === 0)
    throw refusal('no-runs', 'apply needs at least one run');
  const ids = runs.map((r) => r.runId);
  if (new Set(ids).size !== ids.length) throw refusal('duplicate-run', 'a run is listed twice');
  const first = runs[0];
  for (const r of runs) {
    const { run, termPass } = r;
    const where = `run ${r.runId}`;
    if (run.use !== USE) throw refusal('wrong-use', `${where} is a "${run.use}" run, not ${USE}`);
    if (run.runId !== r.runId || termPass.runId !== r.runId) {
      throw refusal('run-mismatch', `${where}: its records name another run id`);
    }
    if (termPass.schema !== TERM_PASS_SCHEMA)
      throw refusal('bad-record', `${where}: ${TERM_PASS_RECORD} schema`);
    if (termPass.chapterDir !== chapterDir) {
      throw refusal('wrong-chapter', `${where} covers ${termPass.chapterDir}, not ${chapterDir}`);
    }
    if (r.runEnd.status === 'pending' || r.runEnd.status === 'submit-unknown') {
      throw refusal('run-unfinished', `${where} ended ${r.runEnd.status}`);
    }
    if (!sameJson(run.prompts, [{ path: prompt.path, sha256: prompt.sha256 }])) {
      throw refusal(
        'stale-inputs',
        `${where} used another prompt than ${prompt.path} at ${prompt.sha256}`
      );
    }
    if (!sameJson(run.rulingSet, { path: rulingSet.path, sha256: rulingSet.sha256 })) {
      throw refusal(
        'stale-inputs',
        `${where} used another ruling set than ${rulingSet.path} at ${rulingSet.sha256}`
      );
    }
    for (const k of ['model', 'effort', 'max_tokens']) {
      if (run[k] !== first.run[k])
        throw refusal('mixed-runs', `${where}: ${k} differs from run ${first.runId}`);
    }
    if (!sameJson(run.sdk, first.run.sdk))
      throw refusal('mixed-runs', `${where}: SDK differs from run ${first.runId}`);
    if (termPass.layer1Commit !== first.termPass.layer1Commit) {
      throw refusal('mixed-runs', `${where}: layer1Commit differs from run ${first.runId}`);
    }
    const planned = termPass.plannedRequestKeys;
    if (
      !Array.isArray(planned) ||
      planned.length === 0 ||
      !planned.every((k) => typeof k === 'string' && k !== '') ||
      new Set(planned).size !== planned.length ||
      !(termPass.requestKeys ?? []).every((k) => planned.includes(k))
    ) {
      throw refusal('bad-record', `${where}: plannedRequestKeys does not hold its requestKeys`);
    }
    // One plan per chapter: coverage is measured against it, so runs must agree on it.
    if (!sameJson(planned, first.termPass.plannedRequestKeys)) {
      throw refusal('mixed-runs', `${where}: planned other requests than run ${first.runId}`);
    }
  }
  const versions = [...new Set(runs.map((r) => r.run.anthropicVersion).filter((v) => v !== null))];
  if (versions.length > 1)
    throw refusal('mixed-runs', `the runs sent different anthropic-version headers`);
  return { anthropicVersion: versions[0] ?? null };
}

/** The response to use for each request key: the LAST run (in the order given) that has one. */
function pickResponses(runs) {
  const byKey = new Map();
  for (const r of runs) {
    const respById = new Map(r.responses.map((l) => [l.custom_id, l]));
    const errById = new Map();
    for (const e of r.errors) {
      if (e.custom_id) errById.set(e.custom_id, [...(errById.get(e.custom_id) ?? []), e]);
    }
    for (const req of r.requests) {
      const prev = byKey.get(req.key);
      if (prev && !sameJson(prev.body, req.body)) {
        throw refusal(
          'mixed-runs',
          `request ${req.key} differs between run ${prev.runId} and run ${r.runId}`
        );
      }
      const response = respById.get(req.custom_id) ?? null;
      if (!prev || response) {
        byKey.set(req.key, {
          key: req.key,
          runId: r.runId,
          body: req.body,
          response,
          errors: errById.get(req.custom_id) ?? [],
        });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => byString(a.key, b.key));
}

const tally = (map, key, n = 1) => map.set(key, (map.get(key) ?? 0) + n);
const sortedObject = (map) => Object.fromEntries([...map].sort(([a], [b]) => byString(a, b)));

/**
 * Apply one chapter from one or more finished runs. Reads files; writes nothing.
 * @param {{ bookDir: string, chapterDir: string,
 *   rulingSet: { path: string, sha256: string, byId: Map<string, object> },
 *   prompt: { path: string, sha256: string }, runs: object[], applyCommit: string }} args
 *   `runs` from loadRunRecords; `applyCommit` is the commit of the code applying them
 *   (recorded as the revision's harnessCommit; each run's own commit stays in its run.json).
 */
export function applyChapter({ bookDir, chapterDir, rulingSet, prompt, runs, applyCommit }) {
  if (!CHAPTER_DIR_RE.test(String(chapterDir)))
    throw refusal('bad-chapter-dir', String(chapterDir));
  const { anthropicVersion } = checkRuns(runs, { chapterDir, prompt, rulingSet });
  const inputs = readChapterInputs({ bookDir, chapterDir });
  const prints = unitFingerprints(inputs);
  for (const r of runs) {
    if (!sameJson(prints, r.termPass.units)) {
      const recorded = new Map((r.termPass.units ?? []).map((u) => [u.stem, u]));
      const differ = prints.filter((u) => !sameJson(u, recorded.get(u.stem))).map((u) => u.stem);
      throw refusal(
        'stale-inputs',
        `run ${r.runId}: the chapter's inputs changed since the run (${differ.join(', ') || 'unit list'})`
      );
    }
  }
  const unitByStem = new Map(inputs.map((u) => [u.stem, u]));
  const rulingsById = rulingSet.byId;

  const gateLog = [];
  const flags = [];
  const senses = [];
  const changesByStem = new Map(inputs.map((u) => [u.stem, new Map()])); // stem → key → records
  const finalByStem = new Map(inputs.map((u) => [u.stem, new Map()])); // stem → key → after
  const rejectedByStem = new Map(inputs.map((u) => [u.stem, 0]));
  const c = {
    requests: 0,
    requestProblems: new Map(),
    segmentsPresented: 0,
    segmentsAnswered: 0,
    segmentsMissing: 0,
    entriesDropped: 0,
    opsProposed: 0,
    accepted: 0,
    rejected: 0,
    unclearConverted: 0,
    acceptedByCategory: new Map(),
    rejectedByReason: new Map(),
    flagsByKind: new Map(),
  };

  const plannedKeys = runs[0].termPass.plannedRequestKeys;
  const plannedSet = new Set(plannedKeys);
  const usableKeys = new Set(); // planned requests with a usable answer (isUsableParse)
  const unanswered = new Set(); // presented segment ids no usable answer reviewed
  const truncatedKeys = new Set(); // requests whose chosen answer was cut off at max_tokens

  for (const req of pickResponses(runs)) {
    c.requests += 1;
    if (!plannedSet.has(req.key)) {
      throw refusal('mixed-runs', `request ${req.key} is not in the chapter's recorded plan`);
    }
    const doc = parseUserMessage(req.body.messages[0].content);
    const stem = doc.module;
    if (doc.chapter !== chapterDir || !req.key.startsWith(`${chapterDir}/${stem}/`)) {
      throw refusal('stale-presented', `request ${req.key} is not for ${chapterDir}/${stem}`);
    }
    const unit = unitByStem.get(stem);
    if (!unit)
      throw refusal('stale-presented', `request ${req.key}: ${chapterDir} has no unit ${stem}`);
    const items = new Map(unit.pair.items.map((it) => [it.segmentId, it]));
    for (const s of doc.segments) {
      const it = items.get(s.id);
      if (!it || it.occurrences[0].en !== s.en || it.occurrences[0].is !== s.is) {
        throw refusal(
          'stale-presented',
          `request ${req.key}: segment ${s.id} is not what the model saw`
        );
      }
    }
    c.segmentsPresented += doc.segments.length;
    const base = { requestKey: req.key, runId: req.runId, module: stem };

    if (!req.response) {
      for (const s of doc.segments) unanswered.add(s.id);
      tally(c.requestProblems, REQUEST_ERROR);
      gateLog.push({
        ...base,
        kind: 'request',
        problem: REQUEST_ERROR,
        errors: req.errors.map((e) => e.stage),
      });
      continue;
    }
    const parsed = parseTermPassResponse({
      message: req.response.response,
      requestKey: req.key,
      presented: doc.segments.map((s) => ({ segmentId: s.id, rulingIds: s.rulings })),
      rulingsById,
    });
    if (parsed.problem) {
      for (const s of doc.segments) unanswered.add(s.id);
      if (parsed.problem === 'response-truncated') truncatedKeys.add(req.key);
      tally(c.requestProblems, parsed.problem);
      gateLog.push({ ...base, kind: 'request', problem: parsed.problem });
      continue;
    }
    // A request whose answer skipped a segment it was shown did not review that segment; its
    // other segments still go through the gate below.
    if (isUsableParse(parsed)) usableKeys.add(req.key);
    for (const f of parsed.flags) {
      flags.push({ ...base, ...f });
      tally(c.flagsByKind, f.kind);
      if (f.opId) {
        c.opsProposed += 1;
        c.unclearConverted += 1;
      }
    }
    for (const s of parsed.senses) senses.push({ ...base, ...s });
    for (const id of parsed.missing) {
      unanswered.add(id);
      c.segmentsMissing += 1;
      gateLog.push({ ...base, kind: 'missing', segmentId: id });
    }
    // An answer entry for a segment the request did not show, or a second entry for one it
    // did: its ops are in `rejected` (below); the entry itself, flags and senses included, is
    // kept here so nothing the model said disappears from the record.
    for (const d of parsed.dropped) {
      c.entriesDropped += 1;
      gateLog.push({ ...base, kind: 'dropped', ...d });
    }
    for (const r of parsed.rejected) {
      c.opsProposed += 1;
      c.rejected += 1;
      for (const reason of r.reasons) tally(c.rejectedByReason, reason);
      rejectedByStem.set(stem, rejectedByStem.get(stem) + 1);
      // The model's op in the gate's shape, so every gate-log line reads the same way.
      const op = {
        opId: r.opId,
        category: r.op.category,
        rulingId: r.op.ruling,
        sense: r.op.sense ?? null,
        find: r.op.find,
        replace: r.op.replace,
        reason: r.op.reason,
      };
      gateLog.push({
        ...base,
        kind: 'op',
        segmentId: r.segmentId,
        opId: r.opId,
        op,
        verdict: 'rejected',
        reasons: r.reasons,
        by: 'runner',
      });
    }

    for (const s of doc.segments) {
      const ops = parsed.segments.get(s.id);
      if (!ops) continue;
      c.segmentsAnswered += 1;
      const item = items.get(s.id);
      const preFailed = new Set([
        ...parsed.rejected.filter((r) => r.segmentId === s.id).map((r) => r.op.ruling),
        ...parsed.flags.filter((f) => f.segmentId === s.id && f.opId).map((f) => f.rulingId),
      ]);
      // A flag the model raised itself on a ruling, with a "make no edit" kind: that ruling's
      // operations in this segment are withdrawn, whatever the gate would say of them.
      // A flag naming NO ruling withdraws every ruling's ops in the segment (over-refusal is the
      // acceptable direction; the model said "no edit here").
      const flagged = new Map();
      for (const f of parsed.flags) {
        if (f.segmentId !== s.id || f.opId || !WITHDRAWING_FLAG_KINDS.includes(f.kind)) continue;
        const rulings = f.rulingId === null ? ops.map((o) => o.rulingId) : [f.rulingId];
        for (const id of rulings) if (!flagged.has(id)) flagged.set(id, f.kind);
      }
      // A second entry for the segment makes the answer ambiguous: its ops were rejected
      // (response-duplicate-segment) and its flags and senses are not read, so withdraw every
      // op of the segment rather than apply half an answer.
      if (
        parsed.dropped.some(
          (d) => d.segmentId === s.id && d.reason === 'response-duplicate-segment'
        )
      ) {
        for (const o of ops) preFailed.add(o.rulingId);
      }
      const g = gateWithGroups({ ops, item, chapterDir, rulingsById, preFailed, flagged });
      c.opsProposed += ops.length;
      for (const op of g.accepted) {
        c.accepted += 1;
        tally(c.acceptedByCategory, op.category);
        gateLog.push({
          ...base,
          kind: 'op',
          segmentId: s.id,
          opId: op.opId,
          op,
          verdict: 'accepted',
          reasons: [],
        });
      }
      for (const r of g.rejected) {
        c.rejected += 1;
        for (const reason of r.reasons) tally(c.rejectedByReason, reason);
        rejectedByStem.set(stem, rejectedByStem.get(stem) + 1);
        gateLog.push({
          ...base,
          kind: 'op',
          segmentId: s.id,
          opId: r.op.opId,
          op: r.op,
          verdict: 'rejected',
          reasons: r.reasons,
          // 'runner' only when the runner alone refused it; a gate reason makes it the gate's.
          by: r.reasons.every((x) => RUNNER_WITHDRAWALS.has(x)) ? 'runner' : 'gate',
          ...(r.perOccurrence ? { perOccurrence: r.perOccurrence } : {}),
          ...(r.flag ? { flag: r.flag } : {}),
        });
      }
      g.occurrences.forEach((o, k) => {
        const occ = item.occurrences[k];
        if (o.accepted.length === 0) return;
        const records = chainChanges({
          stem,
          segmentId: s.id,
          occurrence: occ.occurrence,
          before: occ.is,
          accepted: o.accepted,
          after: o.after,
          runId: req.runId,
        });
        changesByStem.get(stem).set(occ.key, records);
        finalByStem.get(stem).set(occ.key, {
          segmentId: s.id,
          occurrence: occ.occurrence,
          before: occ.is,
          after: o.after,
        });
      });
    }
  }

  const units = inputs.map((u) => {
    const finals = finalByStem.get(u.stem);
    const order = new Map(u.base.parsed.records.map((r, i) => [r.key, i]));
    const keys = [...finals.keys()].sort((a, b) => order.get(a) - order.get(b));
    const edits = keys.map((k) => finals.get(k));
    const text = edits.length ? applyBodyEdits(u.base.parsed, edits).text : u.base.parsed.text;
    const changes = keys.flatMap((k) => changesByStem.get(u.stem).get(k));
    return { stem: u.stem, text, changes, rejected: rejectedByStem.get(u.stem) };
  });

  const first = runs[0];
  const revision = {
    layer1Commit: first.termPass.layer1Commit,
    rulingSet: { path: rulingSet.path, sha256: rulingSet.sha256 },
    prompt: { path: prompt.path, sha256: prompt.sha256 },
    model: first.run.model,
    sdk: first.run.sdk,
    anthropicVersion,
    harnessCommit: applyCommit,
    runIds: runs.map((r) => r.runId),
  };
  const counts = {
    requests: c.requests,
    requestProblems: sortedObject(c.requestProblems),
    segmentsPresented: c.segmentsPresented,
    segmentsAnswered: c.segmentsAnswered,
    segmentsMissing: c.segmentsMissing,
    entriesDropped: c.entriesDropped,
    opsProposed: c.opsProposed,
    accepted: c.accepted,
    rejected: c.rejected,
    unclearConverted: c.unclearConverted,
    acceptedByCategory: sortedObject(c.acceptedByCategory),
    rejectedByReason: sortedObject(c.rejectedByReason),
    flagsByKind: sortedObject(c.flagsByKind),
    changes: units.reduce((n, u) => n + u.changes.length, 0),
    occurrencesChanged: [...finalByStem.values()].reduce((n, m) => n + m.size, 0),
  };
  // Coverage against the chapter's WHOLE plan (recorded before any --limit): a request that
  // was never sent, errored, or came back truncated, refused or unparseable reviewed nothing,
  // and without this an unreviewed segment reads like one the model saw and left alone.
  const requestsMissing = plannedKeys.filter((k) => !usableKeys.has(k)).sort(byString);
  const coverage = {
    requestsPlanned: plannedKeys.length,
    requestsUsable: plannedKeys.length - requestsMissing.length,
    requestsMissing,
    requestsTruncated: requestsMissing.filter((k) => truncatedKeys.has(k)).length,
    segmentsUnanswered: [...unanswered].sort(byString),
    complete: requestsMissing.length === 0,
  };
  const summary = {
    schema: APPLY_SCHEMA,
    book: path.basename(bookDir),
    chapterDir,
    runIds: revision.runIds,
    layer1Commit: revision.layer1Commit,
    rulingSet: revision.rulingSet,
    prompt: revision.prompt,
    model: first.run.model,
    effort: first.run.effort,
    maxTokens: first.run.max_tokens,
    applyCommit,
    units: prints,
    counts,
    coverage,
  };
  return { chapterDir, units, revision, gateLog, flags, senses, counts, coverage, summary, inputs };
}

/**
 * Count a finished run's answers that apply could not use (isUsableParse), by reason: no
 * response, a request problem, or segments left unanswered. The CLI's stop rule calls this
 * after each chapter, so "usable" means the same before more money is spent as at apply.
 * @param {{ recordsDir: string, runId: string, rulingsById: Map<string, object> }} args
 * @returns {{ checked: number, unusable: number, byReason: Record<string, number> }}
 */
export function unusableAnswers({ recordsDir, runId, rulingsById }) {
  const r = loadRunRecords({ recordsDir, runId });
  const byReason = new Map();
  let checked = 0;
  for (const req of pickResponses([r])) {
    checked += 1;
    if (!req.response) {
      tally(byReason, REQUEST_ERROR);
      continue;
    }
    const doc = parseUserMessage(req.body.messages[0].content);
    const parsed = parseTermPassResponse({
      message: req.response.response,
      requestKey: req.key,
      presented: doc.segments.map((s) => ({ segmentId: s.id, rulingIds: s.rulings })),
      rulingsById,
    });
    if (parsed.problem) tally(byReason, parsed.problem);
    else if (!isUsableParse(parsed)) tally(byReason, 'segments-unanswered');
  }
  const unusable = [...byReason.values()].reduce((n, k) => n + k, 0);
  return { checked, unusable, byReason: sortedObject(byReason) };
}

// ── Writing ──────────────────────────────────────────────────────────────────────────────

function appliedDir(bookDir, chapterDir) {
  if (typeof bookDir !== 'string' || !path.isAbsolute(bookDir)) {
    throw refusal('bad-book-dir', `bookDir must be absolute, got ${bookDir}`);
  }
  const book = path.resolve(bookDir);
  if (path.basename(path.dirname(book)) !== 'books')
    throw refusal('bad-book-dir', `${bookDir} is not books/<slug>`);
  assertBookSlug(path.basename(book));
  if (!CHAPTER_DIR_RE.test(String(chapterDir)))
    throw refusal('bad-chapter-dir', String(chapterDir));
  return path.join(book, 'ai-review', APPLIED_DIR, chapterDir);
}

const jsonl = (rows) => rows.map((r) => `${JSON.stringify(r)}\n`).join('');

function writeAtomic(file, data) {
  const tmp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`
  );
  fs.writeFileSync(tmp, data, { flag: 'wx' });
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

/**
 * Write the chapter: layer 2 (mt-layers.js `writeRevisedChapter`) and the gate log, flags,
 * sense judgements and summary under `books/<slug>/ai-review/applied/<chapterDir>/`.
 * Refuses to replace an existing file unless `overwrite` (both checks happen before the first
 * write).
 * @returns {{ layer2: string[], applied: string[] }} written paths, relative to bookDir
 */
export function writeApplied({ bookDir, chapterDir, result, overwrite = false }) {
  const dir = appliedDir(bookDir, chapterDir);
  const files = [
    [APPLIED_FILES.gate, jsonl(result.gateLog)],
    [APPLIED_FILES.flags, jsonl(result.flags)],
    [APPLIED_FILES.senses, jsonl(result.senses)],
    [APPLIED_FILES.summary, `${JSON.stringify(result.summary, null, 2)}\n`],
  ].map(([name, data]) => ({ file: path.join(dir, name), data }));
  if (!overwrite) {
    const existing = files.filter((f) => fs.existsSync(f.file));
    if (existing.length) {
      throw refusal(
        'destination-exists',
        `${existing.map((f) => path.relative(bookDir, f.file)).join(', ')} already exist`
      );
    }
    const revisedDir = path.join(bookDir, LAYER_DIRS.revised, chapterDir);
    if (fs.existsSync(revisedDir) && fs.readdirSync(revisedDir).length > 0) {
      throw refusal(
        'destination-exists',
        `${path.relative(bookDir, revisedDir)} already holds files`
      );
    }
  }
  const layer2 = writeRevisedChapter({
    bookDir,
    chapterDir,
    units: result.units,
    revision: result.revision,
    overwrite,
  }).written;
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) writeAtomic(f.file, f.data);
  return { layer2, applied: files.map((f) => path.relative(bookDir, f.file)) };
}

// ── The reviewer's report ────────────────────────────────────────────────────────────────

const quote = (s) => `> ${String(s).replace(/\n/g, ' ')}`;

/** One line saying how much of the chapter's plan the runs actually reviewed. */
export function coverageLine(coverage) {
  return (
    `coverage: ${coverage.requestsUsable} of ${coverage.requestsPlanned} planned requests usable` +
    (coverage.complete
      ? ''
      : ` (${coverage.requestsMissing.length} not reviewed; ${coverage.segmentsUnanswered.length} ` +
        'presented segments unanswered)')
  );
}

/**
 * A markdown report of one apply: counts, then every segment with an operation, a flag or a
 * sense judgement, showing English, Icelandic before and after, and each verdict.
 * @param {ReturnType<typeof applyChapter>} result
 * @returns {string}
 */
export function renderReport(result) {
  const { counts, summary } = result;
  const lines = [
    `# Term pass, ${summary.book} ${summary.chapterDir}: dry-run report`,
    '',
    `Runs ${summary.runIds.join(', ')}; model ${summary.model}, effort ${summary.effort}; ruling set ${summary.rulingSet.sha256.slice(0, 12)}; prompt ${summary.prompt.sha256.slice(0, 12)}; layer 1 at ${summary.layer1Commit.slice(0, 12)}.`,
    '',
    coverageLine(result.coverage),
    ...(result.coverage.complete
      ? []
      : ['', `Not reviewed: ${result.coverage.requestsMissing.join(', ')}.`]),
    '',
    '| | |',
    '|---|---|',
    ...Object.entries(counts).map(
      ([k, v]) => `| ${k} | ${typeof v === 'object' ? JSON.stringify(v) : v} |`
    ),
    '',
  ];
  const bySeg = new Map();
  const touch = (id) => {
    if (!bySeg.has(id)) bySeg.set(id, { ops: [], flags: [], senses: [] });
    return bySeg.get(id);
  };
  for (const g of result.gateLog) if (g.kind === 'op') touch(g.segmentId).ops.push(g);
  for (const f of result.flags) touch(f.segmentId).flags.push(f);
  for (const s of result.senses) touch(s.segmentId).senses.push(s);
  const items = new Map();
  for (const u of result.inputs) for (const it of u.pair.items) items.set(it.segmentId, it);
  const finals = new Map();
  for (const u of result.units)
    for (const ch of u.changes) finals.set(`${ch.segmentId}#${ch.occurrence}`, ch.after);
  for (const [id, seg] of [...bySeg].sort(([a], [b]) => byString(a, b))) {
    const it = items.get(id);
    lines.push(`## ${id}`, '');
    if (it) {
      const occ = it.occurrences[0];
      lines.push('**EN**', quote(occ.en), '', '**IS before**', quote(occ.is), '');
      const after = finals.get(`${id}#${occ.occurrence}`);
      if (after) lines.push('**IS after**', quote(after), '');
    }
    for (const g of seg.ops) {
      const o = g.op;
      const mark = g.verdict === 'accepted' ? '✔' : `✘ ${g.reasons.join(', ')}`;
      lines.push(
        `- ${mark} — ${o.category} \`${o.rulingId}\`${o.sense ? ` (${o.sense})` : ''}: \`${o.find}\` → \`${o.replace}\` — ${o.reason}`
      );
    }
    for (const f of seg.flags) {
      lines.push(
        `- ⚑ ${f.kind}${f.rulingId ? ` \`${f.rulingId}\`` : ''}: ${f.note}${f.proposed ? ` (proposed \`${f.proposed.find}\` → \`${f.proposed.replace}\`)` : ''}`
      );
    }
    for (const s of seg.senses)
      lines.push(`- sense \`${s.rulingId}\`: ${s.sense}${s.valid ? '' : ' (INVALID)'}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
