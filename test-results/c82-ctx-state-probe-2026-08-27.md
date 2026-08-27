# §C82 — ctx-state probe for the Plan C loader (2026-08-27)

Run: `node test-results/c82-ctx-state-probe-2026-08-27.mjs` from the repo root.
Register entry: §C82 **L137**. Findings summary at the bottom.

```
ARM 1 — raw check.run(), backstop bypassed
  G1   tier0 BLOCKING -> SKIPPED examined=0
  G2   tier0 BLOCKING -> SKIPPED examined=0
  G3   tier0 BLOCKING -> SKIPPED examined=0
  G4   tier0 advisory -> SKIPPED examined=0
  G5   tier0 BLOCKING -> SKIPPED examined=0
  E1   tier1 BLOCKING -> SKIPPED examined=0
  E2   tier1 BLOCKING -> SKIPPED examined=0
  E3   tier1 BLOCKING -> SKIPPED examined=0
  E4   tier1 BLOCKING -> SKIPPED examined=0
  E5   tier1 BLOCKING -> SKIPPED examined=0
  E6   tier1 BLOCKING -> SKIPPED examined=0
  E7   tier1 advisory -> SKIPPED examined=0
  E9   tier1 BLOCKING -> SKIPPED examined=0

ARM 2 — through runCheck (backstop active)
  G1   -> SKIPPED examined=0
  G2   -> SKIPPED examined=0
  G3   -> SKIPPED examined=0
  G4   -> SKIPPED examined=0
  G5   -> SKIPPED examined=0
  E1   -> SKIPPED examined=0
  E2   -> SKIPPED examined=0
  E3   -> SKIPPED examined=0
  E4   -> SKIPPED examined=0
  E5   -> SKIPPED examined=0
  E6   -> SKIPPED examined=0
  E7   -> SKIPPED examined=0
  E9   -> SKIPPED examined=0

ARM 3 — POSITIVE CONTROL: real glossary supplied to G1-G3
  G1 -> FAIL examined=840 findings=1
  G2 -> PASS examined=838 findings=0
  G3 -> FAIL examined=838 findings=7

If ARM 3 shows only SKIPPED, ARM 1 proves nothing — the probe itself is broken.
```

## G5 partial-state arm (the arm that found the hole)

The sweep above supplies NOTHING but scope keys, and every check SKIPs.
That is the all-empty state. The hole lives in the PARTIAL state — one key
present, another shapeless — which is what a real loader produces:

```
payloadText present throughout; varying ctx.payloadVerdict:
  absent                       -> FAIL    (correct)
  null                         -> FAIL    (correct)
  {}                           -> PASS    <== SILENT
  {error:'spawn failed'}       -> PASS    <== SILENT  (most natural catch)
  []                           -> PASS    <== SILENT
  {kind:'ok'}                  -> PASS    <== SILENT
```

G5 is BLOCKING and its `examined` is hardcoded to 1, so runCheck's
`PASS + examined 0 -> SKIPPED` backstop is structurally disabled for it.
