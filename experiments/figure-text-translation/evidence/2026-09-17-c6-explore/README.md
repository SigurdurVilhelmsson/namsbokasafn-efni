# Evidence — §C140 ⑥'s STIX half and per-run kerning, read-only exploration, 2026-09-17

> 🧊 **FROZEN, 2026-09-17.** Cited, never synced. Open work and status live in the campaign register (§C140 ⑥,
> ⏩ RESUME). The design that rests on this is
> [`docs/superpowers/specs/2026-09-17-c140-c6a-stix-regular-design.md`](../../../../docs/superpowers/specs/2026-09-17-c140-c6a-stix-regular-design.md).
> **0 ISK and no renders** — the readers read code and existing evidence and ran read-only fontTools probes only.

## How it was produced

A workflow of four read-only agents: **composer** (how the composer chooses a font and what the 2026-09-13 "Plus"
prototype did), **licence** (the STIX licence evidence and [USER]'s 2026-09-16 ruling as an implementation checklist),
**kerning** (what "per-run kerning" must change), and a **critic**. A harness hook refused every agent's write of its own
report file, so each returned its report as structured output; **the controller wrote those returns here verbatim**
(`composer.md`, `licence.md`, `kerning.md`, `critic.md`). Paths and `file:line` citations inside them are the agents'.
⚠️ **The critic never saw the three explorer reports** (the refused writes left their directories empty); it re-checked
the evidence those reports rest on instead, and says so in its first section.

## What the controller verified itself

- The official `STIXGeneral-Regular.otf` 1.1.0 used by the licence evidence exists only in a session scratch directory; the
  controller copied it to a durable local cache outside the repository and confirmed its sha256
  `5add3f3f2bd7fd897d2fa5ccbe468607c52111dc44cdfaaf2d851a574f5357a7` (369,156 bytes) equals the one recorded in
  `../2026-09-16-stix-licence/reports/network-captures.txt`.
- The STIX 1.1.0 release's own licence document (the critic's "never pinned" item): `archive/STIXv1.1.0/License/STIX Font
  License 2010.pdf` in the official stipub/stixfonts repository, fetched 2026-09-17 — PDF sha256
  `f9e7dfa5f80b16145050794cf430c2473b6c060d2adbbef61bbb335d063e5680`; its `pdftotext -layout` text sha256
  `69eca010e01385fd991696cd087e03b586656936b61619cd9f7bf6cc0044dcc3`, 98 lines. The text is the SIL Open Font License 1.1
  under the STI Pub Companies' copyright header and names both reserved font names ("STIX Fonts", "TM Math"); 4 of its
  lines contain `--`, which is why licence text cannot go in an XML comment.

Every other number here is an agent's, cited to its source; the build re-measures what its design depends on
(the design's § 4).

## Headlines (each agent's own)

- **composer:** every run is drawn in one hard-coded family (`compose.py` `FAMILY`, `svgout.py` `FAMILY = 'FigIS'`) although
  the source font is known per run (`meta.json` fonts `base`, already read by `figtext.run_face` and
  `figscripts.is_symbol_run`). The "Plus" prototype extracted a STIX subset from each PDF, named it `FigSTIX`, wrote no
  notices, and built only the Regular face.
- **licence:** the strict readings' requirements as a checklist, and the open implementation choices for each (where
  licensing information can sit in an SVG; which name records must not carry a reserved name or word).
- **kerning:** "per-run kerning" is two findings over two populations — 6 kept English runs the source set unkerned, and
  28 of 647 segments drawn up to 0.99 pt short; neither is implemented.
- **critic:** split ⑥ into two PRs, STIX first. On the 34 bought figures the STIX exposure is **45 blocks in 10 figures (41
  never sent, 1 identity, 3 translated — all 3 in sandwich), all `STIXGeneral-Regular`**; the per-run kerning form reaches
  **0 kept runs** on the 34 as published; "a gap can only widen" is contradicted by Liberation's positive `r’`/`f’` kern
  pairs; reusing today's subsetter would keep "STIXGeneral" in name IDs 1/3/4/6 and the CFF names and drop the trademark
  notice (ID 7).

## Limits

- Read-only: no census was re-run on the current prepare (the build's Task 1 does that).
- Only the STIX Regular face was ever compared with an official file.
- Firefox and WebKit are not on the box.
