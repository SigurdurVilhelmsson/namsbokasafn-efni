# Decision: adopt Málstaður's hosted `/v1/grammar`, delete the GreynirCorrect sidecar, and do NOT import BÍN inflections until three licence gates close

- **Date:** 2026-08-06
- **Status:** Accepted
- **Context owners:** lead + pipeline
- **Supersedes:** none
- **Related:** `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C24, §C7),
  `server/greynir-sidecar/README.md`, `test-results/api-marker-survival.md`,
  root `LICENSE`, `server/LICENSE`, `docs/audit/security-audit-2026-05-29.md` (SA-18)

> **FROZEN EVIDENCE — banner-dated 2026-08-06.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

Miðeind publish 55 open-source repositories covering Icelandic NLP — the same organisation
whose Málstaður API this project already uses for machine translation. Two questions were
open at once:

1. **Is anything in that collection better than what we are about to build?** §C24 had just
   settled on Aho-Corasick for glossary matching, on measured evidence. If Miðeind had
   already solved that problem, building our own would be waste.
2. **What else there is worth having**, given three concrete gaps: Icelandic inflections
   stored per translation are under-populated (mean 4.16 forms against a nominal paradigm of
   8–16, so an unlisted form silently fails to match); Icelandic grammar/spell QA for editors
   is unavailable in production; and terminology governance is unbuilt.

What was at stake beyond the features: this project has **one demonstrated operational
failure mode around Python**. `server/greynir-sidecar/` was written, reviewed and merged, and
**has never been deployed** — no virtualenv on production or on the development box,
`GREYNIR_URL` unset in both, nothing listening on its port. Any recommendation that ends in
"stand up a Python service" has to answer that.

## Decision

**Three things.**

1. **Adopt `POST /v1/grammar` on `api.malstadur.is`** — the same host and `X-API-KEY` scheme
   `tools/lib/malstadur-api.js` already uses — as the route to Icelandic grammar/spell QA.
   It needs no new infrastructure, no new vendor, and no new secret. **It requires a
   mask/unmask layer for inline markers**; see the blocking finding below.
2. **Delete `server/greynir-sidecar/`.** It loses a head-to-head against the hosted endpoint
   on this project's own content, and it has never run.
3. **Do NOT import BÍN-derived inflections** until three licence gates close and until §C24
   has landed. The artefact is right; the plan is not shippable as written.

## Reasoning

### Nothing at Miðeind replaces the §C24 plan, and that was the first question

All four survey lenses were asked directly whether anything in the collection beats
Aho-Corasick for the glossary matcher. All four said no. Miðeind's own approach — tokenize,
then look up each token in a memory-mapped radix trie — is the same *shape* as the §C24 fix
and does not supply a drop-in replacement for it. **§C24 proceeds as designed.**

### The grammar route we needed already exists on a key we already hold

`api.malstadur.is` exposes `POST /v1/grammar` alongside the translate endpoint. It was
called with the existing `MALSTADUR_API_KEY` and returned HTTP 200 — the entitlement question
was closed empirically, not assumed.

On one identical Icelandic sentence containing chemistry vocabulary:

| | `stórsæ` (chemistry term) | `mikla` (agreement error) |
|---|---|---|
| **Málstaður `/v1/grammar`** | → `stórsætt` ✅ correct | → `mikinn` ✅ correct |
| **local GreynirCorrect 4.1.3** | → `stórs` ❌ destroys the term | missed entirely ❌ |

Better precision *and* better recall, from the endpoint we already pay for, with no service to
deploy. Measured over 368 real `03-faithful-translation` segments, GreynirCorrect annotated
75% of segments but only **1.1% of its annotations (7 of 652)** were the deep grammar analysis
that would justify a Python service at all; the remainder was spelling/style noise that
actively mis-corrects chemistry vocabulary.

### 🔴 The blocking finding: `/v1/grammar` corrupts this project's inline markers

Measured, and it is the reason this is budgeted MEDIUM rather than small:

- `[[i:vatns]]` came back as `[[i: vatns]]` — **a space inserted after the colon.** That is
  exactly the shape CLAUDE.md carries a durable rule about, because the spaced form parses to
  an **empty list** rather than raising.
- A second call turned `[[xref:kafli|1]]` into `[[xref:kafli>1]]` while leaving `[[i:vatns]]`
  untouched. **The corruption is context-dependent and inconsistent, so one round-trip
  fixture will not catch it.**
- Worst: the corruption is returned **as `diffAnnotations`**, so it reaches the editor as a
  *suggestion*. "Accept all", or any naive use of `changedText`, silently breaks the segment.
- `<!-- SEG:… -->` comments survived both runs.

⚠️ **`test-results/api-marker-survival.md`'s 77/77 result does not transfer.** Every check in
it exercises `/v1/translate`. A reputation earned on one endpoint is not evidence about
another — and grammar re-opens the protect/unprotect problem that `tools/archived/` was
retired for.

Cost is metered at **10 ISK per 1,000 characters — identical to the MT rate**. Grammar-checking
costs what translating costs, which rules out an always-on live panel and argues for an
explicit per-segment action.

### BÍN is the right artefact for the inflection gap, and it cannot be shipped yet

`BinPackage` (PyPI `islenska`) embeds BÍN: 6.5M entries, 3.1M unique forms. Measured against
this project's **own committed glossaries** (756 distinct Icelandic terms across three books),
it produced a paradigm for **488 (65% of all terms; 83% of the 585 single-token ones)**, mean
**11.24 forms** against our stored 4.16, at ~1.7 ms/term — the whole corpus in about a minute
as an offline batch. The 35% residue is characterisable, not mysterious: 171 terms are
multi-word (BinPackage inflects single words only and does **not** make adjectives agree), 61
are non-nominal, and 36 are absent from BÍN entirely — and those 36 are precisely the
chemistry coinages (*kjarnsækir, oxósýra, pniktógen, mólarleysni, kúvetta, pH*).

Four independent reasons it cannot proceed as written:

1. **🔴 Licence placement is unresolved, not merely undecided.** The *code* is MIT; the
   *data* is **CC BY-SA 4.0**, © The Árni Magnússon Institute. Creative Commons has designated
   exactly **two** BY-SA-compatible licences: **GPLv3 and Free Art License 1.3**. `server/` is
   AGPL-3.0; `tools/`+`scripts/`+root are MIT; `books/` is per-book CC. **None of those is on
   the list.** There is therefore no directory in this repository where a BÍN-derived file can
   sit — including a committed test fixture holding a golden paradigm.
2. **The obligations survive the "safe" shape.** BÍN's terms require the credit to appear
   "clearly in the user interface of all products based on the data" — a visible credit in
   Ritstjóri, not a `LICENSE` line — and require modifications to be stated unequivocally.
   BinPackage's compounder makes the output modified data *by construction*. Storing it only
   in the gitignored `sessions.db` does not discharge either duty.
3. **A one-line change would publish it.** `exportBookGlossary()`'s `SELECT` lists
   `t.icelandic, t.definition_is, t.status, t.source, t.notes` and **not** `t.inflections` —
   verified by reading it. Adding that column is a one-line edit that **neither the C21
   producer gate nor the shrink guard can see** (the former keys on `category`/`chapter` vs
   `subjects` — shape unchanged; the latter measures size and fires only on halving — this is
   growth), and `scripts/git-backup.sh` runs the exporter **unforced on the 2-hourly cron into
   a public repository**. That would publish CC BY-SA data under CC BY 4.0 for three books
   (an over-grant — the same class of finding that blocked publication on 2026-07-25) *and*
   under CC BY-NC-SA 4.0 for two (an over-restriction; BY-SA forbids imposing extra terms).
   **Both directions are violations.**
4. **⚠️ The default settings silently produce unmatchable data.** `add_compound_hyphens`
   defaults to **True**, so `lookup_forms('sýruanhýdríð', 'hk', 'ÞGF')` returns
   `sýru-anhýdríði`. Five of nine tested chemistry terms came back **100% hyphenated**. Written
   into `inflections`, those forms match nothing in real text — total, silent failure, on
   precisely the compound vocabulary this glossary is made of. The obvious "conservative"
   switch, `only_bin=True`, returns `[]` for the same word: the compounder *is* what delivers
   the coverage. There is also over-generation — `lookup('hraðajafna')` returns four lemmas
   including fabricated ones (`hraðajafn` as an adjective) — and the glossary's `pos` is NULL
   throughout, so a gender-blind union injects forms belonging to a different lemma.

### ⚠️ Sequencing: inflections must not land before §C24

`buildInflectionRegex` → `wholeWordRegex([icelandic, ...inflections])` **is the §C24 hot path**.
Going from 4.16 to ~12 forms per translation multiplies the Icelandic alternation roughly 2.5×.
Worse than the cost: **new forms change which spans get claimed** under longest-first ordering
and `consumed` precedence — so importing them *moves the correctness oracle while §C24 is
rewriting the implementation underneath it*. Order is not a preference here.

### What the collection does not contain

- **No JavaScript or WASM Icelandic NLP exists at Miðeind.** Every language package is Python.
  The JS repos are an MT front-end, a voice library, a Chrome plugin and a tree-annotation
  tool — no engines. That settles a standing architectural question: there is no
  "just add a JS library" option, and the answer to the no-Python constraint is a **hosted
  API**, not a port.
- **`GreynirTerms` does not fit terminology governance** despite its name.
- **Translation memory / concordance is already built here** (SQLite FTS5, migration 036), so
  `GreynirTopic` is redundant — the brief that proposed it was wrong about our own codebase.
- Of ~55 repos, the great majority are voice, TTS, ASR, MT research or vendored forks, and
  are irrelevant to this project.

## Consequences

- Commits the project to a **hosted-API strategy for Icelandic language services** rather than
  self-hosted Python. Reversing that means solving the deployment problem this project has
  already failed once.
- **Forecloses** the GreynirCorrect sidecar. Restoring it would mean re-adding ~600 MB resident
  on a 3,915 MB box that already has a live 1.2 GB-spike availability item, to obtain worse
  results than the hosted endpoint on our own content.
- Creates a **mandatory mask/unmask layer** for any `/v1/grammar` integration, plus a marker
  round-trip test that must cover *several* marker shapes — a single fixture provably does not
  catch the inconsistent corruption.
- Leaves the **inflection gap open**. Closing it requires a lead decision on three licence
  gates (UI credit, statement of modifications, and a `LICENSE` carve-out), and must wait for
  §C24. Tracked in the active register — **do not restate its status here.**
- Establishes, as a standing constraint: **no BÍN-derived form may reach a committed file**
  under the current licence layout.

## Alternatives considered

1. **Self-host GreynirCorrect (fix and deploy the existing sidecar)** — rejected on measured
   quality, not merely on deployment cost: it destroyed a chemistry term the hosted endpoint
   corrected, and missed an agreement error the hosted endpoint caught. Two reproduced defects
   (`check()` returns a generator, so every `POST /correct` would have 500'd; annotation spans
   are zero-width and indexed against a *rewritten* token stream) prove it was never executed
   once.
2. **`api.mideind.is` `/grammar/`** — richer response shape (rule codes, Icelandic
   explanations, `ignore_rules`) where Málstaður returns only `changeType`. Rejected as a
   second vendor relationship, a second secret, and an unpriced commercial negotiation to buy
   a nicer response — while inheriting the same rule engine whose precision was measured as
   poor on our text. Retained as a fallback only.
3. **`api.mideind.is` `/qa/*` for concordance** — rejected on three grounds: our concordance
   need is already met locally by FTS5; `server/greynir-sidecar/README.md` records a policy
   that editorial text stays behind the firewall; and unlike transient MT calls this would
   build a **persistent remote index** of corpora, two of which are CC BY-NC-SA, on commercial
   infrastructure.
4. **Download BÍN's `SHsnid.csv` directly, avoiding Python entirely** — rejected on
   measurement: a raw table has no compounder, and the five chemistry terms that needed the
   compounder are exactly the ones a lookup table misses. It also carries the same CC BY-SA
   placement problem, and the suggested URL returns the data while skipping the acceptance
   gate that grants it.
5. **Run BinPackage as a live service** — rejected: ~218 MB RSS measured for `islenska` alone,
   on a box already fighting an event-loop availability item, for a capability that is
   inherently a batch job.
