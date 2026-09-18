# §C140 ㉔ — figure-label MT sent per label AND joined — design

**BANNER — written 2026-09-18, approved in chat by [USER] the same day.** This spec is a design
record owned by §C140 ㉔. It owns **no status**: whether ㉔ is built, merged or deployed lives in
the active register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`) ⏩ RESUME. If they
disagree, the register wins.

**Implements:** [`docs/decisions/2026-09-15-figure-label-mt-joined-and-per-label.md`](../../decisions/2026-09-15-figure-label-mt-joined-and-per-label.md)
([USER] ruling 2026-09-15). **Why it matters now:** [USER] ruled 2026-09-18 that figure-label buying
and text/image-synced MT resume once ㉔ is built — it is the last condition on the 2026-09-13 stop.

---

## 1. What the ruling requires

For every figure, send its labels **both ways** — one request per label (today) and all labels
newline-joined in one request. **Keep the joined wording. Flag every label where the two
disagree** so an editor sees both. The decision's Consequences add three hard requirements:

1. A joined reply that does not **split back into exactly the label count** is not used; the
   figure falls back to per-label wording and is flagged.
2. A joined reply that **alters a formula, digit or symbol relative to the English** is not used.
3. The **sidecar and the review panel** carry the disagreement and both candidates.

Both arms stay **bare** (no glossary, §C133). Figures already bought are **not** re-bought.

## 2. Measured premises (checked against the tree, 2026-09-18)

- **The joined arm does not exist.** `experiments/figure-text-translation/translate-blocks.mjs`
  sends one request per distinct key and nothing else; its header argues against joining.
- **A label's `english` never contains `\n`.** `blockkey.py` joins a block's lines with one space
  for the wire (`' '.join(block_lines(block))`); the `|` in a *key* is key-only. Newline-joining is
  therefore unambiguous — but it is still **guarded**, not assumed (§4.1).
- **`renderHash` covers `blocks` only** (`computeRenderHash` in `tools/lib/figure-text-sidecar.cjs`).
  A new sidecar field outside `blocks` changes no approval, staleness verdict or `COMPOSER_VERSION`.
- 🔴 **`applyApprovedFigureEdits` rebuilds the sidecar from an EXPLICIT field list**
  (`server/services/figureReviewService.js`). `composedHash` and `composedVersion` survive only
  because each has its own carry-forward line. **A new field is silently dropped on the first
  approval unless it gets one too.**
- 🔴 **`billableFrom` (`tools/figure-run.js`, §C140 ⑦) counts its own characters** — it calls
  `dedupeSendBlocks` and sums `english.length`. Its docstring says a change to what is sent (㉔)
  "changes this in one place"; **it does not** — after ㉔ it would under-report a live run by about
  half. §4.3 fixes this by making the MT leg the one owner of the wire size.
- **The review panel already has the pattern.** `decimalSeparatorWarnings`
  (`tools/lib/figure-consistency.cjs`) emits `{blockKey, current, suggested}`; `segment-editor.js`
  renders it with an **Nota** (apply) button, disabled once the editor's input differs from
  `current`. The new warning reuses that shape and that control.

### The formula guard — measured, not chosen

The 2026-09-15 experiment's own integrity predicate (`analyse.py` `integrity`) fires on **4 labels
in every arm, per-label included**, and all 4 are correct Icelandic: `12.85 → 12,85` (decimal
comma) and `mol → mól` (the ruled localisation). A verbatim-token guard would therefore reject
correct joined answers and fall back to a per-label answer with the same "defect". The guard
adopted here was measured over the experiment's committed answers (`labels.json`):

| | per-label | joined J1 | joined J2 | positive controls |
|---|---|---|---|---|
| fires | **0 / 169** | **0 / 166** | **0 / 166** | `H₂O` subscript ✔ · `12.85 → 12,58` ✔ · `CO2` unchanged: silent ✔ |

Three legs, any one failing rejects the joined answer **for that label**:

1. **Digits** — the ASCII digit sequence of the answer (all non-digits removed) equals the English's.
   Separators are ignored, so the decimal comma passes and a transposed or dropped digit does not.
2. **No new sub/superscripts** — the answer carries no more characters from U+2070–U+209F, `¹²³`
   than the English does. (This is the alt-text probe's observed damage.)
3. **Formula tokens verbatim** — every English token that looks like a formula (an element symbol
   followed by a digit, or two or more element-symbol capitals: `H2O`, `NaCl`, `CO2`) appears
   verbatim in the answer.

⚠️ JavaScript `\d` is ASCII-only (`[0-9]`, with or without the `u` flag) — which is what leg 1
needs (a subscript `₂` must NOT count as the digit `2`). The implementation states this and a test
pins it.

⚠️ **R15 (final review, 2026-09-18).** Leg 3's token match (`\b(?:[A-Z][a-z]?\d*){2,}\b`) has no
chemistry in it: any run of ≥ 2 element-symbol-shaped capitals qualifies, including a plain
acronym (`STP`, `UK`). A translated acronym therefore fails leg 3 and falls back to per-label —
safe (measured 0/501 on the real answers; no acronym in that set was altered), but the panel's
"formula" note can then fire on something that was never a chemical formula.

⚠️ **Only one sidecar writer rebuilds from a field list** — `applyApprovedFigureEdits`. The
publisher's `withComposedStamp` (`tools/publish-figure-svg.js`) copies every key it is given, so
the new fields survive a publish without change (checked 2026-09-18).

## 3. Approach

**Chosen: both arms inside `translate-blocks.mjs`.** One tool, one run record, one output file;
every paid request stays behind the same pre-flight invariant and the same injected-client test
seam that already keeps the paid leg free to test.

Rejected: **a separate joined-arm script spawned by `figure-run.js`** (two paid steps, a new seam
where one arm succeeds after the other failed with money spent); **keeping both answers only in
`api-run.json`** (a gitignored run directory — the panel on prod could never see it, so the ruling
would have no effect on quality).

## 4. Design

### 4.1 MT leg — `translate-blocks.mjs`

- **Per-label arm: unchanged** — one request per distinct key, in dedupe order.
- **Joined arm: figures with ≥ 2 distinct labels only.** One request carrying the labels'
  `english` newline-joined **in dedupe order**. A single-label figure skips it: the payload would
  be identical by construction, so buying it is pure waste.
- **Split-back guard (figure level).** Refuse the joined arm for the whole figure — keep every
  per-label answer, record `mtJoined.status = 'split-failed'` with the counts — if any label's
  `english` contains `\n`, **or** the reply, trimmed of leading/trailing whitespace and split on
  `\n`, does not yield exactly the label count. (A label containing `\n` is checked **before** the
  joined request is sent, so no money is spent on a payload that cannot split back; its status is
  `'skipped-newline'`.)
- **Formula guard (label level)** — §2's three legs, against the English. A failing label keeps
  its **per-label** wording with reason `formula`.
- **Selection per label**, when the split succeeded:
  - guard fails → keep per-label, record `{kept: 'per-label', reason: 'formula'}`, **no** alternative
    offered (the rejected joined wording is recorded for the run log only — offering it in the panel
    would invite the damage the guard exists to stop);
  - joined ≠ per-label (after trim) → keep **joined**, record `{kept: 'joined', other: <per-label>,
    reason: 'disagree'}`;
  - joined = per-label → keep it, record nothing.
  - 🔴 **CORRECTED 2026-09-18 (final review, finding C1/R12).** Every returned `alt` object above
    also carries `mt: <the kept text>` — the wording `selectWording` actually kept, at the moment
    of this decision. §4.4's `mtAlternativeWarnings` was written to compare a block's current text
    against `mtBlocks[key]` (the sidecar's `blocks`), and that field is REWRITTEN by every approval
    (`applyApprovedFigureEdits` writes `blocks: fig.blocks`), so after any approval the comparison
    held trivially and the warning never went silent. `alt.mt` is the fixed point that survives an
    approval unchanged; §4.4 below is corrected to compare against it.
- **A split reply can be the right COUNT and the wrong ORDER** (finding I2, final review). An exact
  swap between two labels' lines — line *i* disagrees with its own label's per-label answer but
  matches a DIFFERENT label's per-label answer — is caught by `misalignedLines` before `lines` is
  ever set, and the whole figure is treated exactly like `split-failed`: every label keeps its own
  per-label wording, no alternative is offered, and `mtJoined.status = 'misaligned'`. A *paraphrased*
  swap — where the transposed line does not happen to equal the sibling's own per-label wording
  verbatim — is not detectable this way and surfaces only as an ordinary per-label disagreement.
- **Empty answers.** An empty joined line with a non-empty per-label answer falls back to
  per-label (reason `empty`). A non-empty joined line with an empty per-label answer keeps joined
  and records **no** alternative — an empty string is never offered as a suggestion. Both empty
  reaches `normaliseTranslations`' existing `dropped` path unchanged.
- **The formula guard judges the JOINED answer only.** Per-label answers are today's behaviour and
  are not newly guarded — adding that is a separate change with its own base rate to measure.
- **Outputs.** `translations-api.json` keeps `blocks` exactly as today (the kept wording, arc blocks
  as bare strings, others as one-element arrays) and gains `alternatives` (per key, §4.2 shape) and
  `mtJoined` (figure-level status: `'ok' | 'single-label' | 'split-failed' | 'skipped-newline' |
  'request-failed' | 'misaligned'`, plus counts). `api-run.json` records both arms' raw answers and
  each label's selection.
  - 🔴 **CORRECTED 2026-09-18 (final review, finding I1).** The joined request is now wrapped in
    its OWN try/catch, separate from the per-label loop above it. Before this fix, a throw from
    the joined call rejected `main` after the per-label purchases had already been billed, no
    `translations-api.json` was written, and the whole figure was re-bought — money for the
    per-label answers, spent twice — on the next run. A throw now records
    `mtJoined = {status: 'request-failed', labels, error}`, every label keeps its per-label
    wording, and the run's outputs are written exactly as they are for `split-failed`.
- **Plan line and `--dry-run`** report both arms: per-label chars, joined chars, total, one estimate.
- **Pre-flight invariant** covers the joined request's options too (it rides the wire, so it is
  asserted glossary-free like every per-label request).

### 4.2 Sidecar and driver

- New optional sidecar fields, written by `figure-run.js` step 7 from `translations-api.json`:
  - `mtAlternatives: { [key]: { kept: 'joined'|'per-label', other?: string, reason: 'disagree'|'formula'|'empty', mt: string } }`
    — present only for keys with something to say. `mt` was added by finding C1/R12 (see §4.4):
    it is the wording `selectWording` actually kept, and it is what the review panel's warning
    compares against — never `mtBlocks`/`sidecar.blocks`, which an approval rewrites.
  - `mtJoined: { status, labels, lines?, error? }` — the figure-level outcome. `status` gained
    `'request-failed'` (finding I1: the joined request threw) and `'misaligned'` (finding I2: the
    reply split into the right count but an exact swap between two labels was detected) in the
    final review.
- Both are **outside `renderHash`**. `SIDECAR_VERSION` stays 1: the fields are optional, readers
  ignore unknown keys (`readSidecar` checks only that the payload is an object), and existing
  sidecars — which have neither field — mean "no alternatives", which is true of them.
  - 🔴 **CORRECTED 2026-09-18 (final review, finding R15).** `mtJoined` is written for EVERY figure
    with a sidecar, including a single-label one (`{status: 'single-label', labels: 1}`) — it is
    NOT true, as an earlier draft comment in `tools/figure-run.js` claimed, that a single-label
    figure's sidecar "keeps today's exact shape". Writing it is fine (it is outside `renderHash`
    and costs nothing that matters); the claim that nothing changed was simply wrong.
- `normaliseTranslations` returns the alternatives alongside `blocks` and `dropped`; an alternative
  for a key that was dropped is discarded with it (no warning may point at a block that does not
  exist).

### 4.3 Spend count — one owner of the wire size

- `translate-blocks.mjs` exports **`wireChars(send)`** → `{ perLabel, joined, total }`, the single
  definition of what a figure's run is billed for (joined = sum of `english` lengths + `n − 1`
  newlines when n ≥ 2, else 0).
- `main` uses it for the plan line; **`figure-run.js`'s `billableFrom` uses it too**, replacing its
  own sum, and its docstring is corrected. A test asserts the two agree on a multi-label and a
  single-label fixture.

### 4.4 Server and panel

- `applyApprovedFigureEdits` **carries `mtAlternatives` and `mtJoined` forward** from the existing
  sidecar, beside `composedHash`/`composedVersion`. A test approves a figure carrying both and
  asserts they survive.
- `tools/lib/figure-consistency.cjs` gains **`mtAlternativeWarnings(blocks, mtBlocks, mtAlternatives)`**,
  emitting for each key whose **current block still equals the MT's kept wording** (once an editor
  has changed it, the warning has served its purpose and disappears):
  - `reason: 'disagree'` → `{ blockKey, current, suggested: other, reason }` — rendered
    *"Orðalag MT stakra merkinga: «…»"* with the existing **Nota** button;
  - `reason: 'formula' | 'empty'` → `{ blockKey, current, reason }` — a note only, no apply.

  🔴 **CORRECTED 2026-09-18 (final review, finding C1/R12) — THE PARAGRAPH BELOW THIS ONE WAS THE
  BUG, NOT A DESIGN NOTE.** It used to say: *"The 'kept wording' is the sidecar's MT `blocks`
  value — which `resolveFigure` already has as `mtBlocks` — never the resolved block after
  edits."* That is the wrong side. `mtBlocks` is `sidecar.blocks`, and `applyApprovedFigureEdits`
  **rewrites** `sidecar.blocks` with the editor's current (possibly corrected) text on every
  approval, while carrying `mtAlternatives` forward unchanged. So after ANY approval,
  `current === mtBlocks[key]` held by construction — both sides had just been set to the same
  value — and the warning, with an enabled "replace with the rejected per-label wording" button,
  never went silent. **The kept wording is instead carried on the alternative itself**, as
  `alt.mt` (written once, in `selectWording`, and never mutated afterwards): the comparison is
  `current === alt.mt`, not `current === mtBlocks[key]`. `mtBlocks` is still passed into the
  function (dropping it from the call site bought nothing, per that site's own note) but is no
  longer read.
- A figure-level note when `mtJoined.status` is `'split-failed'` or `'skipped-newline'`: *every*
  label on it carries per-label wording, which is exactly the wrong-sense risk the ruling exists
  for, so the editor is told once, at the top of the figure.
- `buildFigurePayload` gains `warnings.mt` (list) and `warnings.mtFigure` (string or null);
  `segment-editor.js` renders them following the decimal warning's code, and **Nota** calls the
  same `saveFigureBlock`.

## 5. What does not change

- **No figure already bought is touched**, re-bought or recomposed: no `COMPOSER_VERSION` bump, no
  change to `blocks`, `renderHash` or `compose.py`.
- **The glossary stays off both arms** (§C133).
- **The key de-duplication rule** (`dedupeSendBlocks`, R-13) governs both arms and the joined order.
- **The review flow**: warnings are advisory; approval is never blocked by one.

## 6. Testing

All free — the stub client injected into `main` (no network, no `.env`).

- **MT leg:** agreement → no alternative; disagreement → joined kept, per-label offered; split
  mismatch (reply has n ± 1 lines) → all per-label + `split-failed`; `\n` in a label → joined
  request **never sent** (asserted on the stub's call log) + `skipped-newline`; each formula-guard
  leg fails on its own fixture and passes the decimal-comma and `mól` cases; single-label figure →
  exactly one request; dry-run prints both arms' chars; pre-flight refuses a glossary on the joined
  options.
- **`wireChars`/`billableFrom` agreement** on multi- and single-label fixtures.
- **Driver:** `translations-api.json` with alternatives → the minted sidecar carries them; an
  alternative for a dropped key is discarded.
- **Server:** approval preserves both fields; `mtAlternativeWarnings` emits / stops emitting as the
  block changes; payload carries `warnings.mt`/`mtFigure`; E2E: the Nota button applies the
  per-label wording (extending `server/e2e/figure-review.spec.js`).
- **Mutation, per guard** — split-back, each formula leg, the carry-forward, the "current still
  equals kept" condition — each run against the broken code and required to go red. Restore from a
  `cp` golden copy and `cmp` after every round (CLAUDE.md § mutation restore); `git status
  --porcelain` after any agent that mutates files goes quiet.

## 7. Out of scope

- Re-buying or correcting the 34 already-bought figures — that is [USER]'s editorial batch (㉕).
- Any change to which blocks are sent (`send`), the composer, or the glossary.
- A paid run. Verification on the branch is 0 ISK; the first paid use is the next chapter bought
  after merge.
