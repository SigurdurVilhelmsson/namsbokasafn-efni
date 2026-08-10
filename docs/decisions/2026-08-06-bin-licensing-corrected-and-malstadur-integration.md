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

---

# ADDENDUM — 2026-08-06 (evening): Miðeind answered the pricing questions

**Status: the cost basis is RESOLVED.** The four questions in § *The LLM layer, and the line it
moves* were put to Miðeind and answered by the lead. Recorded here as an append; nothing above is
edited.

## The answers, as given

1. **The fixed subscription does NOT include API access.** API use is priced **per character** and
   is not part of the subscription.
2. **The group subscription is ISK 3,000 per seat**, covering fixed-price use of the **web
   application**. API is billed per character **on top**.
3. **One API key may be used by many editors.** As group admin the lead creates seats and API
   keys; usage is billed per character to the group account.
4. Moot — an API user needs the group account regardless, even for a single user (which is the
   shape already in use for translations).

## What this resolves, and what it retires

**The subscription-versus-metered comparison was pricing a product this integration cannot use.**
That framing is now withdrawn. There is no "subscription covers the API" branch to evaluate: the
API is *always* metered, at the MT rate of **10 ISK / 1,000 characters**.

Consequently:

- **Q3 (is the 1,000,000/month pool shared with translation?) is MOOT.** That pool belongs to the
  subscription's web-application usage. The API has no included allowance to share.
- **Q4 (throttle or overflow into billing?) is MOOT as a quota question.** There is no cap to hit;
  it simply bills. The fail-loud requirement still applies, but to **API errors**, not to quota
  exhaustion.
- **The ISK 18,000 / six-months arithmetic is retired** — it was subscription math against a
  1M/month ceiling that does not exist for the API.
- **⚠️ The one-key-many-editors question is answered YES, explicitly.** Our server calling a single
  key on behalf of ~5 editors is the intended shape and breaches nothing. **No seat multiplication
  applies to API use.** The ISK 3,000/seat cost attaches to web-app seats we are not buying for
  the server.
- **No new commercial arrangement is required.** The group account and key already exist and
  already carry the translation spend; grammar is additional per-character usage on the same
  account, same host, same `X-API-KEY` scheme.

## The UX decision this unblocks

**Metered ⇒ grammar is an explicit per-segment editor action.** The always-on panel is ruled out —
not on policy but on billing: a live panel meters every keystroke-adjacent call. This confirms the
direction the superseded record already argued for, now on a settled basis rather than a guess.

## The real corpus, measured — the earlier figure was the wrong tree

The record's 5.07M-character figure is `02-mt-output`. **A grammar sweep checks
`03-faithful-translation`**, which is far smaller because most of it does not exist yet.

Measured 2026-08-06, counting `*.is.md` files (the counting unit matters — see CLAUDE.md):

| tree | files | characters | @ 10 ISK/1,000 |
|---|---|---|---|
| `03-faithful-translation`, `efnafraedi-2e` | 4 | 66,232 | **~662 ISK** |
| `03-faithful-translation`, all other books | 0 | 0 | — |
| `02-mt-output`, all books *(for contrast only)* | — | 4,789,577 | ~47,896 ISK |

**Grammar-checking every faithful translation that exists today costs roughly ISK 662.** The
budget question was never the obstacle; the obstacle was not knowing whether the API was metered
at all.

⚠️ Three caveats that keep this an estimate rather than a quote:
- The metered payload is the **post-mask** text, which differs in length from the source.
- `03-faithful-translation` grows as editing proceeds — this is a snapshot, not a ceiling.
- Whether the API meters **codepoints or bytes** is still unverified; Icelandic UTF-8 inflates
  ~15–20%. Per-segment batching makes this a rounding question rather than a budget one.

## What is still blocking C25 — and it is not cost

The marker-corruption finding stands and is unaffected by any of this: `/v1/grammar` returns
`[[i:vatns]]` as `[[i: vatns]]`, the spaced form that parses to an **empty list, silently**, and it
returns the corruption **as an accept-able `diffAnnotation`**. A mask/unmask layer that
structurally validates and **fails closed per suggestion** is mandatory before any integration —
and masking is not "mask everything", because `[[i:]]` wraps real prose the checker needs in order
to judge agreement.

**Cost is resolved. Marker safety is not.**

---

## ⚠️ AMENDMENT — 2026-08-10: the route-bound clause is NOT in SÁM's terms

*Appended, not edited in place (append-only record). The body above stands as written on 2026-08-06; this is the correction.*

**The section headed *"🔴 The clause that matters most, and that nothing else had: the grant is route-bound"* quotes, as *"Verbatim from SÁM's terms"*, a sentence that is not in them.** The lead supplied the full text of *Skilmálar um notkun gagna úr Beygingarlýsingu íslensks nútímamáls* on 2026-08-10. Checked clause by clause:

| claim in the body above | in the terms |
|---|---|
| máltæknigögn distributed under **CC BY-SA 4.0** | ✅ |
| SÁM holds the IP rights | ✅ |
| no warranty / no liability | ✅ (not previously recorded) |
| credit required **in products built on BÍN data**, exact string, cites §3(a)(1)(A) | ✅ verbatim |
| modifications must be declared, cites §3(a)(1)(B) | ✅ verbatim |
| *"Notast skal við vefhlekkinn https://bin.arnastofnun.is"* | ✅ verbatim |
| 🔴 *"leyfisskilmálar gilda **aðeins** um gögn sem sótt eru á vefsetrið …/gogn/mimisbrunnur/. Öll afritun BÍN-vefsíðunnar er bönnuð án leyfis"* | ❌ **ABSENT** |
| SÁM direct paradigm-publishers to **BÍN-kjarninn** and its API | ❌ **ABSENT** |

**The terms are plain CC BY-SA 4.0 plus two obligations — credit, and declare modifications — with a warranty disclaimer and a link requirement. There is no acquisition-route restriction.**

### What this retracts

- 🔴 **The prohibition on `django/api/nidurhal/?file=…` is WITHDRAWN.** Its stated basis was the route-bound clause. **Measured 2026-08-10:** `HEAD` returns `200`, `Content-Disposition: attachment`, `Content-Length: 35655687` for `KRISTINsnid.csv.zip`, with **no acceptance step of any kind** — no checkbox, no form, no interstitial. `KRISTINsnid.csv.zip` was obtained at that exact byte count under §C36 B4b-0.
- **The "gated download is a click-through the downloader accepts, which binds regardless of Share" reasoning falls with it** — there is no gate. This also removes the asymmetry the body draws between the direct download and the PyPI route: if acquisition route does not bind, the **open question about whether the grant travels through PyPI loses its premise** and should be re-reasoned, not inherited.
- Any downstream text making acquisition an operator-only step — including §4 of [`2026-08-10-terminology-concept-model-part-b4b0-design.md`](../superpowers/specs/2026-08-10-terminology-concept-model-part-b4b0-design.md), which did — is corrected there.

### What is UNAFFECTED, and it is the part that binds

- 🔴 **ShareAlike, and therefore the export hazard, is untouched and is now the strongest surviving constraint.** BÍN-derived forms must not enter `glossary-unified.json`: that file is committed, world-readable, and published under per-book **CC BY**, while BÍN is **CC BY-SA**. Neither existing gate would catch it — the producer gate fingerprints term *shape*, the shrink guard measures *size*, and a new key on a growing payload trips neither. ⚠️ **The body flags this for `exportBookGlossary()` only; §C36 B3 shipped a SECOND exporter (`buildResolvedGlossary`) after this record was written, and the hazard applies there too.**
- **Credit and modification-declaration obligations stand**, both confirmed verbatim. Storing forms in the gitignored `sessions.db` is fine; `tools/data/` is gitignored at `.gitignore:56`. **No BÍN bytes may be committed, test fixtures included.**
- **The data-quality findings are untouched** — they were never licence-dependent.

### The lesson, which is this project's own rule applied to its own decision record

A 🔴 prohibition, a spec section, and an operator hand-off all rested on **one sentence nobody re-checked against the source**. CLAUDE.md § *One source of truth* already says a frozen document is *evidence, never status*, and its E-2 bullet already says to **re-derive an enumeration rather than inherit it**. Both applied here and neither was performed — the quote was carried forward three times because it was marked verbatim. **"Verbatim" is a claim about a past reading, not a measurement.** → [[engineering-lessons]]

⚠️ **This amendment does not prove the sentence exists nowhere on bin.arnastofnun.is** — only that it is absent from the terms page the record cites and that no acceptance step gates the download. `bin.arnastofnun.is` is a client-rendered SPA returning an identical ~3.6 KB shell for every path, so no further server-side check is possible from here. If it is later found on the download page, that is a *route note*, not a licence term, and the CC BY-SA grant on the data still governs.
