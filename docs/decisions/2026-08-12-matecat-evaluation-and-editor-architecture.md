# Decision: Reuse no Matecat code; keep the editor in vanilla JS; carry forward one Matecat *design* — a per-term list of acceptable target forms

- **Date:** 2026-08-12
- **Status:** Accepted
- **Context owners:** lead + pipeline
- **Supersedes:** none
- **Related:** active register `docs/plans/2026-07-21-post-item17-followup-campaign.md` §C53 · §C54 · §C50 · §C44 · §C36 B4c · [2026-08-06-bin-licensing-corrected-and-malstadur-integration.md](2026-08-06-bin-licensing-corrected-and-malstadur-integration.md) · [2026-08-06-mideind-toolchain-evaluation.md](2026-08-06-mideind-toolchain-evaluation.md)

> **FROZEN EVIDENCE — banner-dated 2026-08-12.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

Two questions arrived together from one editing session, and they share a root: **the editor's
terminology QA is noisy and its inline markers are fragile — is that already solved somewhere?**

1. **Matecat** (<https://github.com/matecat/MateCat>) is a mature open-source CAT tool under a
   copyleft licence. Is there anything in it — code, or design — we can use or re-create rather
   than invent? And do its licence terms permit reuse given this repo's three-licence split
   (MIT `tools/` · AGPL-3.0 `server/` · per-book CC `books/`)?
2. Matecat's editor is React + Draft.js; ours is vanilla JS with no build step. **Would
   refactoring our editor into a framework (React, Svelte, or a CAT-style editor library) buy
   anything?**

At stake: whether the glossary and marker work now queued as §C53/§C54 should start from an
existing implementation, and whether that work should be preceded by a client rewrite.

## Decision

**Reuse no Matecat code.** Keep the editor in **vanilla JS with no build step**. **Carry forward
exactly one Matecat design idea** — `matching_words`, a curated list of acceptable *target*
surface forms stored on the glossary term — as input to the §C53/§C54 design work, and re-create
it from behaviour rather than from their source.

## Reasoning

### The licence permits less than it first appears, and it is moot anyway

Verified from the repository's own `LICENSE.md` bytes, **not** from GitHub's heuristic
`.license.spdx_id` field: **GNU LESSER GENERAL PUBLIC LICENSE, Version 3, 29 June 2007**, whose
preamble states it "incorporates the terms and conditions of version 3 of the GNU General Public
License, supplemented by the additional permissions listed below."

| Destination | Verdict |
|---|---|
| `tools/`, `scripts/`, root — **MIT** | **No.** MIT cannot absorb copyleft; the file would have to become LGPL, breaching the boundary root `LICENSE` documents. |
| `server/` — **AGPL-3.0** | **Yes, in principle.** LGPLv3 permits conveying under GPLv3, and AGPLv3 §13 permits combining with GPLv3 works. |
| `books/` — **CC** | Not applicable. |

This is a reading of licence text by the pipeline, not legal advice; anything load-bearing should
be verified independently. **It is moot regardless**: the backend is PHP and the frontend is React
+ Draft.js, so nothing ports into a Node server and a vanilla-JS client.

**The live risk is not copying — it is contamination by reading.** Behaviours and architectures
are not copyrightable; specific expression is. Anything we build from this evaluation is to be
implemented from a written description of the *behaviour*, not transcribed from their source.

### There is less to reuse than the project's reputation suggests

Checked against the repository, not inferred from documentation:

- **Their glossary is not local.** `GlossaryWorker::getEngine()` returns a `MyMemory` client —
  glossary storage and lookup are delegated to an external TM service. There is no terminology
  model to borrow. **Our concept graph is ahead of theirs on this axis.**
- **Their per-error dismissal is not in the open-source code.** `lexiqaIgnoreError.js` POSTs
  `{errorid}` to LexiQA's external commercial server (`/ignoreerror`). The *pattern* is validated —
  per-instance, persisted — but there is no implementation available.
- **`lib/Utils` has no glossary or terminology directory at all**; what it has is `LQA`, a human
  error-category framework, which is a different thing from automated terminology checking.

### The one idea worth taking is editorial, not algorithmic

`matching_words` is a list of acceptable target surface forms carried **on the glossary term**. It
arrives in the term payload (`$payload['term']['matching_words']` in `GlossaryWorker::set` and
`::update`) — **supplied with the term, not computed.** The client builds its QA regex from that
list, sorting descending to "prioritize composite terms".

This matters because it dissolves problems we have been treating as language-technology problems.
Every population §C54 identifies — an affix fragment that can never match running text, a solid
Icelandic compound the whole-word regex cannot see inside, a legitimate paraphrase that shifts part
of speech — becomes one editorial act: *this form also counts*. It requires **no morphology, no
compounder, and no BÍN dependency**, and it composes with the paradigms already populated rather
than competing with them.

It also fits a conclusion this project reached independently and recorded in §C52: whether a given
flag is useful terminology feedback "is an editorial judgement, not a hardcoded list's".

### The editor's architecture already avoids the problem a framework solves

Measured, not assumed:

- The editing surface is **`<textarea id="textarea-<segId>">`** elements built in JS, plus a
  **read-only** rendered English pane where `highlightTermsInHtml` wraps matched terms.
- There is **no build step, no bundler, and no framework dependency** in either `package.json`;
  the editor page loads plain `<script src>` tags.
- `marker-highlight.js` already achieves marker visibility with a character-preserving backdrop
  overlay, holding the invariant `stripTags(highlightMarkersInPlace(t)) === escapeHtml(t)`.

Draft.js, ProseMirror and Lexical exist to solve **inline decorations inside a `contenteditable`**:
preserving cursor, selection, undo and IME input while the DOM is rewritten underneath the user.
Matecat needs Draft.js because it decorates the *editable target field*. **We decorate a read-only
pane and edit in a textarea — we do not have the problem.**

**Draft.js specifically is archived upstream** (`archived: true`, last push 2023-02-06), so
following Matecat's choice would mean adopting a dependency its own author abandoned.

Against that, a rewrite would introduce a build step into a delivery path that is already manual;
add a large dependency subtree to the audited, internet-facing `server/` tree; invalidate the
Playwright suite's selectors wholesale; and ship no editorial value. The `innerHTML`-heavy
rendering in `segment-editor.js` is a genuine argument in favour, and it is not enough.

## Consequences

- Commits the project to **building the terminology and marker-integrity work in vanilla JS**,
  against the existing textarea + backdrop-overlay architecture.
- **Forecloses** lifting any Matecat implementation. Reversing this for a specific component would
  mean placing LGPL-3.0 code in `server/` only, accepting the copyleft reach that implies, and
  re-deriving it in JavaScript — i.e. re-writing it anyway.
- **Does not foreclose a framework forever.** Three conditions would each reopen it, and are
  recorded here so the question is answered with evidence rather than taste: (a) decorations are
  needed **inside** the editable field; (b) the same state is rendered in three or more places and
  drifts; (c) a build step is introduced for an unrelated reason. Native ES modules
  (`<script type="module">`) remain available as an incremental step needing no bundler.
  ⚠️ Note the acceptable-forms mechanism **does not** trigger (a) — it works as a panel action.
- **Creates follow-up design work, tracked in the active register — not here.** The adoption of a
  `matching_words`-style mechanism, its interaction with `book_term_preference`, and the
  marker-integrity rules are open design questions owned by the register's §C53 and §C54. **This
  record supplies the input; it does not decide them.**
- A **blacklist check** (terms that must *not* be used) and **source-side highlighting of
  un-carried terms** are noted as further Matecat designs with no equivalent here. Neither is
  adopted by this record.

## Alternatives considered

1. **Vendor or port Matecat's glossary/QA components** — rejected. PHP into Node is a rewrite, not
   a port; the glossary is delegated to MyMemory so the interesting part is not in the repository;
   and the LGPL-3.0 → MIT `tools/` direction is not permitted regardless.
2. **Adopt Draft.js, matching Matecat's editor** — rejected. Archived upstream since 2023, and it
   solves a `contenteditable` problem this editor deliberately does not have.
3. **Refactor to React or Svelte without an editor library** — rejected *for now*. The declarative
   re-render benefit is real but small at this scale, and it is paid for with a build step, a
   dependency subtree in the audited tree, and wholesale E2E selector churn. Revisit on the three
   conditions above.
4. **Solve the target-form problem with morphology instead** (compound decomposition, wider BÍN
   coverage) — rejected as the *primary* route. The compounder work was already measured at roughly
   3% yield, and it cannot reach the paraphrase population at all. Morphology remains useful for
   auto-seeding an acceptable-forms list, not as a replacement for one.
