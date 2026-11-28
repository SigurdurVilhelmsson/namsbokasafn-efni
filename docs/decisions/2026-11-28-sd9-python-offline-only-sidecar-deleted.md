# Decision: Python language tools run as offline batches on the development box, never on production; the Greynir sidecar is deleted (SD9)

- **Date:** 2026-11-28
- **Status:** Accepted
- **Context owners:** [USER] (ruled 2026-11-28: "Write SD9 and delete it") + pipeline
- **Supersedes:** in part, [`2026-08-06-mideind-toolchain-evaluation.md`](2026-08-06-mideind-toolchain-evaluation.md). This record **scopes** that record's "a hosted API, not a port" commitment for packages B2 and C; it does not reverse it. Everything else in that record stands, including the sidecar deletion it ordered, which this record carries out.
- **Related:** [`docs/plans/2026-10-23-skerfur-development-plan.md`](../plans/2026-10-23-skerfur-development-plan.md) (§8 SD9 and its 2026-10-28 note; §4.2 B2; §4.3 B3; §4.4 C; §6), the active register `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C25, §C44; RESUME entry 2026-11-28), [`docs/plans/2026-09-06-editor-terminology-assistant.md`](../plans/2026-09-06-editor-terminology-assistant.md) ("Decisions already made"), [`2026-08-12-matecat-evaluation-and-editor-architecture.md`](2026-08-12-matecat-evaluation-and-editor-architecture.md), `test-results/b4b-matcher-cutover-2026-08.md` (B11.3–B11.6), [`docs/superpowers/specs/2026-11-03-served-version-and-event-log-design.md`](../superpowers/specs/2026-11-03-served-version-and-event-log-design.md) (§5.13's flag table)

> **FROZEN EVIDENCE — banner-dated 2026-11-28.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The 2026-08-06 record committed the project to "a hosted API, not a port" for Icelandic language services, and to no self-hosted Python. Two of the follow-on grant's funded packages cannot be met that way:

- **B2:** rule-based lemmatisation (Nefnir) plus a POS tagger;
- **C:** Regína, IceG2P and a Talrómur or Piper voice.

All of these are Python, and none has a hosted endpoint on a key the project holds. The development plan also ports Nefnir's rules into the Node server. Without a scoped exception, every one of those steps contradicts a standing decision.

The same question decides `server/greynir-sidecar/`. The 2026-10-28 note says it is deleted before the first unit opens. The 2026-08-10 measurement (`test-results/b4b-matcher-cutover-2026-08.md` B11.6) found it coupled to §C44, which cited it as precedent for a production Python service.

What was at stake: a decision that funded work quietly contradicts, a dead control in the editor that chemistry editors are about to open, and the shape of the research flag snapshot once research capture begins.

## Decision

1. **Nothing new runs on the production box.** No Python service, virtualenv or model is installed there for B2, B3 or C.
2. **B2's lemma index and C's speech chain run as offline batches on the project's own equipment (the development box).** Their outputs enter the server as data. Rented compute, if ever needed, is recorded as unfunded before use (development plan §4.4).
3. **A port of Nefnir's rules may run in the Node server, only as the fallback** wherever the offline index is stale. It keeps Nefnir's Apache-2.0 notice and is tested against the original Python's output. Its rules file is BÍN-derived, so it stays out of git and is fetched at install.
4. **The Greynir sidecar is deleted now**, together with everything that existed only to reach it. That covers the Node client, the `/spellcheck` route and its service function, the editor's "Yfirlestur" button, the `greynir` feature flag and `GREYNIR_URL`.
5. **Grammar help for editors stays "if editors ask"**, as the 2026-10-28 note has it. If it is ever built, it arrives through G1.23's suggestion view, behind a fail-closed marker mask, and only after a blind sample shows its precision is worth its cost. Its engine is chosen by a fresh head-to-head at that time.

## Reasoning

### The hosted-API rule was about the production box, and an offline batch keeps it

The 2026-08-06 record's grounds were operational. Specifically:

- the sidecar had never been deployed;
- the box had 3,915 MB of memory and a live memory-spike item;
- the project had one demonstrated failure mode around Python on production.

None of these applies to a batch that runs on the development box and writes data. The record's own alternatives section rejected BinPackage "as a live service" because the capability "is inherently a batch job". The lemma index and pre-rendered audio files are batch jobs in the same sense. Scoping the rule to production keeps its reason and drops a side effect it was never meant to have.

### The sidecar is still broken and the checker still damages terms — measured today, not inherited

Measured 2026-11-28 in a scratch virtualenv with `reynir-correct` 4.3.1 (released 2026-11-27) and `reynir` 4.2.0, on 150 prose segments of `books/efnafraedi-2e/02-mt-fable/ch01` (60,215 characters, markers stripped):

- **`server/greynir-sidecar/app.py` returned HTTP 500 on 150 of 150 requests.** The 2026-08-06 defect is unchanged: `check()` yields paragraphs, so `result.paragraphs` raises `AttributeError`. `sentences` is also a method now. The sidecar has therefore never worked with any GreynirCorrect release it would install today.
- **Called directly, the checker still rewrites chemistry vocabulary:**
  - `stórsæja` → `stórbæja` (ch01 holds `stórsæ-` 26 times and `stórbæ-` 0 times);
  - `óeðlum` → `seðlum`;
  - on the 2026-08-06 control sentence it still turns `stórsæ` → `stórs` and still misses `mikla hund`.
- **Its output is dominated by noise.** It made 281 annotations, on 107 of 150 segments:
  - 89 are whole-sentence `E00x` codes (no parse, or a sentence too long);
  - 34 are `U001` single letters, such as the `(s)` and `(l)` state symbols.
  - Precision was not measured across all of them. The cases above are individually verified.
- **Cost:** a 439 MB peak RSS; 1.7 s for the first call, then 19.8 s for the 150 segments.

GreynirEngine itself is actively maintained. Its 4.0.0 (2026-11-10) made the parser core several times faster with identical output, and the repository now carries a `CLAUDE.md`. That improves a batch use of Greynir. It does nothing for this sidecar, whose problem was quality and a defect in our own wrapper, not speed.

### Nothing funded needs the sidecar

- **B3's proposed spike** (register, 2026-11-28) uses Greynir's noun-phrase inflection, which is `reynir`, not GreynirCorrect, run as an offline batch.
- **B2's proposed arm 3** uses IceBERT-PoS.
- **C** uses none of Miðeind's packages.

So deleting the sidecar removes no route any package depends on. Decision 2 already provides the place where those batches run.

### §C25 and §C44 are decided together, as B11.6 required

`test-results/b4b-matcher-cutover-2026-08.md` B11.6 found them coupled. §C25 proposes deleting the sidecar; §C44 cited it as precedent for a Python BinPackage service. This record decides both in one direction: no Python service on production. §C44's BinPackage work, if it is ever done, is an offline batch under decision 2. B11.6 itself had already withdrawn "reusing a proven pattern", because the pattern had never run.

### Deleting now keeps the research record clean

- **The flag snapshot.** `server/lib/featureFlags.js` stamps a flag snapshot on every research event (`researchLog.js`, `flag_snapshot_json`), and `greynir` is one of its keys. Removing the key before research capture begins means no event ever carries a flag for a feature that never ran. Removing it later would change the snapshot's shape mid-study.
- **B1's editing conditions.** Taking a dead assistant out of the editor before the first unit opens means those conditions do not change during the study.

### A correction the development plan asked this record to carry

The 2026-08-12 record says "the compounder work was already measured at roughly 3% yield". That 3% belongs to the **forms-indexing alternative**, not to the compounder:

- `test-results/b4b-matcher-cutover-2026-08.md` B11.5 measured 2.96% of candidates for indexing inflected forms as well as lemmas.
- B11.3 gives the compounder proxies 45.1% (strict) and 70.5% (loose) coverage. B11.4 explains why those are upper bounds.

The editor terminology assistant plan quotes the 3% under "Decisions already made — do not re-litigate". That line is superseded by this record so far as it rests on the 3% figure. The plan's other premises are not touched here.

### Checked against the tree, and not

- **Checked:** the sidecar's every consumer, found by grepping `server/` for `greynir`, `GREYNIR_URL`, `spellcheck`, `getModuleSpellFindings` and `btn-spellcheck`; the measurements above; that no e2e spec references the button or route; that no SD9 record existed before this one (register RESUME entry 2026-11-28).
- **Not checked:** production's environment. `GREYNIR_URL` was unset there on 2026-08-06, and nothing since records it being set. If it is set, the variable becomes inert after this change. Nothing breaks.

## Consequences

- **Commits** B2's tagger and lemma index, and C's speech chain, to offline batches on the development box. Their outputs reach the server only as data, and the server runs no Python.
- **Forecloses** a self-hosted grammar checker on production, as 2026-08-06 already did, and now also its code. Reversing that means restoring the deleted files from git and fixing the wrapper against the current GreynirCorrect API, then deploying a Python service for the first time.
- **Removes the `greynir` key from the §5.13 flag snapshot.** The flag table in the 2026-11-03 served-version design is frozen and keeps the row as historical design.
- **Keeps** `server/.venv/` in the ESLint ignores. A development box that once built the sidecar's virtualenv may still hold one, and CLAUDE.md's rule on it stands.
- **Follow-up work** (the B2 spike, the B3 spike, the Nefnir port, C's feasibility check) is tracked in the active register and the development plan. This record does not restate its status.

## Alternatives considered

1. **Keep the sidecar and fix it.** Rejected. The fix is small, but it buys an editor button whose suggestions measurably damage chemistry terms (above). It would also need the first Python service on production, which decision 1 rules out.
2. **Keep the code but hide the button.** Rejected. Code that is built, merged and never run is the defect class register §C26 hunts. A hidden control still carries a route, a flag in every research event and a dependency surface, and buys nothing.
3. **Leave the 2026-08-06 rule unscoped and run B2 and C on production anyway, case by case.** Rejected. Funded work would contradict a standing decision with nothing written down, and the production box's memory constraint has not changed.
4. **Find hosted endpoints for lemmatisation, tagging and speech.** Rejected for now. No hosted lemmatisation, tagging or speech endpoint is known on a key the project holds (the 2026-08-06 record found translate and grammar only). Buying one would add a vendor and a recurring cost to work a batch does once.
