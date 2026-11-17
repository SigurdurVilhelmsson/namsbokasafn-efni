/**
 * prescreen-response.js — parses one recorded pre-screen answer into per-row verdicts and judges
 * the control rows against their pre-registered expected answers (c19; spec §7). Pure.
 */
import { readDocument } from './response-document.js';

/**
 * @typedef {{ verdict: 'fine'|'flag', kind: string|null, reason: string, proposed: string[],
 *   rightSenses: string|null }} Verdict
 */

/**
 * Parse a model message into verdicts keyed by presented id.
 * An entry is dropped as unknown-id, duplicate-id, flag-without-kind or fine-with-kind.
 * @param {{ message: object|null, presentedIds: string[], schema: object }} args
 * @returns {{ problem: string|null, verdicts: Map<string, Verdict>, missing: string[],
 *   dropped: Array<{id: string, reason: string}> }}
 */
export function parsePrescreenResponse({ message, presentedIds, schema }) {
  const verdicts = new Map();
  const dropped = [];
  const { problem, document } = readDocument(message, schema);
  if (problem) return { problem, verdicts, missing: [...presentedIds], dropped };
  const presented = new Set(presentedIds);
  const seen = new Set();
  for (const entry of document.rows) {
    const { id } = entry;
    if (!presented.has(id)) dropped.push({ id, reason: 'unknown-id' });
    else if (seen.has(id)) dropped.push({ id, reason: 'duplicate-id' });
    else if (entry.verdict === 'flag' && entry.kind === null)
      dropped.push({ id, reason: 'flag-without-kind' });
    else if (entry.verdict === 'fine' && entry.kind !== null)
      dropped.push({ id, reason: 'fine-with-kind' });
    else {
      verdicts.set(id, {
        verdict: entry.verdict,
        kind: entry.kind,
        reason: entry.reason,
        proposed: entry.proposed,
        rightSenses: entry.rightSenses,
      });
    }
    seen.add(id);
  }
  return {
    problem: null,
    verdicts,
    missing: presentedIds.filter((id) => !verdicts.has(id)),
    dropped,
  };
}

/**
 * Judge the control rows. Never matches on a control's name (ruling P8): a `flag` control passes
 * on a flag whose kind is in `flagKinds` when the key gives one, else on any flag; a `fine`
 * control passes on `fine`; a control with no verdict is unjudged and fails; an `expected` that is
 * neither `flag` nor `fine` is `bad-expected` and fails. Fails closed: `pass` needs at least one
 * control, so a key with none does not pass vacuously.
 * @param {{ verdicts: Map<string, Verdict>, key: Record<string, object> }} args
 * @returns {{ pass: boolean, results: Array<{id: string, name: string|undefined,
 *   expected: string, got: string, ok: boolean}> }}
 */
export function judgeControls({ verdicts, key }) {
  const results = Object.entries(key)
    .filter(([, e]) => e.kind === 'control')
    .map(([id, e]) => {
      const base = { id, name: e.name, expected: e.expected };
      if (e.expected !== 'flag' && e.expected !== 'fine')
        return { ...base, got: 'bad-expected', ok: false };
      const v = verdicts.get(id);
      if (!v) return { ...base, got: 'unjudged', ok: false };
      const ok =
        e.expected === 'flag'
          ? v.verdict === 'flag' && (!e.flagKinds || e.flagKinds.includes(v.kind))
          : v.verdict === 'fine';
      return { ...base, got: v.verdict, ok };
    });
  return { pass: results.length > 0 && results.every((r) => r.ok), results };
}
