# Handoff → namsbokasafn-vefur: switch exercise answer-links from number-parity to `data-has-answer`

> **From:** namsbokasafn-efni, 2026-07-01. **For:** vefur (`answerLinks.ts` consumer change).
> **Supersedes the diagnosis in** `namsbokasafn-vefur/docs/handoffs/2026-07-01-exercise-answer-id-mismatch-for-efni.md`
> — that doc's root-cause theory (fs-idp→fs-idm id mismatch) was **wrong**; see below.

## Corrected diagnosis (the original handoff was misdiagnosed)

The symptom (ch12–17 exercises whose "Sjá svar" link goes nowhere) is **real**, but:

- **`fs-idp*`→`fs-idm*` is a red herring.** Those are two CNXML auto-id namespaces; a chapter's
  end-of-chapter exercises span several source modules and the "divergence point" is just a **module
  boundary**. Proven on ch15's rendered pages: **106 exercises, 52 answer-entries, 0 orphan answers** —
  every `.answer-entry[data-exercise-id]` matches an exercise, and every shared id has the **same
  `data-exercise-number`** on both pages. An `fs-idm` exercise *with* a solution (`fs-idm55438304`) pairs
  perfectly; one *without* (`fs-idm212489824`) correctly has no answer. **efni's id pairing is 100%
  correct** — nothing to "re-establish."

- **The real cause is a cross-repo contract bug:** an exercise has an answer iff its source `<exercise>`
  has a `<solution id="…">` (only ~half do — the OpenStax odd-answered convention). But efni's
  `cnxml-render` numbers EOC exercises **continuously across subsections**, while vefur's
  `answerLinks.ts` assumes **"odd `data-exercise-number` ⇒ has answer"** and acts on parity alone
  (`if (num % 2 === 0) return;`, `answerLinks.ts:252`). In ch12–17 the continuous numbering drifts
  answered exercises onto **even** numbers, so parity no longer predicts answer-presence. Two symptoms:
  1. **odd-numbered exercise with no answer** → link emitted → dead scroll (the one you saw);
  2. **even-numbered exercise *with* an answer** (15 of ch15's 52) → **skipped** → answer unreachable,
     no link at all (a second symptom the parity code hides).

## What efni shipped (the enabling change)

`renderExercise` (`tools/cnxml-render.js`) now emits a ground-truth attribute on every `.eoc-exercise`:

```html
<div id="…" class="eoc-exercise" data-exercise-id="…" data-exercise-number="…" data-has-answer="true|false">
```

`data-has-answer="true"` **iff** an `.answer-entry` will exist for this exercise on the answer-key page —
it uses the *same* predicate (`<solution id="…">` present) as the answer-key generator, verified 0-mismatch
on real data. It is independent of numbering. (Branch `fix/exercise-has-answer-signal`; test
`tools/__tests__/cnxml-render-has-answer.test.js`.)

**Delivery note:** the attribute only appears in `05-publication` HTML after a **re-render + sync** of
efnafraedi-2e (it's a render-code change). Until then, published exercise pages won't carry it — hence the
feature-detect fallback below.

## The vefur change (yours)

In `src/lib/actions/answerLinks.ts`, on the **exercises page** branch (around lines 239–252), replace the
parity skip with the ground-truth signal:

```ts
exercises.forEach((exercise) => {
  const exerciseId = exercise.dataset.problemId || exercise.id || exercise.dataset.exerciseId;
  const exerciseNum = exercise.dataset.exerciseNumber;
  if (!exerciseId) return;

  // Ground truth from efni: emit a link iff this exercise actually has an answer.
  const hasAnswer = exercise.dataset.hasAnswer;            // "true" | "false" | undefined
  if (hasAnswer !== undefined) {
    if (hasAnswer !== 'true') return;                      // new contract
  } else {
    // Fallback for pages rendered before the efni change: legacy parity heuristic.
    const numStr = exerciseNum || '0';
    const num = numStr.includes('.') ? parseInt(numStr.split('.')[1], 10) : parseInt(numStr, 10);
    if (num > 0 && num % 2 === 0) return;
  }

  // …unchanged: build the number-link to /{book}/svarlykill/{chapter}#{exerciseId}
});
```

Notes:
- Keep using `data-exercise-number` for the **display** label — only the *decision to emit* changes.
- The **answer-key page** branch (`.answer-entry` back-links, ~lines 274+) needs **no change** — every
  answer-entry is real, so its back-link is always valid.
- Once efnafraedi-2e is re-rendered, drop the fallback (optional cleanup).

## Also please correct (carry the corrected diagnosis into vefur)
- `namsbokasafn-vefur/docs/handoffs/2026-07-01-exercise-answer-id-mismatch-for-efni.md` — mark the
  fs-id/id-mismatch root-cause as superseded by this doc.
- vefur memory note for this bug (the "re-establish shared ids" framing) + `vefur-status-2026-07-01`.

## Acceptance
- On ch12–17 exercises pages: "Sjá svar" appears on **exactly** the exercises with answers (incl.
  even-numbered ones), and is absent on answer-less exercises — no dead links, no unreachable answers.
- ch1–11 / 18–21 unchanged (they were already aligned; ground truth agrees with parity there).
