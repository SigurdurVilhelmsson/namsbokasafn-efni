/**
 * leftover-forms.js — after a ruling's term operations are accepted in an occurrence, does an
 * old form of that ruling still stand in the after-text? Pilot item i02 (2026-10-29): at high
 * effort the model fixed `millikrafta` and missed the sentence-initial `Millikraftar`.
 *
 * [USER] 2026-10-29: this FLAGS for the editor, and never retries or rejects. It reads the gate's
 * result and changes nothing the gate decided. It finds about 20 per chapter in the ch10 pilot,
 * with false positives (an everyday word sharing a stem), which is why it cannot reject.
 *
 * - Old forms: the stems (chapter-term-check `stemOf`) of the ruling's `competitors` and of
 *   each accepted term operation's `find` (the model's own "this is the old form"; `stemOf`
 *   takes a multi-word find's longest word). Agreement operations are not read: their `find`
 *   is a neighbouring word, not the term.
 * - Words that carry the ruled target are not leftovers (`hitastig` holds `hit-`). As in the
 *   prototype whose rate [USER] saw, "carry" is a stem match on the target's LONGEST word only;
 *   matching every word of a multi-word target would also drop ordinary words that hold a short
 *   second word such as `efni`, hiding leftovers next to them.
 * - The text is what a reader sees (tokens.js `visibleProse`): marker ids and URLs are not read.
 * - Scope, by the register's definition: only rulings with an accepted term operation in this
 *   occurrence. An old form of a ruling the model did not touch there is not looked for.
 */
import { visibleProse } from './tokens.js';
import { isTermOp } from './gate.js';
import { foldUmlaut, stemOf, containsStem } from '../lib/chapter-term-check.js';

const fold = (s) => foldUmlaut(s.toLowerCase());

/**
 * @param {{ after: string,
 *   accepted: Array<{ category: string, rulingId: string, find: string }>,
 *   rulingsById: Map<string, { is: string, competitors?: string[] }> }} args
 * @returns {Array<{ rulingId: string, forms: string[], words: string[] }>} one entry per ruling
 *   with a leftover, in first-accepted order: the old-form stems that matched, and each
 *   matching word of the after-text once, as written
 */
export function leftoverForms({ after, accepted, rulingsById }) {
  const findsByRuling = new Map();
  for (const op of accepted) {
    if (!isTermOp(op.category)) continue;
    if (!rulingsById.has(op.rulingId)) {
      throw new Error(`leftover-forms: accepted op names unknown ruling ${op.rulingId}`);
    }
    if (!findsByRuling.has(op.rulingId)) findsByRuling.set(op.rulingId, []);
    findsByRuling.get(op.rulingId).push(op.find);
  }
  const words = visibleProse(after)
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  const out = [];
  for (const [rulingId, finds] of findsByRuling) {
    const ruling = rulingsById.get(rulingId);
    const target = stemOf(ruling.is);
    const olds = [
      ...new Set([...(ruling.competitors ?? []), ...finds].map((f) => stemOf(String(f)))),
    ].filter(Boolean);
    const forms = new Set();
    const hits = [];
    for (const word of words) {
      const w = fold(word);
      if (target && containsStem(w, target)) continue;
      const matched = olds.filter((st) => containsStem(w, st));
      if (matched.length === 0) continue;
      for (const st of matched) forms.add(st);
      if (!hits.includes(word)) hits.push(word);
    }
    if (hits.length) out.push({ rulingId, forms: [...forms], words: hits });
  }
  return out;
}
