---
name: inline-markers
description: The [[type:content]] bracket marker format used between CNXML extraction and injection. Use when working on cnxml-extract.js, cnxml-inject.js, segment text, marker survival through the Málstaður API, or when a translated segment has lost or mangled its inline formatting.
---

# Inline Marker Format (Bracket Pattern)

Extraction uses API-safe `[[type:content]]` bracket markers that achieve **100% Málstaður API survival**:

| Marker | CNXML Element | Example |
|--------|--------------|---------|
| `[[i:text]]` | `<emphasis effect="italics">` | `[[i:solid]]` → `[[i:fast efni]]` |
| `[[b:text]]` | `<emphasis effect="bold">` | `[[b:important]]` |
| `[[sub:content]]` | `<sub>` | `H[[sub:2]]O` |
| `[[sup:content]]` | `<sup>` | `Ca[[sup:2+]]` |
| `[[link:text\|url]]` | `<link url="...">` | `[[link:click here\|http://example.com]]` |
| `[[xref:id]]` | `<link target-id="..."/>` | `[[xref:CNX_Chem_05_02]]` |
| `[[xref:text\|id]]` | `<link target-id="...">` | `[[xref:Figure 5.2\|CNX_Chem_05_02]]` |
| `[[docref:doc#target]]` | `<link document="..." target-id="..."/>` | `[[docref:m68674#fs-id123]]` |
| `[[term:text\|id]]` | `<term id="...">` | `[[term:mól\|term-00042]]` (no id → `[[term:text]]`; class recovered from sidecar by id) |
| `[[fn:text\|id]]` | `<footnote id="...">` | `[[fn:Sjá viðauka A\|fs-idp2355696]]` (no id → `[[fn:text]]`) |
| `[[u:text]]` | `<emphasis effect="underline">` | `[[u:undirstrikað]]` |
| `[[em:text\|class]]` | `<emphasis class="...">` | `[[em:áhersla\|emphasis-one]]` — class rides in the marker |

**Key insight:** The API translates content inside brackets while preserving the delimiters. Legacy `{{i}}...{{/i}}` paired markers had ~2.3% loss; bracket `[[i:text]]` has 0% loss. The same loss applied to the legacy `{{term}}...{{/term}}`/`{{fn}}...{{/fn}}`/`++text++` formats (still parsed for backward compat, below) — id-anchored `[[term:|id]]`/`[[fn:|id]]` and bracket `[[u:]]`/`[[em:|class]]` (2026-07, B4) close out the last lossy inline classes at 0% loss.

Injection handles both bracket and legacy formats (backward compat) — `{{term}}text{{/term}}`, `{{fn}}text{{/fn}}`, and `++text++` are always parsed (never gated). Legacy markdown-style patterns (`*text*`, `~text~`, `^text^`, `__term__`) are skipped for API-translated segments via `hasApiMarkers` guard instead, since they'd false-match inside API-translated prose.

