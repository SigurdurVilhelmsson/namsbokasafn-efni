# Figure-text follow-ups — the two [USER]-ruled additions

**Ruled 2026-09-04.** Three questions were put to [USER] at the close of the figure-text review
workflow run; all three were ruled and the recommendations agreed.

| | question | ruling |
|---|---|---|
| **Y** | flagging writes the editor's blocks into the committed sidecar | **CLOSED, no work** — the renderer's only channel IS the sidecar (it has no DB access, by the MIT/AGPL boundary), so a flag that did not write it would be invisible to the renderer, and the badge is the feature |
| **A** | the card shows no picture | **BUILD** — a server-supplied image URL in the `/figures` payload |
| **C** | "approved" can describe text that is not in the published SVG | **BUILD** — `composedHash` in the sidecar; `approved` requires it to match `renderHash` |

🔴 **This file exists because the briefs were written into the SDD workspace, which is
gitignored (`.gitignore:104`) and does not survive a merge.** A correct record in an unreachable
location is no record — the same lesson this run paid for twice.

**Do A first; C's brief assumes it has landed.** Each is one task: TDD, one commit, then a scoped
review of its own delta. Status owner for this track is
`experiments/figure-text-translation/REGISTER.md`; this file is the plan, not the status.

---

## Task A — the figure card must show the figure

**[USER]-ruled 2026-09-04.** The card currently renders text blocks, a state badge and advisory
warnings, but no picture. An editor reviews figure *text* without seeing the label it belongs to.

## Why the plan's original approach is wrong (do not revive it)

The plan built `<img src="/content/<book>/chapters/<CH>/images/media/<basename>_IS.svg">`.
**Measured: this app serves no `/content` route at all** — that path belongs to vefur — so the URL
404s on every card for every book. It also hardcodes `_IS`, which CLAUDE.md makes an enforceable
value owned by `tools/generate-image-mapping.js`'s `DEFAULT_SUFFIX`: *"Read it there; never
restate it."*

## What to build

**A server route that serves the image, and a `imageUrl` field in the `/figures` payload.**

### The route

Add it to the existing figure route family in `server/routes/segment-editor.js`:

    GET /:book/:chapter/:moduleId/figures/:basename/image

🔴 **Reuse `resolveFigureRequest`.** It already enforces, in order: the basename regex
(`/^[\w.-]{1,120}$/`, before any I/O), the book lookup, **membership of this module**, and the
existence of a sidecar. That is exactly the validation an image route needs, and reusing it means
you add **no new traversal surface** — which is the whole reason not to reach for
`express.static` over `books/`.

⚠️ **Do NOT mount `express.static` over `books/`.** The precedent at `server/index.js:400`
(`app.use('/downloads', requireAuth, express.static(downloadsPath))`) is a *fixed* root; `books/`
is not — a per-book static mount would put the slug in a filesystem path with only the URL router
between it and `01-source/`, which is licence-load-bearing and READ-ONLY.

Middleware: mirror the **read** chain of its siblings — `requireAuth`, `requireRole(ROLES.EDITOR)`,
`validateBookChapter`, `validateModule`.

Resolve the file from the **image mapping**, not by string-building a suffix:
`tools/cnxml-inject.js` exports `loadImageBasenameMap`, and `tools/cnxml-render.js` already
imports it (`sidecarBasenameForSrc`) to invert `originalImage → outputName`. Use the **forward**
direction here: English basename → `outputName`. If the figure is unmapped, or the file is absent,
return **404** — a figure with no translated image legitimately has no image to show.

Serve it with `res.sendFile(name, { root })`, **never an absolute path** — this repo has been
bitten twice by `send`'s `dotfiles: 'ignore'` applying to the whole absolute path (see
`views.js`, fixed in `dd6c366b` and `dc94fc52`).

### The payload

Add `imageUrl` to `buildFigurePayload` in `server/services/figureReviewService.js` — the URL of
the route above, or `null` when the figure has no translated image. **The client must not build
this string**; that is the entire point of the ruling.

### The client

`server/public/js/segment-editor.js`: render `<img>` from `fig.imageUrl` when non-null, and
render nothing when null. Set `src` through the DOM (`img.src = …`), never `innerHTML` — Ruling Q.
Give it an `alt` and a `data-figure-image` hook.

## Tests — and the trap that matters

TDD: write the test, run it RED, implement, GREEN. Show the RED output.

🔴 **The payload test must bind `imageUrl` to a value, not merely assert the key exists.** The
whole-branch review found that `note` was returned by every payload and bound by *no* assertion,
so nothing would have caught its removal. Do not repeat that shape one field over.

Cover: a mapped figure yields a URL; an **unmapped** figure yields `null` (not a 404-bound URL);
and the route itself refuses a basename from another module with 404 **and reads no file** — the
same class of assertion the empty-block guard used (`COUNT(*) === 0` there; here, assert the
refusal precedes any filesystem access, e.g. by pointing the book dir at a path that does not
exist and confirming the 404 is the *membership* 404, by its message).

An E2E addition is optional; if you add one, note that `books/__e2e-fixture__` has **no `media/`
directory and no `image-mapping.json`**, so the fixture figure is legitimately unmapped — which
makes it a good test of the `null` branch and a poor one of the URL branch.

---

## Task C — "approved" must mean the PUBLISHED IMAGE carries approved text

**[USER]-ruled 2026-09-04.** Do A first; this brief assumes A has landed.

## The defect

`applyApprovedFigureEdits` writes `state` and `renderHash` in the **same call**, both derived from
the same blocks. So for any sidecar the service wrote, `effectiveState(sidecar, sidecar.blocks,
COMPOSER_VERSION)` reduces to `sidecar.state` **exactly** — the hash comparison can only fire on a
`COMPOSER_VERSION` bump, never on an editorial event.

Meanwhile **nothing in the server invokes the composer.** `compose.py` is run by hand from
`experiments/`. So: an editor corrects `Selsíus → Celsíus`, approves, and every surface reports
`approved` — card badge, payload, sidecar, renderer — while `books/<slug>/media/<basename>_IS.svg`
still reads `Selsíus`. The reader is shown pre-approval text presented as final, and **no check in
the repo can see it**, because the sidecar's hash is consistent with the sidecar's own blocks by
construction.

Exposure today is **0** — there are no figure-text sidecars anywhere in `books/`. It becomes real
on the first genuine approval.

## The fix — keep staleness DERIVED, add no file read

The sidecar already carries `renderHash` = "the hash of the blocks that were approved". Add
`composedHash` = "the hash of the blocks the SVG on disk was actually composed from".

`effectiveState` then reports `approved` only when **both** hold:

    now === sidecar.renderHash                 (blocks have not changed since approval — existing)
    sidecar.composedHash === sidecar.renderHash (the SVG was composed from those same blocks — new)

▶ **No extra file read**: both values live in the sidecar. This is the same shape the feature
already uses — a derived answer from a committed record — rather than a second stored state.

▶ **It inverts the flow correctly:** approve → still `mt-preview` → run the composer → `approved`.
That is the honest sequence, and it is why this is a fix rather than a nuisance.

🔴 **`composedHash` ABSENT must yield `mt-preview`, never `approved`.** An approved sidecar with no
`composedHash` means the SVG was never composed from approved text. Fail safe. (No legacy sidecars
exist, so this costs nothing today and protects every future one.)

## 🔴 The design constraint that makes this safe — read this twice

**`compose.py` must NOT compute the hash.** It reads the sidecar, composes from `blocks`, and
copies the sidecar's **own existing `renderHash`** into `composedHash`. It is recording *"the
image on disk was composed from the blocks that produced this hash"*, not recomputing anything.

▶ **Why this matters more than it looks:** `computeRenderHash` is JS (sha256 over
`composerVersion` then each sorted key and value separated by NUL bytes). Reimplementing it in
Python would create **two implementations of one rule in two languages** — and CLAUDE.md's rule is
that when a rule has two implementations you must assert they agree **on the corpus, not on a
fixture**. Copying the value sidesteps that entirely: there is no second implementation to
disagree.

⚠️ If you find yourself writing `hashlib.sha256` in `compose.py`, stop — you have taken the wrong
branch.

## Files

- `tools/lib/figure-text-sidecar.cjs` — `effectiveState` gains the `composedHash` condition.
  ⚠️ This is Task 1's contract, consumed by **both** `cnxml-render.js` and `figureReviewService`,
  and pinned by `tools/__tests__/figure-text-sidecar.test.js`. Existing tests will need the new
  field; **do not weaken an existing assertion to make it pass** — add the field to the fixture.
- `experiments/figure-text-translation/compose.py` — write `composedHash` back into the sidecar
  after a successful compose. Keep it atomic (the JS writer uses temp+rename; match the intent).
- `experiments/figure-text-translation/figtext.py` or `compose.py` tests — a Python-side test that
  the copied value round-trips.

## Tests

TDD, RED first, show the output.

The load-bearing cases, and each needs a **control** beside it:
1. approved + `composedHash === renderHash` → `approved` *(the control: this must still work)*
2. approved + `composedHash` **absent** → `mt-preview`
3. approved + `composedHash` **stale** (≠ `renderHash`) → `mt-preview`
4. `flagged` → `flagged` regardless of either hash *(unchanged)*
5. blocks changed since approval → `mt-preview` *(the pre-existing rule, must not regress)*

🔴 **Then prove the composer half end-to-end, by VALUE not by tally**: write a sidecar, approve it,
assert `mt-preview`; run the composer; assert `approved`. If you cannot drive `compose.py` in a
test (it loads pipeline artifacts that a clean checkout lacks — this bit Task 2, see Ruling F),
say so and test the copy step as a pure function instead, naming the deviation.
