#!/usr/bin/env node
/**
 * prescreen-book-layer-input — join [USER]'s c19 rulings to concept ids and write the
 * committed book-layer input file.
 *
 *   node tools/ai-review/prescreen-book-layer-input.js --rulings <json> --census <json> \
 *       --verdicts <json> --out <json>
 *
 * Spec: docs/superpowers/specs/2026-11-19-book-glossary-layer-design.md §5.5 step 1.
 *
 * The rulings and the census are PRIVATE inputs; only the changing rulings' actions are
 * written. A `keep` ruling contributes nothing, and the census is never copied.
 * Refusals (throw, nothing written): a ruling count other than 212, a changing ruling with
 * zero or several census rows, an unknown choice or SKILYRÐI/AÐEINS prefix.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

export const EXPECTED_RULING_COUNT = 212;
const BOOK = 'efnafraedi-2e';
const IN_SCOPE = new Set(['chemistry', 'physics', 'biology']);
const CHOICES = new Set(['keep', 'replace', 'remove', 'phrases']);

const C234_8 = {
  kind: 'entry',
  rulingId: 'C234-8',
  english: 'standard cell potential',
  entry: {
    english: ['standard cell potential', 'standard cell potentials'],
    icelandic: 'staðalíspenna',
    replaces: [],
  },
  comment:
    'the official chemistry glossary has standard cell potential = staðalíspenna ([USER], 2026-11-18; register §C234 ⑧)',
};

/**
 * The comment as committed: [USER]'s ruling text, with the attribution phrase
 * " með Claude" removed ([USER], 2026-11-19). The input is public; nothing else is changed.
 * @param {string|undefined} comment
 * @returns {string|undefined}
 */
const publicComment = (comment) =>
  typeof comment === 'string' ? comment.replace(/ með Claude\b/g, '') : comment;
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function removeKind(rulingId, comment) {
  if (rulingId === 'r032') return 'exclude-concept';
  const c = comment ?? '';
  if (c.startsWith('SKILYRÐI:')) return 'exclude-headword';
  if (c.startsWith('AÐEINS')) return 'exclude-concept';
  throw new Error(`${rulingId}: unknown remove prefix`);
}

/**
 * @param {{rulings: object, census: object, verdicts: object}} inputs
 * @param {{expectedCount?: number}} [opts]
 * @returns {object} the input document without the file hashes (the CLI adds them)
 */
export function buildInput(
  { rulings, census, verdicts },
  { expectedCount = EXPECTED_RULING_COUNT } = {}
) {
  const answers = rulings.answers ?? {};
  const ids = Object.keys(answers);
  if (ids.length !== expectedCount) {
    throw new Error(`rulings hold ${ids.length} answers, expected ${expectedCount}`);
  }
  const population = new Map(verdicts.population.map((p) => [p.id, p]));
  const rows = census.rows;

  // The verdicts' `group` is a coarse bucket (chemistry | physicsBiology); the ruling's own
  // `group` is the census domain (chemistry | physics | biology). The join key is the verdicts
  // row's english and icelandic (the committed record) plus the ruling's domain; the ruling must
  // agree on english and the bucket. The ruling's own icelandic is display text saved by the review
  // page and is NOT compared: r072's copy carries a typo the verdicts and the census do not.
  const bucket = (domain) => (domain === 'chemistry' ? 'chemistry' : 'physicsBiology');
  const joinRow = (id) => {
    const a = answers[id];
    const p = population.get(id);
    if (!p) throw new Error(`${id}: not in the verdicts population`);
    if (p.english !== a.english || p.group !== bucket(a.group)) {
      throw new Error(`${id}: ruling and verdicts population row disagree`);
    }
    const hits = rows.filter(
      (r) => r.english === p.english && r.icelandic === p.icelandic && r.domain === a.group
    );
    if (hits.length !== 1) {
      throw new Error(
        `${id}: census holds ${hits.length} rows for (english, icelandic, domain=${a.group}), need 1`
      );
    }
    return hits[0];
  };

  const actions = [];
  for (const id of ids) {
    const a = answers[id];
    if (!CHOICES.has(a.choice)) throw new Error(`${id}: unknown choice ${a.choice}`);
    if (a.choice === 'keep') continue;
    const row = joinRow(id);
    const base = {
      rulingId: id,
      english: row.english,
      conceptId: row.conceptId,
      icelandicAtCensus: row.icelandic,
      domainAtCensus: row.domain,
      choice: a.choice,
      flagKind: a.kind,
      comment: publicComment(a.comment),
      ruledAt: a.savedAt,
    };
    if (a.choice === 'remove') {
      const kind = removeKind(id, a.comment);
      if (kind === 'exclude-headword') {
        const { conceptId, ...rest } = base;
        void conceptId;
        actions.push({ kind, ...rest });
      } else {
        actions.push({ kind, ...base });
      }
    } else if (a.choice === 'replace') {
      actions.push({
        kind: 'entry',
        ...base,
        entry: { english: [row.english], icelandic: a.text, replaces: [row.conceptId] },
      });
    } else {
      // phrases: exclude the row for the bare headword, add the phrase unless already in scope
      actions.push({ kind: 'exclude-concept', ...base });
      const icelandic = a.phraseIcelandic ?? row.icelandic;
      const present = rows.some(
        (r) => r.english === a.text && r.icelandic === icelandic && IN_SCOPE.has(r.domain)
      );
      if (!present) {
        actions.push({
          kind: 'entry',
          rulingId: id,
          english: a.text,
          choice: a.choice,
          flagKind: a.kind,
          comment: publicComment(a.comment),
          ruledAt: a.savedAt,
          entry: { english: [a.text], icelandic, replaces: [] },
        });
      }
    }
  }
  actions.push({ ...C234_8 });

  const counts = {};
  for (const a of actions) counts[a.kind] = (counts[a.kind] ?? 0) + 1;
  return { schema: 'c19-book-layer-input/1', book: BOOK, counts, actions };
}

function main() {
  const { values } = parseArgs({
    options: {
      rulings: { type: 'string' },
      census: { type: 'string' },
      verdicts: { type: 'string' },
      out: { type: 'string' },
    },
    strict: true,
  });
  for (const k of ['rulings', 'census', 'verdicts', 'out']) {
    if (!values[k]) throw new Error(`--${k} is required`);
  }
  const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
  const doc = buildInput({
    rulings: read(values.rulings),
    census: read(values.census),
    verdicts: read(values.verdicts),
  });
  const { schema, book, counts, actions } = doc;
  const out = {
    schema,
    book,
    rulingsSha256: sha256(values.rulings),
    censusSha256: sha256(values.census),
    verdictsSha256: sha256(values.verdicts),
    counts,
    actions,
  };
  fs.writeFileSync(values.out, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ out: values.out, counts }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = 1; // failure default; cleared on success
  try {
    main();
    process.exitCode = 0;
  } catch (err) {
    console.error(`prescreen-book-layer-input: ${err.message}`);
  }
}
