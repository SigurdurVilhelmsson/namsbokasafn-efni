#!/usr/bin/env node
/**
 * Record [USER]'s rulings on a book's pending pre-clean-break segment edits
 * (plan 2026-10-10, item 1.6; register §C203).
 *
 * Approves the rows ruled `apply` and supersedes the rest of the frozen set, in one
 * transaction. It writes what the approve route writes (status, the reviewer's provider id
 * and username, a note, reviewed_at, and one segment_edit_approved activity row per
 * approval) and NOTHING ELSE:
 *   - it never applies an edit: applied_at stays NULL and applyApprovedEdits is not called.
 *     Where approved rows reach the text is plan stage 2 / 4.2's question;
 *   - it sends no notifications: editing is held, and the editors hear the timeline
 *     separately.
 *
 * Fails closed. Every check runs, the report names each failure, and any failure means
 * nothing is written:
 *   - the apply hold must be in place for the book (PR #556). Without it an approved row is
 *     one click from an apply that writes the module's whole base text over the September
 *     MT (§C203);
 *   - the input file must be the one the rulings name (sha256), and the rulings must cover it
 *     exactly: every frozen row once, in the set its frozen class belongs to;
 *   - every ruled row must still be pending and unchanged since it was frozen, and an
 *     approval must not land on a segment that already has an approved edit (the approve
 *     route's own guard);
 *   - the reviewer must be an active admin or head editor.
 *
 * Usage (dry run unless --write; relative paths resolve against the repository root):
 *   node server/scripts/close-pending-edits.js --book efnafraedi-2e \
 *     --rulings experiments/terminology-consistency/results/2026-10-23/pending-answers-2026-10-23.json \
 *     --input experiments/terminology-consistency/results/2026-10-17/pending-edits-2026-10-17.json \
 *     --reviewer <the name you sign in with> [--write]
 *
 * Exit codes: 0 done (or a clean dry run), 1 refused, 2 usage.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const VIA = 'server/scripts/close-pending-edits.js';
const REVIEWER_ROLES = new Set(['admin', 'head-editor']);

/** The frozen class each ruling set must hold. */
const CLASS_OF_SET = {
  apply: 'clean',
  'already-present': 'already-present',
  'base-changed': 'base-changed',
};

/** Reviewer notes, in Icelandic like the editor's own (cf. 'Leyst úr gildi af nýrri samþykktri breytingu'). */
const NOTES = {
  apply: (date) => `Samþykkt samkvæmt úrskurði verkefnisstjóra (1.6, ${date})`,
  'already-present': () => 'Leyst úr gildi: breytingin er þegar í septemberþýðingunni (1.6)',
  'base-changed': () =>
    'Leyst úr gildi: gerð á eldri vélþýðingu og verður athugasemd til ritstjóra (1.6, liður 2.2)',
};

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{book: string, rulings: object, input: {book: string, rows: object[]},
 *   inputSha256: string, reviewer: string, write: boolean,
 *   holdFor: (book: string) => object|null}} opts
 * @returns {{ok: boolean, mode: string, refused: string[], plan: object, otherPending: number,
 *   wrote?: object, after?: object[]}}
 */
function closePendingEdits(db, { book, rulings, input, inputSha256, reviewer, write, holdFor }) {
  const refused = [];
  const refuse = (msg) => refused.push(msg);

  const hold = holdFor(book);
  if (!hold) {
    refuse(
      `the apply hold is not in place for ${book}: deploy PR #556 first. Without it an ` +
        `approved row is one click from an apply over the September MT (§C203)`
    );
  }

  if (!rulings?.input?.sha256 || rulings.input.sha256 !== inputSha256) {
    refuse('the input file is not the one the rulings name (its sha256 differs)');
  }
  if (input?.book !== book) refuse(`the frozen input is for ${input?.book}, not ${book}`);

  const answers = rulings?.answers || [];
  const sets = {
    apply: answers.map((a) => a.id),
    'already-present': rulings?.notAsked?.['already-present']?.ids || [],
    'base-changed': rulings?.notAsked?.['base-changed']?.ids || [],
  };
  for (const a of answers) {
    if (a.choice !== 'apply')
      refuse(`row ${a.id} is ruled "${a.choice}"; this records only "apply"`);
  }

  const ruled = new Set();
  for (const id of Object.values(sets).flat()) {
    if (ruled.has(id)) refuse(`row ${id} is in more than one set`);
    ruled.add(id);
  }
  const frozen = new Map((input?.rows || []).map((r) => [r.id, r]));
  for (const id of frozen.keys()) if (!ruled.has(id)) refuse(`frozen row ${id} has no ruling`);
  for (const id of ruled) if (!frozen.has(id)) refuse(`ruled row ${id} is not in the frozen input`);
  for (const [set, members] of Object.entries(sets)) {
    for (const id of members) {
      const f = frozen.get(id);
      if (f && f.class !== CLASS_OF_SET[set]) {
        refuse(`row ${id} is frozen as "${f.class}" but ruled in "${set}"`);
      }
    }
  }

  const who = db
    .prepare(
      'SELECT provider_id, provider_username, role, is_active FROM users WHERE provider_username = ?'
    )
    .get(reviewer);
  if (!who) refuse(`no user signs in as ${reviewer}`);
  else if (!who.is_active || !REVIEWER_ROLES.has(who.role)) {
    refuse(`${reviewer} is not an active admin or head editor`);
  }

  const rowOf = db.prepare('SELECT * FROM segment_edits WHERE id = ?');
  for (const id of ruled) {
    const r = rowOf.get(id);
    const f = frozen.get(id);
    if (!r) {
      refuse(`row ${id} does not exist`);
      continue;
    }
    if (r.book !== book) refuse(`row ${id} belongs to ${r.book}`);
    if (r.status !== 'pending') refuse(`row ${id} is ${r.status}, not pending`);
    // The frozen file was written by experiments/terminology-consistency/freeze_pending_edits.py,
    // which strips leading and trailing whitespace from both texts. Compare the same way, or a
    // row whose stored text ends in a space reads as changed when nobody touched it (production
    // row 138, found by the first dry run on 2026-10-25). Whitespace inside the text still counts.
    const edge = (s) => (s ?? '').trim();
    const same =
      f &&
      edge(r.original_content) === edge(f.original) &&
      edge(r.edited_content) === edge(f.edited) &&
      r.segment_id === f.segment &&
      r.module_id === f.module;
    if (f && !same) refuse(`row ${id} changed since it was frozen`);
  }
  const approvedOn = db.prepare(
    `SELECT COUNT(*) AS n FROM segment_edits
      WHERE book = ? AND module_id = ? AND segment_id = ? AND status = 'approved'`
  );
  for (const id of sets.apply) {
    const r = rowOf.get(id);
    if (r && approvedOn.get(book, r.module_id, r.segment_id).n > 0) {
      refuse(`row ${id}'s segment already has an approved edit`);
    }
  }

  const otherPending = db
    .prepare(`SELECT id FROM segment_edits WHERE book = ? AND status = 'pending'`)
    .all(book)
    .filter((r) => !ruled.has(r.id)).length;

  const report = {
    ok: refused.length === 0,
    mode: write ? 'write' : 'dry-run',
    book,
    hold: hold || null,
    refused,
    plan: {
      approve: sets.apply,
      supersede: {
        'already-present': sets['already-present'],
        'base-changed': sets['base-changed'],
      },
    },
    otherPending,
  };
  if (!report.ok || !write) return report;

  const approve = db.prepare(
    `UPDATE segment_edits
        SET status = 'approved', reviewer_id = ?, reviewer_username = ?, reviewer_note = ?,
            reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'`
  );
  const supersede = db.prepare(
    `UPDATE segment_edits
        SET status = 'superseded', reviewer_id = ?, reviewer_username = ?, reviewer_note = ?,
            reviewed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'`
  );
  const activity = db.prepare(
    `INSERT INTO activity_log (type, user_id, username, book, chapter, section, description, metadata)
     VALUES ('segment_edit_approved', ?, ?, ?, ?, ?, ?, ?)`
  );
  const answerOf = new Map(answers.map((a) => [a.id, a]));
  const wrote = { approved: 0, superseded: 0, activity: 0 };

  db.transaction(() => {
    for (const id of sets.apply) {
      const a = answerOf.get(id);
      const note = (a.note || '').trim() || NOTES.apply(String(a.savedAt || '').slice(0, 10));
      if (approve.run(who.provider_id, who.provider_username, note, id).changes !== 1) {
        throw new Error(`row ${id} changed during the write`);
      }
      const r = rowOf.get(id);
      activity.run(
        who.provider_id,
        who.provider_username,
        book,
        r.chapter,
        r.module_id,
        `${who.provider_username} samþykkti breytingu á ${r.module_id}:${r.segment_id}`,
        JSON.stringify({ via: VIA, ruling: '1.6' })
      );
      wrote.approved += 1;
      wrote.activity += 1;
    }
    for (const set of ['already-present', 'base-changed']) {
      for (const id of sets[set]) {
        if (supersede.run(who.provider_id, who.provider_username, NOTES[set](), id).changes !== 1) {
          throw new Error(`row ${id} changed during the write`);
        }
        wrote.superseded += 1;
      }
    }
  })();

  report.wrote = wrote;
  report.after = db
    .prepare(
      `SELECT status, COUNT(*) AS n FROM segment_edits WHERE book = ? GROUP BY status ORDER BY status`
    )
    .all(book);
  return report;
}

/** Unknown arguments are refused, not dropped (CLAUDE.md: parseArgs silently drops them). */
function parse(argv) {
  const args = { write: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--write') args.write = true;
    else if (['--book', '--rulings', '--input', '--reviewer'].includes(a) && argv[i + 1]) {
      args[a.slice(2)] = argv[i + 1];
      i += 1;
    } else return { error: `unknown or incomplete argument: ${a}` };
  }
  for (const k of ['book', 'rulings', 'input', 'reviewer']) {
    if (!args[k]) return { error: `--${k} is required` };
  }
  return args;
}

/** The hold from PR #556, or none. A missing or broken module means no hold: fail closed. */
function realHoldFor() {
  try {
    return require('../lib/applyHold').faithfulWriteHold;
  } catch {
    return () => null;
  }
}

function main() {
  process.exitCode = 1; // a run that reaches no verdict must not read as success
  const args = parse(process.argv.slice(2));
  if (args.error) {
    console.error(
      `${args.error}\nusage: close-pending-edits.js --book <b> --rulings <f> --input <f> --reviewer <name> [--write]`
    );
    process.exitCode = 2;
    return;
  }
  const Database = require('better-sqlite3');
  const resolveDbPath = require('../lib/dbPath');
  const inputBytes = fs.readFileSync(path.resolve(ROOT, args.input));
  const db = new Database(resolveDbPath(), { readonly: !args.write, fileMustExist: true });
  try {
    const report = closePendingEdits(db, {
      book: args.book,
      rulings: JSON.parse(fs.readFileSync(path.resolve(ROOT, args.rulings), 'utf8')),
      input: JSON.parse(inputBytes.toString('utf8')),
      inputSha256: crypto.createHash('sha256').update(inputBytes).digest('hex'),
      reviewer: args.reviewer,
      write: args.write,
      holdFor: realHoldFor(),
    });
    process.stdout.write(JSON.stringify(report, null, 1) + '\n');
    process.exitCode = report.ok ? 0 : 1;
  } finally {
    db.close();
  }
}

if (require.main === module) main();

module.exports = { closePendingEdits };
