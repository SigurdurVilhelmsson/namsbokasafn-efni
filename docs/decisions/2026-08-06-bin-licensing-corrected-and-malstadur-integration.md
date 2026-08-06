# Decision: BÍN needs no relicensing — only path placement and attribution; Málstaður grammar is adopted but its COST BASIS IS UNRESOLVED

- **Date:** 2026-08-06
- **Status:** Accepted
- **Context owners:** lead + pipeline
- **Supersedes:** [`docs/decisions/2026-08-06-mideind-toolchain-evaluation.md`](2026-08-06-mideind-toolchain-evaluation.md) — **in part**; see § *What this supersedes* below. Everything that record says about the Miðeind survey, the sidecar deletion and the §C24 sequencing **still stands**.
- **Related:** `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C24, §C25, §C16),
  root `LICENSE`, `server/LICENSE`, `tools/fetch_bin_inflections.py`,
  `test-results/api-marker-survival.md`

> **FROZEN EVIDENCE — banner-dated 2026-08-06.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

Earlier the same day, a decision record concluded that BÍN-derived inflection data could not be
used because *"there is no directory in this repository where a BÍN-derived file can sit."*
The lead then asked the question that claim implies: **would integrating Miðeind's and
Árnastofnun's public tools require re-licensing these repositories, and what would that cost?**
Three further inputs arrived: Málstaður's published pricing, the fact that Miðeind's commercial
tools carry an **LLM layer**, and — decisively — **the primary text of BÍN's own terms**, which
the earlier record had cited only at second hand.

## Decision

1. **No repository is re-licensed. Nothing needs to be.** CC BY-SA's ShareAlike binds *Adapted
   Material* — the derived data — not software that reads it. The question is **path placement
   and attribution**, not licence choice.
2. **Default to never committing BÍN-derived data.** Both the input CSV (`tools/data/`, already
   gitignored) and the generated forms (`sessions.db`, already gitignored) stay out of the tree.
   Under that shape **zero licence changes are required.**
3. **Adopt Málstaður `/v1/grammar`** as decided in the superseded record, **but its cost basis
   is UNRESOLVED and must be settled in writing with Miðeind before any cost figure is relied
   on or any always-on UX is designed.**
4. **Credit BÍN in Ritstjóri and state modifications** — as the licensor's clear intent and on
   prudence, *not* on an overstated claim of legal necessity.

## What this supersedes

Three claims in the earlier record are **withdrawn**:

1. ❌ **"There is therefore no directory in this repository where a BÍN-derived file can sit —
   including a committed test fixture holding a golden paradigm."** This is **wrong.** CC's
   compatible-licence list (GPLv3, Free Art 1.3) matters only when relicensing Adapted Material
   under a *different* licence. A path can always be scoped **CC BY-SA 4.0 itself** — that is
   Option B below. A small test fixture is additionally de-minimis.
2. ❌ **The "three licence gates" framing**, which presented placement as a blocker rather than
   a choice between two workable shapes.
3. ⚠️ **The attribution wording.** The earlier record quoted *"clearly in the user interface of
   all products based on the data."* **That phrasing is BinPackage's English gloss, not SÁM's
   text.** See § *Attribution, from the primary source* — the real duty is broader in scope and
   softer in form.

Unaffected and still authoritative in that record: the 55-repo survey and its IGNORE verdicts,
the GreynirCorrect head-to-head, the sidecar deletion, the marker-corruption measurements, and
the §C24 sequencing constraint.

## Reasoning

### The licensing core (verified against the CC BY-SA 4.0 legalcode)

ShareAlike attaches to **Adapted Material** — material *derived from* the licensed material.
Software that reads or queries a database incorporates none of its protected expression, so
**the repositories' code licences are untouched either way.** Miðeind's own packages
(BinPackage, Tokenizer, GreynirCorrect, GreynirEngine) are **MIT**, which flows into both MIT
`tools/` and AGPL `server/` without friction.

**The sui generis database right is real here** — Iceland is EEA, so Directive 96/9/EC applies
via höfundalög — and BÍN plainly qualifies. It does not change the answer: **CC BY-SA §4(a)
licenses extraction and reuse of the contents**, and **§4(b) makes a database incorporating a
substantial portion Adapted Material *as a database* ("but not its individual contents")**.
Those obligations bite only on **Share**. An ungitignored `sessions.db` is never shared, so
they are inert under the default shape; a committed file *is* shared, which is exactly what
Option B scopes. Whether extracting ~150k forms of ~6.5M is a "substantial part" is genuinely
uncertain and **genuinely moot** — the licence authorises the extraction regardless; only which
obligations attach on Share turns on it. Treat it as substantial and move on.
**AGPL §13's source-offer covers the Program, not database contents** — there is no
AGPL/BÍN interaction to reason about.

### 🔴 The clause that matters most, and that nothing else had: the grant is route-bound

Verbatim from SÁM's terms:

> *"Ítrekað er að leyfisskilmálar gilda aðeins um gögn sem sótt eru á vefsetrið
> https://bin.arnastofnun.is/gogn/mimisbrunnur/. Öll afritun BÍN-vefsíðunnar er bönnuð án
> leyfis."*
> — the licence terms apply **only** to data obtained from that address; all copying of the
> BÍN website is prohibited without permission.

Consequences, in order of sharpness:

- ✅ **`tools/fetch_bin_inflections.py` already documents exactly that URL** (three times —
  header, licence block and its error message). Its acquisition route is **compliant**.
- 🔴 **The convenience URL `django/api/nidurhal/?file=SHsnid.csv.zip`** — which returns 200
  with no acceptance step — takes data by a route the terms do **not** cover. That is worse
  than skipping a formality; the grant may simply not attach. **Do not use it.**
- ⚠️ **Open question: does the grant travel through PyPI?** BinPackage bundles BÍN data, and no
  end user obtains it from mimisbrunnur. CC BY-SA §2(a)(5)(A) makes every downstream recipient
  an automatic offeree of the licensor, and BY-SA cannot easily forbid the redistribution it
  authorises — so the chain most likely holds, and the sentence most likely means *"this terms
  page governs the bulk download; do not scrape the site."* **Confirm with SÁM before relying
  on the PyPI route for anything committed.**

### Attribution, from the primary source — narrower basis, broader scope

SÁM's terms require two things and **anchor both to the CC licence's own mechanics**:

- *"Skylt er að geta rétthafa BÍN á ótvíræðan hátt **í afurðum sem byggðar eru á gögnum úr
  BÍN**"* — credit the rights holder unambiguously **in products built on BÍN data**, citing
  **§3(a)(1)(A)**. Required text: *Beygingarlýsing íslensks nútímamáls. Stofnun Árna
  Magnússonar í íslenskum fræðum. Höfundur og ritstjóri Kristín Bjarnadóttir.*
- *"Skylt er að gera grein fyrir því á ótvíræðan hátt ef gögnunum hefur verið breytt"* — state
  modifications unambiguously, citing **§3(a)(1)(B)**.
- *"Notast skal við vefhlekkinn https://bin.arnastofnun.is"* — that link must be used.

Two corrections follow. **Scope is *products*, not "the user interface"** — the UI wording was
never SÁM's. And because both duties cite §3(a), they inherit §3(a)(2): attribution may be
satisfied *"in any reasonable manner based on the medium, means, and context"*, and §3(a)
triggers on **Share**. So under the default shape the strict legal trigger may not fire at all
for an auth-gated five-editor tool.

**The recommendation is unchanged: put the credit in Ritstjóri and state that the forms are
generated.** It is cheap, it is unambiguously the Institute's intent, and BinPackage ships the
credit text already. **But the record should not overstate the basis** — it is *licensor's
stated terms plus prudence*, not a proven legal necessity. Note also that the **acquisition
route changes the basis**: the gated download is a click-through the downloader accepts, which
binds regardless of Share; PyPI is not.

### 🆕 SÁM designate an official route for *publishing* paradigms

> *"Þeim sem birta vilja beygingardæmi úr gögnum úr BÍN er bent á BÍN-kjarnann og forritaskil
> þar."* — those wishing to **publish** inflection paradigms are directed to **BÍN-kjarninn and
> its API**.

This is a **third option nobody had**, and it is aimed precisely at Option B's use case. If
publishing paradigms ever becomes desirable, the designated route is the BÍN core API, not a
bulk-data derivative. Not evaluated here.

### 🆕 The data format we are using is probably the wrong one

BÍN publishes **five** formats, updated on the 10th of each month. Two facts change our choice:

- **`SHsnid.csv` (6 fields) is purely *lýsandi* — descriptive.** It records every attested
  variant without judging any.
- **`KRISTINsnid.csv` (15 fields) is partly *vísandi* — prescriptive.** It takes a position on
  the validity of variants with respect to spelling and register.

For a **textbook** glossary we want the standard form, not every attested variant, so
**KRISTINsnid is the better-matched source** and `fetch_bin_inflections.py` currently parses
SHsnid. Also noted: `Storasnid_ritm.csv` deliberately carries **error forms** — misspellings,
typos, older orthography, age-dated and error-classified — which is spell-checker material, and
explains its presence in GreynirCorrect's own configuration. `BIN_ordmyndir.txt` is a bare
form list with no analysis at all.

### ⚠️ The licence answer does NOT discharge the data-quality gate

Carried forward from the superseded record, because a licence-clean import that writes
unmatchable data is still a failed import: `add_compound_hyphens` **defaults to True**, so
`sýruanhýdríð` yields `sýru-anhýdríði`, which matches nothing in real text (5 of 9 tested
chemistry terms came back fully hyphenated); `only_bin=True` returns `[]` for the same words,
because the compounder *is* the coverage; the compounder also **fabricates lemmas**; and the
glossary's `pos` is NULL throughout, so a gender-blind union injects forms from a different
lemma. **⚠️ Name one mechanism and stick to it.** The measured coverage figures (~11–12 forms,
65% of terms) are **BinPackage with its compounder** — a raw CSV lookup has no compounder and
misses exactly the chemistry compounds. The two must not be described interchangeably.

### Python: the obstacle is a second deployable, not the language

The earlier framing — that this team cannot deploy Python — was an over-generalisation from
one observation. **The repository already contains five Python scripts**, three of them active
tooling, and production has Python 3.12.3, venv, pip and a toolchain, with 44 GB free and
3.1 GB available RAM. `deploy.sh` already requires python3 + make + g++ for `better-sqlite3`.
The correct distinction: **batch/CLI Python is already routine here; a long-running Python
*service* — venv on prod, systemd unit, port, health check, restart-on-deploy, resident memory
— is the thing never completed.** Inflection generation is a batch job and is unaffected.

### 🔴 Masking for `/v1/grammar` is NOT "mask everything"

`[[i:vatns]]` **wraps real prose** — *vatns* is a genitive noun doing grammatical work in its
sentence. Replacing it with an opaque token **deletes a word from the sentence the checker
sees**, degrading the very agreement detection that justified adopting the endpoint. Therefore:

- **`[[i:]]` needs unwrap-and-rewrap**, with re-attachment after edits — directly adjacent to
  the §C16 re-attach work, and it should be designed with it.
- **`[[xref:]]`, `[[link:]]`, `[[docref:]]` may be opaque tokens** — they carry no prose.
- **The unmask step must structurally validate the round-trip and fail closed per suggestion.**
  The spaced form `[[i: vatns]]` parses to an **empty list, silently** — "no error was raised"
  proves nothing in this marker family, and the corruption arrives as an *acceptable*
  `diffAnnotation`.

On why the channel is untrusted: the earlier record inferred **nondeterminism** from two
corruptions observed on two different inputs. **That inference is withdrawn** — the evidence
cannot distinguish nondeterminism from deterministic context-sensitivity, and the
space-after-colon shape is in fact characteristic of a deterministic tokenize→detokenize round
trip. The engineering conclusions stand on firmer ground: the channel is untrusted for markup
**whatever the mechanism**, and output is unstable across time because **Miðeind swap
underlying models**, not because individual calls are random. Report the corruption to Miðeind
— but never *block* on a fix.

### 🔴 Cost: UNRESOLVED, and it is not only a budget question

Málstaður publishes a **fixed subscription (ISK 3,000: 30,000-character cap per Málfríður
review, 1,000,000 characters/month)** and **pay-as-you-go (ISK 3,000 base per user **plus API
fees on top**, 30,000/review, no monthly limit)**.

**"API fees" appears only in the pay-as-you-go tier.** The natural reading is that the
subscription covers the Málfríður *web application* and that **API access is inherently
metered** — in which case a subscription-versus-metered comparison prices a product this
integration cannot use. Corroborating: our own probe returned **`usage.cost` 0.69 for 69
characters**, and an API billed flat-rate would not itemise per call.

**This must be answered in writing by Miðeind before any cost figure is relied on**, because it
also decides UX: metered ⇒ grammar is an explicit per-segment action; flat-rate ⇒ an always-on
panel becomes viable. Four questions to put to them:

1. Does the fixed subscription include **API** access, or only the web application?
2. Is ISK 3,000 **per seat**? Our server calls one key on behalf of ~5 editors — does that
   require five seats, and does one-key-many-users breach the terms?
3. Is the 1,000,000/month pool **shared with translation**? If so, grammar sweeps compete with
   the budgeted re-runs.
4. On hitting the cap, does service **throttle or overflow into billing**? Either way the
   editor feature must **fail loud**, per project rule.

⚠️ Two arithmetic corrections to earlier drafts, recorded so they are not repeated: at a hard
1M/month ceiling, 5.07M characters is **six months → ISK 18,000**, not five months; and the
effective ratio against pay-as-you-go is ~2.8×, not 3.3× (3.3× is the per-character rate at
100% utilisation — effective cost degrades with idle capacity). ⚠️ The 5.07M figure is
`02-mt-output`; what a grammar sweep would actually check is `03-faithful-translation`, and the
metered payload is the **post-mask** text, which differs in length. ⚠️ The 30,000 cap is
documented for Málfríður *reviews*; whether `/v1/grammar` shares it is unverified, as is the
unit (codepoints vs bytes — Icelandic UTF-8 inflates ~15–20%). **Batching per segment sidesteps
all of it**, and per-segment is the editorial unit anyway.

### The LLM layer, and the line it moves

Miðeind's commercial tools carry an LLM layer, currently Google Gemini. This explains the
measured quality gap against rule-based GreynirCorrect — different generations, not newer
rules. It also means **editorial text transits a commercial LLM stack.** Exposure is low
because the content is openly licensed and public, but the superseded record used *"editorial
text stays behind the firewall"* as an explicit rejection ground for `/qa/*`, so the line must
be drawn deliberately rather than quietly crossed: **transient processing is accepted;
persistent remote indexes remain rejected.**

⚠️ **One legal check nobody has done:** do the provider's terms grant retention or training
rights? The project may pass NC-SA content to a processor for its own use, but it **cannot
sublicense training rights it does not hold.** Probably fine on paid-tier terms — but it bears
far harder on **bulk simplification of whole NC-SA chapters** than on per-segment grammar.

### Simplification for the reader site — not decided here

Two gates, recorded so they are not skipped: simplified text is a **derivative of the books**,
so it must carry CC BY-NC-SA 4.0 for the two NC-SA titles and CC BY 4.0 for the others; and it
is **machine-generated content shown to students**, which this project's rules (API-only
translation, human approval before publishing) address in spirit if not by name. Two practical
warnings: **marker and structure survival through simplification is categorically worse than
through grammar** — it is a full rewrite, so figures, xrefs and SEG comments will not survive
— and the bulk cost is unquantified. It is **vefur's** work; record its learnings there.

### Minor: Skrambi

Árnastofnun's own BÍN-based spell/grammar checker, originating in a 2012 MSc project on OCR
post-correction; the web version accepts up to 5,000 words and 200 errors. Its lineage
(correcting OCR output, modernising older text) is not our use case and no API is advertised.
**Reference only** — but useful evidence that BÍN alone supports context-dependent correction.

## Consequences

- Commits to **path placement plus attribution** as the licence strategy — no relicensing, and
  the default is that no BÍN-derived byte is committed.
- **Forecloses** the raw-`nidurhal` download route, and leaves the PyPI-chain question open
  pending SÁM's confirmation.
- Creates a small, unambiguous obligation: a **BÍN credit in Ritstjóri** plus a statement that
  forms are generated.
- Creates a **mandatory mask design** with per-marker-class behaviour and fail-closed
  validation, coupled to the §C16 re-attach work.
- **Blocks any cost claim** until Miðeind answer in writing; four questions are named above.
- Leaves format selection open with a **stated preference for KRISTINsnid over SHsnid**, which
  the existing script does not yet implement.
- Follow-up work is tracked in the active register — **do not restate its status here.**

## Alternatives considered

1. **Relicense `server/` to GPLv3 for BY-SA compatibility** — rejected. GPLv3 compatibility is
   **one-way** (a BY-SA adaptation may be licensed GPLv3, never the reverse), and it governs
   the licence placed on the **Adapted Material**, not on code sitting near data. Since no
   BY-SA material is merged into `server/` as a single work, this achieves nothing and costs
   AGPL §13's network clause — the reason AGPL was chosen, mirroring OpenStax.
2. **Commit derived inflections under a fourth path-scoped CC BY-SA 4.0 grant (Option B)** —
   viable and explicitly *not* forbidden (correcting the superseded record). Deferred, not
   rejected: it buys reproducible fixtures at the cost of a fourth licence zone to police, next
   to book content under three different CC terms. If it is ever wanted, evaluate
   **BÍN-kjarninn's API** first, since that is the route SÁM designate for publishing paradigms.
3. **Raw `SHsnid.csv` with no compounder** — rejected on measurement in the superseded record:
   a lookup table misses exactly the chemistry compounds this glossary is made of.
4. **A live BinPackage service** — rejected: ~218 MB resident for an inherently batch job, on a
   box already carrying an event-loop availability item.
