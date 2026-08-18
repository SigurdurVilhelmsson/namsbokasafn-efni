# §C9 — prune-on-rename in the render pipeline, with an old→new slug map

**Status:** design, written 2026-08-18 · **Item:** register §C9 (⏰ deadline *before fall semester*, set 2026-07-26, **passed** — term began ~2026-08-15) · **Branch:** `fix/c9-prune-on-rename`

**Every measurement in this document was taken on `main` at `c9b2aeaf` on 2026-08-18 and is stated with its counting unit.** Where this spec disagrees with the register, **the register wins** — it is live, this is frozen on merge.

---

## 1. The problem, as readers see it

`efnafraedi-2e` chapter 10 publishes module `m68770` **twice**:

| file | rendered | title | banner |
|---|---|---|---|
| `10-5-fast-astand-efnis.html` | 2026-07-10 | old, mistranslated | machine-translated |
| `10-5-fastur-efnishamur.html` | 2026-07-14 | corrected | none |

Both carry `data-module-id="m68770"`. The chapter TOC therefore lists **two "10.5" entries**, and the stale one stays reachable and indexable. Verified live on the tree 2026-08-18.

A Pass-1 review that corrects a section title **renames** the rendered file, because the title drives the slug. Nothing removed the predecessor.

---

## 2. Root cause — and it is narrower than the register describes

**The prune already exists. It is on the one path that cannot orphan anything, and absent from the path that does.**

`tools/cnxml-render.js` sweeps **every** `.html` from the chapter output directory before rendering (the guard is `:3261`, the unlink `:3268`):

```js
if (!args.module) {
```

- **Full-chapter render** → sweeps, then re-renders. An orphan cannot survive. *(But the sweep deletes blindly, so it also destroys the old→new information — see §5.)*
- **Single-module render** → **skips the sweep entirely.** It writes the new slug and leaves the old file untouched.

`server/services/pipelineService.js:234` `runRender()` passes `--module` whenever a `moduleId` is supplied, which is the editor's republish-one-module flow. **That is how ch10 acquired two 10.5 pages**: the 07-14 render had no reason to look at the 07-10 file.

**There is exactly ONE writer of published HTML.** `renderService.renderModule` is live-preview only — it calls `renderCnxmlToHtml` in-process and returns a string; it never writes to `05-publication`. So `cnxml-render.js` is the single implementation point, reached directly or spawned by `pipelineService`. **This item does not have the two-read-models hazard CLAUDE.md warns about**, and that was verified rather than assumed.

---

## 3. Scope

**Blast radius, measured:** 335 published HTML files across 31 chapter directories in all five books yield **exactly 1** duplicate-module-id group — the known ch10 one. **No corpus sweep is needed**, and this spec does not propose one.

**IN**
1. A reconciler in `cnxml-render.js` that, after a successful render, deletes files superseded by a rename and **records old→new**.
2. A per-book, per-track `slug-map.json` emitted inside the published tree.
3. The ch10 repair — which the reconciler performs, not a hand-deletion (§7).
4. Re-render of the ch10 intro, whose nav links the stale slug.

**OUT**
- Vefur's redirect consumer. **[LEAD] ruled 2026-08-18 that it WILL be built**, in its own session and PR per CLAUDE.md's cross-repo rule. This spec defines the contract it consumes (§5) and nothing more.
- Any change to how slugs are derived from titles.
- Pruning orphans with no successor (a module dropped from a book). Out of scope by construction — see §6's fail-safe rule.

---

## 4. Design — snapshot before, reconcile after

Rejected alternatives and why:

- **A separate `prune-publication.js` invoked after render.** Cleaner separation, independently testable — and it is *a step that must be called*. Every other renderer invocation would silently skip it. This repo has a fresh scar precisely here: four gates built, three wired nowhere, the suite green throughout. **A prune that is never called is indistinguishable from no prune.**
- **Pruning inside `safeWrite`.** Wrong level: it sees one file and has no notion of module identity spanning filenames.

**Chosen: put it where the information already is.** Both the old file set and the new one exist only inside a render, so the reconciler lives there and every caller gets it without opting in.

1. **Snapshot** — before any deletion or write, scan the chapter output dir and build `{ filename → moduleId }` by reading each `.html`'s `data-module-id`. For a full-chapter render this must happen **before** the existing blind sweep.
2. **Render** — unchanged.
3. **Reconcile, only on success** — for each module actually rendered this pass, find snapshot entries with the same `moduleId` but a *different* filename. Each is superseded: delete it, and record `old → new` in the map.

Ordering is load-bearing: a failed render must delete nothing. The reconciler runs after the existing rollback boundary, alongside the `.backup.*` cleanup loop that begins at `:4047`.

---

## 5. The map contract (consumed by namsbokasafn-vefur)

**Location:** `books/<slug>/05-publication/<track>/slug-map.json`

Two constraints fix this path, and both were measured:

- **It must be inside the published tree.** `sync-content.js` copies only `books/<slug>/05-publication/{mt-preview,faithful}/`. The existing precedent file `books/_slug-maps/2026-08-12-c56-pilot-renames.json` — whose own header states the C9 contract — **never reaches vefur** and is a dead letter for redirects.
- **It must sit at track root, not in `chapters/NN/`.** The renderer's sweep deletes files in `chapters/NN/`, and vefur's `generate-toc.js` enumerates that directory to build TOC entries. A map file there would be eaten by one and misread by the other.

```json
{
  "book": "efnafraedi-2e",
  "track": "mt-preview",
  "contract": "C9 — old→new so vefur can serve redirects. Every value is CURRENT: chains are collapsed on write, so a single lookup suffices and no transitive walk is needed.",
  "renames": {
    "chapters/10/10-5-fast-astand-efnis.html": {
      "to": "chapters/10/10-5-fastur-efnishamur.html",
      "moduleId": "m68770",
      "recordedAt": "2026-08-18"
    }
  }
}
```

**Chains collapse on write.** When recording `B→C`, any existing entry whose `to` is `B` is rewritten to point at `C`. Consequences, and they are the reason for the rule:

- Every `to` names a file that **currently exists**. A consumer can never redirect to a 404.
- Vefur does **one** lookup. No transitive resolution, so no cycle handling and no depth limit.
- A rename that returns to a previous name (`A→B→A`) **removes** the entry rather than storing an identity redirect.

**Append-only across renders.** A redirect for a rename from three months ago must still work, so the file accumulates and is committed. It is not regenerated from scratch.

---

## 6. Safety rules

These are the invariants; the test plan exists to hold them.

1. **No `data-module-id` → never pruned.** Measured: **94 of 335** published files carry no module id, and **all 94 are compiled rollups** — `answer-key` (28), `summary` (28), `exercises` (26), and 12 others of the same shape. Their names derive from the chapter number plus a fixed suffix, never from a translated title, so **they cannot rename**. A file the reconciler cannot identify is left alone. Fail-safe by construction, and complete rather than merely cautious.
2. **Never delete a file written by this pass.** The successor is identified by being in the written set; the superseded file by being in the snapshot and not in it.
3. **Delete only on a same-module-id match.** Never by name similarity, never by mtime, never by "looks stale". `mtime` and git order are not content properties.
4. **A failed render deletes nothing and records nothing.**
5. **Single-module renders reconcile only the module they rendered.** A single-module render has no knowledge of the other modules in the chapter and must not act as if it does.
6. **Recording precedes deletion.** The map write is the point of the item; an unlink that happens without a recorded entry destroys the only remaining copy of that information — after vefur PR #200 the old filename no longer exists on its side to derive one from.

---

## 7. The ch10 repair is performed BY the tool

Per the register's sequencing ruling: **build the mechanism first and let it perform the deletion.** `05-publication/` is a pipeline-written tree and CLAUDE.md forbids editing it outside the tools. Hand-deleting now would pre-empt the tool, do the work twice, and set exactly the precedent the rule exists to prevent.

So: re-render `efnafraedi-2e` ch10 (`mt-preview`) with the reconciler in place. That single run should delete `10-5-fast-astand-efnis.html`, write the map entry, and — because it is a full-chapter render — regenerate `10-0-introduction.html` whose `chapter-outline` nav still points at the stale slug. Tasks 2 and 3 fall out of task 1's first run.

⚠️ **The intro nav pointing at the stale slug is also why no automatic tiebreak was ever possible**: the one content-derived signal that looked authoritative is wrong.

---

## 8. Test plan

Every deletion test pairs with a control that must **survive**, because a reconciler that deleted everything would pass a delete-only suite.

| # | Test | Control in the same case |
|---|---|---|
| 1 | Single-module render of a renamed module deletes the predecessor | a same-chapter file for a *different* module survives |
| 2 | …and records `old → new` in the map | the map has exactly one entry, `to` names a file that exists |
| 3 | An id-less rollup page is never deleted | a real rename in the same directory *is* |
| 4 | Re-rendering with the **same** title deletes nothing and records nothing | the file is still present and byte-current |
| 5 | Chain collapse: `A→B` then `B→C` yields a single `A→C`; no `B` key remains | a second, unrelated rename is untouched |
| 6 | `A→B` then `B→A` removes the entry rather than storing `A→A` | — |
| 7 | A failing render deletes nothing | the pre-existing file survives intact |
| 8 | Full-chapter render still reconciles, snapshotting **before** the blind sweep | the map records the rename the sweep would otherwise erase |

**Corpus-level check.** After the ch10 repair, re-run the duplicate-module-id census from §3 and assert **0** groups — against the pre-change value of 1, which is the positive control that makes the 0 meaningful.

⚠️ **A regression test is not verified until it has been run against the broken code.** Each of the above must be shown red before the fix and green after.

---

## 9. Known consequence: a test pin moves, deliberately

`server/__tests__/publicationAppendices.test.js:193` pins `getPublicationStatus(-1).mtPreview.fileCount === 13` against a **write** directory. Prune-on-rename is precisely the change that starts deleting stale slugs from such a directory.

**Fix shape**, carried from the register: observe the directory's `.html` count and assert `fileCount` agrees; **keep the sibling `.path` string assertion as-is** — that one genuinely discriminates and must be kept whatever is decided. This pin has not fired to date because a plain republish of the same module set rewrites the same 13 files.

---

## 10. Cross-repo handoff

Vefur's half — read `slug-map.json`, serve a 301 — is a separate session and PR, per CLAUDE.md's cross-repo rule and the [LEAD] ruling of 2026-08-18. What vefur needs from us is in §5 and is deliberately small: one file per book per track, at a fixed path, every value current, one lookup.

⚠️ **Until vefur ships, the old ch10 URL 404s.** That is the accepted trade: the reader-visible duplicate — which is what the passed deadline is about — disappears immediately, and the map is waiting for the consumer.

⚠️ **`mt-preview` is mirrored with `--delete` on vefur's side**, so the map must be present in efni's tree on every sync. It is committed, so it is.
