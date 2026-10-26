# D11: the free checks before the go (2026-10-26)

Run on `feat/d11-june-wire` at `0a462ad9b`. Cost 0 ISK. Nothing reached the network: each dry run had a fake
`MALSTADUR_API_KEY`, so the repository's `.env` key was never loaded, and a dry run exits before it creates an API
client. `--update-status` was never passed. The design is [`../../DESIGN.md`](../../DESIGN.md) (§5 cost, §6 mechanism).

**Result: every check passes.** The fresh English equals the committed English, so the payloads measured on
2026-10-24 are what the buy will send. Each wire loads the expected glossary. The ceiling is under the cap. The real
tree is unchanged.

## 1. The scratch tree

A folder in the session's scratch area (RAM-backed; it does not survive a reboot) holding exactly three files:

| file | what it is |
|---|---|
| `books/efnafraedi-2e/glossary/glossary-unified.json` | `git show 5db701c92:books/efnafraedi-2e/glossary/glossary-unified.json`; sha256 `72442b487af6e1950501c00910fcca818f3566a74bad6833db78fad0024c9d0d`, the test fixture's pin |
| `cnxml/ch01/m68667.cnxml` | byte copy of `books/efnafraedi-2e/01-source/ch01/m68667.cnxml` |
| `cnxml/ch11/m68781.cnxml` | byte copy of `books/efnafraedi-2e/01-source/ch11/m68781.cnxml` |

It holds no `02-for-mt`, `02-structure` or `02-mt-output`. So `safeWrite` has nothing to back up, `logBackup` never
opens a database, and `mtRunDecision` returns `write`, which makes the dry run size the whole module.

⚠️ **The CNXML is not under a folder named `01-source`.** The repository's hook
(`.claude/hooks/guard-01-source.mjs`) refuses any `cp` into a path containing `01-source/`, a scratch path included.
Extraction therefore used `cnxml-extract --input <file>`. Its segment output is the same as `--chapter --module`'s:
both modes pass the file's text to `extractSegments`. The one difference in its output is `structure.json`'s
`sectionOrder` (null under `--input`; `2` in the committed files), which `api-translate` does not read.

## 2. Commands (cwd = the scratch folder)

```
node <repo>/tools/cnxml-extract.js --book efnafraedi-2e --input cnxml/ch01/m68667.cnxml
node <repo>/tools/cnxml-extract.js --book efnafraedi-2e --input cnxml/ch11/m68781.cnxml

MALSTADUR_API_KEY=<fake> node <repo>/tools/api-translate.js --book efnafraedi-2e \
    --chapter <1|11> --module <m68667|m68781> <ARM> --dry-run --verbose
#   ARM = --full-glossary --june-wire   (M, June's wire)
#         --full-glossary               (S, today's wire)
#         --no-glossary                 (no glossary)
```

## 3. Re-extraction

m68667: 214 segments; m68781: 59 segments. **Both `*-segments.en.md` are byte-identical to the committed
`02-for-mt`** (last changed at `1c61e9c42`), and so are both modules' `equations.json` and `inline-attrs.json`.

| file | sha256 |
|---|---|
| `02-for-mt/ch01/m68667-segments.en.md` | `11290fe6d76997fa4b4b29e80ac286fd902fa64675fac62417fe8b0ea0a3bdd3` |
| `02-for-mt/ch11/m68781-segments.en.md` | `d7cd4c29078ac5d70cfd3b5e26fafbba7302a73ac70078f4861a0513b3329f2d` |

So the per-chunk payloads in [`../2026-10-24/wire-compare.json`](../2026-10-24/wire-compare.json) are the buy's:
June's wire 56 pairs (m68781) and 55 + 61 (m68667's two chunks); today's 49, and 51 + 55. The oracle test
(`tools/__tests__/api-translate-june-wire-oracle.test.js`), which checks them through the real `translateModule`
path, passes at `0a462ad9b`.

## 4. The dry runs

| module | arm | glossary loaded | to translate | characters | estimate |
|---|---|---|---:|---:|---:|
| m68667 | M (June's wire) | 617 terms | 1 | 45,279 | ~453 ISK |
| m68667 | S (today's wire) | 590 terms (27 withheld: contested or comma-list) | 1 | 45,279 | ~453 ISK |
| m68667 | no glossary | none | 1 | 45,279 | ~453 ISK |
| m68781 | M (June's wire) | 617 terms | 1 | 15,357 | ~154 ISK |
| m68781 | S (today's wire) | 590 terms (27 withheld) | 1 | 15,357 | ~154 ISK |
| m68781 | no glossary | none | 1 | 15,357 | ~154 ISK |

All six exit 0 and report `Already done: 0`. The M runs print `Glossary wire: june`; the S runs, `today`. **The
estimate is the same for every arm by construction:** `estimateIsk` counts the module's text only. The design's
billing model (§5) also counts module text only, so it predicts the same cost for every arm.

## 5. Cost (3 arms × 2 runs, both modules in each run)

| basis | one run | six runs | plus a fifth for retries |
|---|---:|---:|---:|
| ceiling: the dry run's raw characters at 0.01 ISK | 606 | 3,638 | **4,366** |
| expectation: §5's model, less the SEG marker lines and one newline per segment (m68667 360, m68781 126) | 486 | 2,915 | 3,498 |

The cap is ISK 5,000.

## 6. The real tree is unchanged

- A metadata listing (path, size, mtime) of the real `books/efnafraedi-2e/{01-source,02-for-mt,02-structure,02-mt-output,glossary}`
  and of `pipeline-output/sessions.db`, 22,676 entries, is identical before and after. Unlike `git status`, it also
  sees ignored files, such as a `safeWrite` backup.
- `git status --porcelain --ignored -- books pipeline-output` is identical before and after (36,845 lines), and
  `git status --porcelain` is empty.
- **Positive control:** the same listing on the scratch tree went from 1 file to 11.
- **Contrast control:** the same `--full-glossary` dry run of m68667 from the repository root loaded the current
  export (1,746 terms sent, 2 withheld) and reported the module as already done. From the scratch folder it loaded
  the March file and reported the module as unbought.

## 7. For the buy (at [USER]'s go, Wed 28 Oct)

- Rebuild the scratch tree as in §1 and §2 and check the two hashes in §3 before buying. If either differs, the
  payload counts above do not apply.
- **Each run needs its own output.** A run writes `02-mt-output/<ch>/<module>-segments.is.md` and its sidecar in the
  scratch tree, and `mtRunDecision` skips a module whose output exists. So the second run of a module, in any arm,
  is skipped unless that output is moved aside first. Use a fresh scratch tree per run, or copy each run's output
  and sidecar out and then pass `--force`.
- Per run, check the sidecar: `run.glossary.wire` (`june` for M, `today` for S, null for no glossary) and
  `chunksWithGlossary === chunksTotal`, because a truncation retry drops the glossary (DESIGN §7).
- Never pass `--update-status`.
