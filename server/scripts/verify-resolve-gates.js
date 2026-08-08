/**
 * B1 acceptance gates 1, 2, 3 and 5, measured against a scratch corpus DB.
 *
 * Usage:
 *   node server/scripts/verify-resolve-gates.js --db /tmp/claude-1000/b1-scratch.db
 *
 * ⚠️ READ-ONLY on the corpus tables. It DOES write registered_books and
 * book_domain_priority into the SCRATCH database, because the import creates the
 * schema but not the books. Never point --db at a real database.
 *
 * Exit: 0 all gates pass · 1 a gate failed · 2 usage or environment error.
 */
const fs = require('fs');
const Database = require('better-sqlite3');
const { BOOK_DOMAIN_PRIORITY } = require('../lib/domains');
const { buildScope, resolve } = require('../lib/conceptResolver');

function parseArgs(argv) {
  let db = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--db') {
      // ⚠️ Do not swallow the NEXT FLAG as a value (B0 finding 5).
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        return { error: '--db needs a path as the next argument' };
      }
      db = argv[++i].trim();
    } else if (a === '-h' || a === '--help') {
      return { help: true };
    } else {
      return { error: `unrecognised argument '${a}' — accepted: --db <path>` };
    }
  }
  return db ? { db } : { error: '--db is required' };
}

/**
 * Register the six books and seed their priorities INTO THE SCRATCH DB.
 *
 * ⚠️ TASK 9 DEFECT FOUND AND FIXED (2026-08-08): the brief's original
 * `INSERT OR IGNORE INTO registered_books (slug, registered_by) VALUES (?, 'gate')`
 * omits `title_is`. The REAL schema — created by the 47 migrations, which is now the
 * ONLY way this table can come into existence here (review finding 5 deleted the
 * `CREATE TABLE IF NOT EXISTS` that used to stand below and contradict it) — declares
 * `title_is TEXT NOT NULL` with no default. SQLite's `OR IGNORE` conflict
 * resolution SILENTLY SWALLOWS a NOT NULL violation — no exception, no row
 * inserted. The very next line does
 *   `const { id } = db.prepare('SELECT id ... WHERE slug = ?').get(slug)`
 * which then destructures `undefined` and throws
 * `TypeError: Cannot destructure property 'id' of 'row' as it is undefined`.
 * Reproduced verbatim against a scratch copy of the real DB, for 'efnafraedi-2e'
 * — the FIRST book Object.entries(BOOK_DOMAIN_PRIORITY) yields, and the one
 * Gates 1 and 2 both depend on. Only 2 of the 6 books (lifraen-efnafraedi,
 * edlisfraedi-2e) are pre-registered by run-concept-import.js's own §C35 seed,
 * so this is not an edge case — it kills the script on the very first book,
 * before Gate 1 ever runs. Fix: supply title_is (the slug itself — this is a
 * synthetic gate registration, `registered_by = 'gate'` already marks it as
 * such, so a real Icelandic title would be misleading, not more correct).
 */
function seedBooks(db) {
  // ⚠️ REVIEW FINDING 5 (2026-08-08) — a `CREATE TABLE IF NOT EXISTS registered_books`
  // used to stand here, and only half the Defect-1 fix had landed: the ledger said
  // "do not re-create the table" but the statement survived. Its shape declared
  // `title_is TEXT` / `registered_by TEXT` — NULLABLE — against migration 003's real
  // `NOT NULL`. It was inert only because the table already exists; against a database
  // lacking it, it would have created the divergent shape and Defect 1's guard would
  // have silently vanished (a row inserted with title_is NULL). A script whose purpose
  // is precise measurement must not carry a false schema claim, so it is deleted and
  // its absence is now LOUD.
  if (
    !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get('registered_books')
  ) {
    throw new Error(
      'registered_books is missing — build the scratch DB with the real migrations first ' +
        "(see the plan's Task 9 prerequisite); this script must never invent the schema"
    );
  }
  const insBook = db.prepare(
    "INSERT OR IGNORE INTO registered_books (slug, title_is, registered_by) VALUES (?, ?, 'gate')"
  );
  const insPrio = db.prepare(
    'INSERT OR REPLACE INTO book_domain_priority (book_id, domain, position) VALUES (?, ?, ?)'
  );
  for (const [slug, domains] of Object.entries(BOOK_DOMAIN_PRIORITY)) {
    insBook.run(slug, slug);
    const { id } = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
    domains.forEach((d, i) => insPrio.run(id, d, i + 1));
  }
}

/** Distinct English strings in scope for a book — gate 3. */
function scopedEnglish(db, slug) {
  const rows = db
    .prepare(
      `SELECT DISTINCT t.text
         FROM concept_term t JOIN concept c ON c.id = t.concept_id
         JOIN book_domain_priority p ON p.domain = c.domain
         JOIN registered_books b ON b.id = p.book_id
        WHERE t.lang = 'en' AND b.slug = ?`
    )
    .all(slug);
  return rows.map((r) => r.text);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Usage: node server/scripts/verify-resolve-gates.js --db <scratch.db>');
    return 0;
  }
  if (args.error) {
    console.error(`error: ${args.error}`);
    return 2;
  }
  if (!fs.existsSync(args.db)) {
    console.error(`error: no such database ${args.db}`);
    return 2;
  }

  const db = new Database(args.db);
  seedBooks(db);
  const failures = [];

  // ── Gate 1: chemistry's fallback returns the four named terms ────────────
  const chemScope = buildScope(db, 'efnafraedi-2e', 0);
  if (chemScope.unscoped) {
    console.error(`GATE 1 FAIL: efnafraedi-2e is ${chemScope.unscoped}`);
    return 1;
  }
  // ⚠️ REVIEW FINDING 2 (2026-08-08) — this gate used to assert only `if (!r.winner)`,
  // which CANNOT SEE THE PROPERTY THE GATE IS NAMED FOR. Demonstrated: inserting a
  // chemistry-domain concept answering 'pH' printed `chemistry @1 -> …`, destroying the
  // fallback, and the gate still exited 0. Naming trap #7 on this branch. It now asserts
  // the (domain, position) PAIR spec §8.1 requires — "each asserted with the domain and
  // position it resolved through".
  //
  // ⚠️ SPEC DIVERGENCE, RECORDED RATHER THAN PAPERED OVER: spec §8.1 predicts pH, bond
  // and carbon dioxide all resolve via BIOLOGY. Measured, `bond` resolves via PHYSICS @2.
  // The fallback claim survives — physics @2 is still past chemistry @1, which is the
  // property that unblocks chemistry — but the spec's specific prediction is wrong, and
  // the results file previously called this "matches expectation" without saying so.
  const GATE1_EXPECTED = {
    pH: ['biology', 3],
    bond: ['physics', 2], // spec §8.1 said biology; measured physics — see above
    'carbon dioxide': ['biology', 3],
    nitrogen: ['physics', 2],
  };
  console.log('── Gate 1: chemistry fallback ──');
  for (const [en, [wantDomain, wantPosition]] of Object.entries(GATE1_EXPECTED)) {
    const r = resolve(db, chemScope, en);
    const via = r.winner
      ? `${r.winner.domain} @${r.winner.position} -> ${r.winner.text}`
      : 'UNRESOLVED';
    console.log(`  ${en.padEnd(16)} ${via}`);
    if (!r.winner) {
      failures.push(`gate1: '${en}' did not resolve`);
      continue;
    }
    if (r.winner.domain !== wantDomain || r.winner.position !== wantPosition) {
      failures.push(
        `gate1: '${en}' resolved via ${r.winner.domain} @${r.winner.position}, ` +
          `expected ${wantDomain} @${wantPosition}` +
          (r.winner.position === 1 ? ' — THE FALLBACK IS GONE' : '')
      );
    }
  }

  // ── Gate 2: the tie census ───────────────────────────────────────────────
  //
  // ⚠️ METHOD MATTERS AS MUCH AS THE NUMBER. §C36 measured 2,001/126/310 for
  // efnafraedi-2e under TWO restrictions, both reproduced here:
  //   (a) restricted to English strings that appear in the book's own 01-source;
  //   (b) a tie counted only in the BEST AVAILABLE domain (a tie at position 3 is
  //       not a tie when something resolved at position 1) — which resolve()
  //       already enforces, since `tied` is only ever populated at `best`.
  // A different number is a FINDING TO EXPLAIN, not a constant to update — but
  // only if the method is the same, so the script prints it.
  console.log('\n── Gate 2: tie census (efnafraedi-2e) ──');
  // ⚠️ TASK 9 DEFECT #2, AND REVIEW FINDING 7 ON TOP OF IT. The brief's printed label
  // said "01-source" while its code read `02-for-mt`; Task 9 changed the LABEL to match
  // the code and booked it as fixing a brief defect — but spec §8.2 mandates `01-source`,
  // so a real deviation from the frozen spec was filed as a correction.
  //
  // ⚠️ RULED 2026-08-08: KEEP `02-for-mt`, and amend the SPEC rather than the script.
  // 02-for-mt holds the extracted EN segments — the exact text the MT glossary is
  // filtered against by filterGlossaryForText, and the text B3/B4 will actually run the
  // resolver over. 01-source is raw CNXML (149 .cnxml against 249 .md), so harvesting it
  // would census markup this resolver never sees. The spec now records this deviation
  // and its reason; script and spec agree again.
  console.log('  method: strings from books/efnafraedi-2e/02-for-mt, exact binary match');
  console.log('          overlapping bigrams (see collectSourceEnglish trap 4)');
  const sourceStrings = collectSourceEnglish('efnafraedi-2e');

  // ⚠️ REVIEW FINDING 6: `outOfScope`-only strings were invisible. A string that matches
  // a concept term but resolves to nothing because every candidate is out of scope is
  // NOT the same as a string that matches nothing at all — D1 makes it a first-class,
  // soft-badged part of Resolution, and conflating the two produced a wrong "% that match
  // any concept term" figure in the results file.
  const census = (strings) => {
    const c = { outright: 0, nominal: 0, real: 0, outOfScopeOnly: 0 };
    for (const en of strings) {
      const r = resolve(db, chemScope, en);
      if (r.tied.length) c.real++;
      else if (r.nominalTie.length) c.nominal++;
      else if (r.winner) c.outright++;
      else if (r.outOfScope.length) c.outOfScopeOnly++;
    }
    return c;
  };

  const g2 = census(sourceStrings);
  console.log(`  strings considered: ${sourceStrings.length}`);
  console.log(`  outright ${g2.outright} · nominal ${g2.nominal} · real ${g2.real}`);
  console.log(`  out-of-scope only (D1, resolves to nothing in THIS book): ${g2.outOfScopeOnly}`);
  console.log('  register recorded: outright 2001 · nominal 126 · real 310');

  // ── Gate 2 control: the census must be RANK-SENSITIVE (spec §8 Controls) ──
  //
  // ⚠️ REVIEW FINDING 4 — the spec mandates "re-run with `rank` collapsed, and the
  // numbers MUST change. If they do not, the census is not measuring what it claims."
  // THAT CONTROL IS VOID ON THIS CORPUS, and running it naively produces a FALSE
  // ACCUSATION: conceptFromEntry.js assigns rank in array order and import-concepts.js
  // inserts in that same order, so autoincrement `id` rises in lockstep with `rank` and
  // `ORDER BY rank ASC, id ASC` is identical to `ORDER BY id ASC`. Measured: of 17,356
  // concepts with 2+ Icelandic terms, collapsing rank moves the head form in ZERO.
  //
  // So the control is run in the form that CAN move it — REVERSING rank within each
  // concept — inside a transaction that is always rolled back, which keeps the scratch
  // DB idempotent (two full runs still diff to nothing).
  db.exec('BEGIN');
  db.exec(
    `UPDATE concept_term SET rank =
       (SELECT MAX(t2.rank) + MIN(t2.rank) FROM concept_term t2
         WHERE t2.concept_id = concept_term.concept_id AND t2.lang = 'is') - rank
      WHERE lang = 'is'`
  );
  const reversed = census(sourceStrings);
  db.exec('ROLLBACK');
  console.log(
    `  CONTROL, rank reversed: outright ${reversed.outright} · ` +
      `nominal ${reversed.nominal} · real ${reversed.real}`
  );
  const rankMoved =
    reversed.outright !== g2.outright ||
    reversed.nominal !== g2.nominal ||
    reversed.real !== g2.real;
  if (!rankMoved) {
    failures.push('control: the census is NOT rank-sensitive — it is not measuring what it claims');
  }

  // ── Gate 3: scope sizes ──────────────────────────────────────────────────
  // ⚠️ REVIEW FINDING 3 (2026-08-08) — this gate printed its measurement and, on the
  // very next line, a hardcoded target, AND NEVER COMPARED THEM. Demonstrated: deleting
  // 18,489 anatomy-physiology EN terms collapsed liffraedi-2e from 47,568 to 32,479
  // (−32%), printed directly above the number it missed, exit 0. Unlike gate 5 — which
  // spec §8.5 frames as a measurement with "two outcomes, both useful" — this gate names
  // an explicit target, so failing to compare is a defect, not a design choice.
  const GATE3_EXPECTED = { 'liffraedi-2e': 47568, 'efnafraedi-2e': 19749 };
  console.log('\n── Gate 3: scoped corpus size ──');
  for (const [slug, want] of Object.entries(GATE3_EXPECTED)) {
    const n = scopedEnglish(db, slug).length;
    console.log(`  ${slug.padEnd(18)} ${n} distinct English terms (register: ${want})`);
    if (n !== want) failures.push(`gate3: ${slug} measured ${n}, register recorded ${want}`);
  }

  // ── Gate 5: the term-less-candidate population ───────────────────────────
  //
  // B0's finding 4 is the model: quantify the hazard rather than assume it. If
  // this is 0 the §6 filter is a deliberate latent-case pin; if it is non-zero
  // gates 1 and 2 are NOT independent of it.
  console.log('\n── Gate 5: term-less candidates ──');
  const termless = db
    .prepare(
      `SELECT COUNT(*) AS n FROM concept c
        WHERE EXISTS (SELECT 1 FROM concept_term t WHERE t.concept_id = c.id AND t.lang = 'en')
          AND NOT EXISTS (SELECT 1 FROM concept_term t WHERE t.concept_id = c.id AND t.lang = 'is')`
    )
    .get().n;
  console.log(`  concepts with an EN term and NO IS term: ${termless}`);
  console.log(
    termless === 0
      ? '  -> the §6 filter is a LATENT-case pin. Say so in the spec.'
      : '  -> the case is LIVE. Gates 1 and 2 are not independent of the filter.'
  );

  // ── Controls ─────────────────────────────────────────────────────────────
  console.log('\n── Controls ──');
  const unreg = buildScope(db, 'engin-slik-bok', 0);
  const noPrio = (() => {
    db.prepare(
      "INSERT OR IGNORE INTO registered_books (slug, title_is, registered_by) VALUES ('ctrl-bare', 'ctrl-bare', 'gate')"
    ).run();
    return buildScope(db, 'ctrl-bare', 0);
  })();
  console.log(
    `  unregistered -> ${unreg.unscoped} · registered-no-priorities -> ${noPrio.unscoped}`
  );
  if (unreg.unscoped === noPrio.unscoped)
    failures.push('control: the two unscoped causes are indistinguishable');

  const miss = resolve(db, chemScope, 'zzz-not-a-term-zzz');
  console.log(`  a genuine miss -> winner ${miss.winner} · unscoped ${miss.unscoped}`);
  if (miss.unscoped !== false) failures.push('control: a miss reported an unscoped cause');

  db.close();
  if (failures.length) {
    console.error(`\nFAIL (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }
  console.log('\nALL GATES REPORTED. Record the numbers in test-results/.');
  return 0;
}

/**
 * Distinct English strings appearing in a book's extracted EN segments —
 * books/<slug>/02-for-mt/**\/*.md, the text the MT glossary is actually filtered
 * against by filterGlossaryForText.
 *
 * ⚠️ THREE TRAPS, each measured in this tree on 2026-08-08, each of which
 * silently inflates or empties the census rather than erroring:
 *
 * 1. `02-for-mt` holds ~700 `<name>.md.backup.<timestamp>` files beside its 249
 *    real `.md` files. `endsWith('.md')` correctly excludes them BECAUSE they end
 *    in the timestamp. Do NOT "improve" this to `includes('.md')` — that pulls in
 *    every stale backup and counts months-old text as current source.
 *
 * 2. Every file is dense with `<!-- SEG:mNNNNN:type:id -->` markers. A bare word
 *    regex harvests `SEG`, `title`, `abstract-item` and friends as English terms.
 *    Strip the comments first.
 *
 * 3. Segment text carries `[[i:…]]`, `[[link:…]]`, `[[xref:…]]`, `[[docref:…]]`
 *    bracket markers whose TYPE names would likewise be counted. Strip the
 *    marker syntax but KEEP the inner prose — `[[i:hydrogen]]` really does mean
 *    the word hydrogen appears in the text.
 *
 * ⚠️ §C36 did NOT record how it extracted its strings, so this is a
 * reconstruction rather than a replay. That is why the caller prints the method.
 *
 * ⚠️⚠️ TRAP 4, THE EXPENSIVE ONE — REVIEW FINDING 1 (2026-08-08). This function
 * used to harvest with a single `/[A-Za-z][A-Za-z-]+(?: [a-z]+)?/g`, whose
 * two-word alternative matches NON-OVERLAPPINGLY. Whether a bigram is seen then
 * depends on its BYTE OFFSET:
 *
 *   "The carbon dioxide molecule"  -> 'The carbon', 'dioxide molecule'  ← term LOST
 *   "a carbon dioxide molecule"    -> 'carbon dioxide', 'molecule'      ← term seen
 *
 * and consuming the following word into a bigram ALSO prevents that word ever
 * being emitted as a unigram. The net was DESTRUCTIVE, and the proof needs no
 * reference to the register: unigrams alone (n=22,100) scored 1,558/90/285 =
 * 1,933 resolutions, HIGHER than the bigram version's (n=80,037) 1,398/67/176 =
 * 1,641. Deleting the layer beat shipping it.
 *
 * Tokenising once and emitting OVERLAPPING adjacent pairs — one variable changed,
 * same token grammar, same files — yields 2,008/120/300 against §C36's recorded
 * 2,001/126/310. Within ~1% on three counts produced by three different branches
 * of resolveCandidates, so this is not a shared-limit artifact.
 */
function collectSourceEnglish(slug) {
  const path = require('path');
  const root = path.join(__dirname, '..', '..', 'books', slug, '02-for-mt');
  if (!fs.existsSync(root)) {
    console.error(`  ⚠️ ${root} does not exist — gate 2 cannot run for ${slug}`);
    return [];
  }
  const words = new Set();
  let filesRead = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (!e.name.endsWith('.md')) continue; // excludes .md.backup.<timestamp>
      filesRead++;
      const text = fs
        .readFileSync(p, 'utf8')
        .replace(/<!--[\s\S]*?-->/g, ' ') // trap 2: SEG markers
        .replace(/\[\[[a-z]+:/g, ' ') // trap 3: marker OPEN, prose kept
        .replace(/\]\]/g, ' ');
      // Tokenise ONCE, then emit every unigram AND every adjacent pair. The token
      // grammar is unchanged from the offset-locked version it replaces — a
      // unigram is `[A-Za-z][A-Za-z-]+` (2+ chars) and a bigram's second word is
      // `[a-z]+` (1+, lowercase) — so the only variable that moved is overlap.
      const toks = [...text.matchAll(/[A-Za-z][A-Za-z-]*/g)];
      for (let i = 0; i < toks.length; i++) {
        const [word] = toks[i];
        if (word.length >= 2) words.add(word);
        const next = toks[i + 1];
        if (!next || word.length < 2 || !/^[a-z]+$/.test(next[0])) continue;
        // Adjacent means separated by exactly one space in the SOURCE — not merely
        // consecutive in the token list, which would join across newlines and
        // punctuation and invent terms the book does not contain.
        if (next.index === toks[i].index + word.length + 1 && text[next.index - 1] === ' ') {
          words.add(`${word} ${next[0]}`);
        }
      }
    }
  };
  walk(root);
  // ⚠️ An empty result must be LOUD. A census over 0 files reports "0 ties" and
  // looks like a clean pass — an absence is not an answer.
  if (filesRead === 0) {
    console.error(`  ⚠️ read 0 .md files under ${root} — gate 2 is meaningless`);
    return [];
  }
  console.log(`  files read: ${filesRead}`);
  return [...words];
}

if (require.main === module) process.exitCode = main();
module.exports = { main, parseArgs };
