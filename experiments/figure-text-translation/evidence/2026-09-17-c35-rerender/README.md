# 2026-09-17 — §C140 ㉟ ch03/ch04 re-render (frozen evidence)

Read **`VERIFICATION.md`** for every number. Status lives in the campaign register (§C140 ㉟), never here.

- `PREDICTIONS.md` — written before the render; `VERIFICATION.md` §2 scores each one.
- `instruments/snapshot.mjs` — the before/after instrument (gate, page lists, per-page figure/badge/token counts,
  MathJax-normalised page copies). Run from the repo root: `node <path>/snapshot.mjs <label>`; it writes beside itself.
- `reports/*.report.json` — its output at `before` (`66612e43d`), `after-render` (`6ee4232a6`), `after-fix` (`1b82049ef`).
- `reports/verify-lenses.json` — the five verification lenses (ch04-diff, ch03-mtp-text, faithful-ch03, reach,
  gate-critic) with their adversarial verdicts. Paths under `<scratchpad>/c35/agents/` were not kept.
- `logs/` — render, inject, index and oracle output.
