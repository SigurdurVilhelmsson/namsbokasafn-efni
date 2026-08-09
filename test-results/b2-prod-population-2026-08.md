# §C36 B2 — production population of the concept model, 2026-08-08

Evidence for the Part B2 slice of the terminology concept model
(register `docs/plans/2026-07-21-post-item17-followup-campaign.md` §C36).

**Dated snapshot — this is evidence, not status**, following the precedent of
`test-results/concept-import-2026-08.md` and `test-results/api-marker-survival.md`.
Re-measure rather than trusting these numbers later. Status for B2 lives in the register.

---

## What B2 is, and what it deliberately is not

B2 populates production's `concept` / `concept_term` tables from the 20-collection
Íðorðabankinn corpus. **It changes no behaviour.** `conceptResolver.js` (B1) is inert — no
consumer imports it — and the export cut-over that makes the model reader-visible is **B3**.
The old model (`terminology_translations`, 28,903 rows) remains the live one and was not
touched; that is asserted below as a control, not assumed.

---

## Prod pre-state (read-only, measured 2026-08-08 ~21:35Z)

| | |
|---|---|
| HEAD | `f9c66bce`, tree clean |
| `concept` / `concept_term` / `book_concept_preference` | 0 / 0 / 0 |
| `book_domain_priority` | 21 |
| `terminology_translations` (old model, live) | 28,903 |
| `registered_books` | 6 |
| journal_mode | **wal** |
| busy_timeout | 5,000 ms |
| page_size / page_count | 4,096 / 4,021 (= 16,470,016 B) |
| `foreign_keys` | 1 — the better-sqlite3 compile flag, measured with the driver, not the CLI |
| free disk | 44 G |
| node | v22.23.1 |

**WAL is the fact that decided the risk posture.** Readers are unblocked for the whole
import; only a concurrent *writer* stalls, bounded by the 5 s busy timeout. Had this been
`delete`/`truncate` journalling, readers would have blocked and the editor would have frozen
for the duration — the same import would have needed a quiet window.

**The DB target was confirmed from the live process's open file descriptors**
(`/proc/<MainPID>/fd`), not from the unit file or `.env` — neither of which sets
`SESSIONS_DB_PATH`. The running server holds `pipeline-output/sessions.db` open.

---

## Rehearsal (dev, against a snapshot of prod)

Snapshot taken with better-sqlite3's `db.backup()` — a consistent copy, not a `cp` of a live
file — byte-size identical to the source at 16,470,016.

⚠️ **Rehearsed against prod's shape, not a fresh-clone scratch.** B1's scratch DB had
2 `registered_books` / 8 `book_domain_priority` rows; prod has 6 / 21 plus 28,903 live
`terminology_translations`. The recorded 70,187/192,189 came from that *other* starting
shape, so reproducing them here is an independent check rather than a restatement.

| | |
|---|---|
| Yield | **70,187 concepts / 192,189 terms** — reproduces exactly |
| Duration | 2.855 s |
| Size | 16,470,016 → 47,390,720 (**+30.9 MB**, ~2.9×) |
| `verify-concept-import.js` | **PASS**, exit 0, all five checks |

### Idempotency — measured here for the first time

Re-ran the identical corpus against the now-populated copy:

    192189 term(s) updated in place · 0 pruned · 0 editor preference(s) dropped
    max(concept_term.id) = 192189   (unchanged)

Row counts and file size byte-identical. **This is B0's finding-1 fix demonstrated at corpus
scale on prod's own data shape** — the pre-fix importer took `max(concept_term.id)` to
384,378 on exactly this operation. Operationally it means **an interrupted or repeated prod
run is safe to repeat**, which is why it was worth measuring before doing it on a live box.

⚠️ **Note which field carries the signal.** `terms` reads 192,189 on both a real import and
a pure no-op; only `updatedTerms` (0 → 192,189) separates them. A gate built on the total
would pass for the wrong reason. `formatImportReport` prints it on its own line for exactly
this reason, and the code says so.

---

## Production run

Off-box DB backup taken immediately before, invoked exactly as cron does
(`BACKUP_REMOTE=secret:` — the `secret:namsbokasafn-db` form in the runbook is the one the
script rejects with exit 5): `sessions.2026-08-08-213803.db` (16 M), upload OK, exit 0.

Corpus transferred to `~/idordabanki-raw-2026-08-07/` on prod — **outside the repo**, mirroring
dev; 21 files, 76 M. Integrity confirmed by aggregate md5 over all files, dev vs prod:
`74d8ac5117cda7788e4156c6a162ba2c` on both. A corrupted raw file would otherwise import silently.

    node server/scripts/run-concept-import.js --dir ~/idordabanki-raw-2026-08-07 \
      --db ~/repos/namsbokasafn-efni/pipeline-output/sessions.db

| | Before | After |
|---|---|---|
| `concept` | 0 | **70,187** |
| `concept_term` | 0 | **192,189** |
| `max(concept_term.id)` | — | 192,189 |
| **`terminology_translations`** | **28,903** | **28,903** |
| **`book_domain_priority`** | **21** | **21** |
| **`registered_books`** | **6** | **6** |
| **`book_concept_preference`** | **0** | **0** |
| file size | 16,470,016 | 47,390,720 (+30.9 MB) |

Duration **3.446 s** · `IMPORT_EXIT=0` · every per-collection yield identical to the rehearsal.

`verify-concept-import.js` → **VERIFY: PASS**, exit 0, all five checks
(`model-is-non-empty`, `every-concept-has-icelandic`, `one-head-form-per-concept`,
`homographs-separated`, `domains-are-known`).

Service `active`; `GET /api/health` → `status: ok`, all seven checks ok.

**The bold rows are the control.** An import that silently touched the old model would
otherwise be indistinguishable from a clean run.

**Flags surfaced by the report, both expected and neither an error:** PODDUR is
**LATIN-ONLY** (796 concepts, `en 0`) — editor-reachable via Latin, never via the EN→IS MT
payload; no collection yielded zero.

**The advance prediction held exactly.** It was written down before the run (70,187 /
192,189, verify PASS, old model unchanged, ~16.5 → ~47 MB) so that it could be falsified.

⚠️ The WAL file stood at 18.9 MB immediately after; it checkpoints on its own schedule.

---

## An unrelated observation, recorded because a first live firing is worth pinning

`GET /api/health` now reports **four** books in the glossary-export loop, not three:

    edlisfraedi-2e      refused-absent-baseline   since 2026-08-08T12:00:01.290Z
    efnafraedi-2e       refused-producer          since 2026-08-05T14:00:01.119Z
    liffraedi-2e        refused-producer          since 2026-08-05T14:00:01.119Z
    lifraen-efnafraedi  refused-producer          since 2026-08-05T14:00:01.119Z

Traced rather than guessed: PR #371 (`c656a0e0`) and `75e4b430` ("bring edlisfraedi-2e into
the glossary export loop") added `books/edlisfraedi-2e/glossary/.gitkeep`, which reached prod
at 10:27:49. **This is the 2026-08-07 lead decision — *physics gets a `glossary/` dir but no
adoption* — executing as designed.**

⚠️ **That the 12:00:01Z tick was the FIRST to see it is a measurement, not mtime arithmetic.**
`since` is `withSince`-carried: it advances only when a book's outcome *changes*, and is
otherwise held across ticks — the property the register relies on to make D6's deadline real
rather than sliding. So `since: 2026-08-08T12:00:01.290Z` **is** the first-observation stamp
for this outcome; the 10:00Z tick ran before the directory existed, and the four ticks since
(14:00 / 16:00 / 18:00 / 20:00) did not move it. The mtime corroborates; it is not the evidence.

Two things follow that the register did not yet record:

1. **§C21's absent-baseline gate has now fired on a real book in production.** The register
   notes the third tick could not demonstrate it "because no book is in the state it guards",
   and that the demonstration was a sandbox on prod. It is no longer sandbox-only.
2. **§C14 ②'s "`edlisfraedi-2e` … is silently outside the export with no clock and no alarm"
   is spent.** It is inside, clocked, and alarmed — and it carries a **second, later D6
   deadline of ~2026-08-15 12:00Z**, distinct from the ~2026-08-12 14:00Z the other three
   share. Per §C14, letting these fire is the correct outcome for deliberately unadopted books.

---

## What this does not establish

- **No reader-facing or editor-facing behaviour changed.** Nothing reads `concept` /
  `concept_term` yet. B3 (the export cut-over) is where that changes, and it is what unblocks
  chemistry.
- **The old model is still the live one.** B2 did not deprecate, migrate off, or shadow it.
- **B0's deferred finding 3 remains open** — an entry withdrawn from the payload entirely is
  never reached by the prune, leaving terms and preferences stale rather than deleted. It does
  not gate B2 (nothing was withdrawn here: 0 pruned across both runs) and is scoped to Part B.
- **B3's precondition is untouched**: `export-terminology.js`'s `parseArgs` swallows the next
  flag as a value (B0 deferred finding 5). That script is cron-invoked on production and
  deserves its own review, not a drive-by.
