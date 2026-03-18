# Design Spec: `tools/api-translate.js`

**Date:** 2026-03-18
**Status:** Approved
**Depends on:** `tools/lib/malstadur-api.js` (already built)

## Purpose

Automate the machine translation step of the Extract-Inject-Render pipeline by calling the Miðeind Málstaður API. Replaces the manual download/upload/download cycle through the malstadur.is web UI.

## Context

- T1/T2 marker survival testing (2026-03-18) confirmed all content markers survive the API intact
- **Approach A** selected: direct segment translation, no protection/unprotection needed
- API key stored in `.env` as `MALSTADUR_API_KEY`
- API client library already built at `tools/lib/malstadur-api.js`

## Architecture

```
02-for-mt/ch{NN}/m{ID}-segments.en.md     (input: raw English segments)
  → load glossary from glossary-unified.json (approved terms)
  → translateAuto() via malstadur-api.js    (sync ≤10K chars, async >10K)
  → normalizeUnicode()                      (₂→~2~, ³→^3^, etc.)
  → validate segment marker count           (input count == output count)
  → write to 02-mt-output/ch{NN}/m{ID}-segments.is.md
  → copy -links.json from 02-for-mt/ if present
```

No protection step. No file splitting. The API preserves all markers (`<!-- SEG -->`, `[[MATH:N]]`, `__term__`, `[text](url)`, `[#ref]`, `^sup^`, `~sub~`, `[[BR]]`, `[[SPACE]]`, `{{TERM}}`, `{{LINK}}`, `{{XREF}}`).

### Translation Unit

**The entire `.en.md` file is sent to the API as a single text block, markers and all.** The API translates the natural language text while preserving structural markers in place. This was validated by T1.13 (multi-paragraph segment with 4 SEG tags — all survived and paragraph structure preserved) and all 9 T2 real-segment tests.

Trade-off: sending whole files means fewer API calls (~200 per book vs ~5000+ per-segment) and the MT engine retains inter-sentence context for better translation quality. The downside is that if the API truncates a response, the entire module needs retranslation — but this is mitigated by the segment marker validation check (see below).

### Split Files

The `(b).en.md`, `(c).en.md` files in `02-for-mt/` are artifacts of `protect-segments-for-mt.js`, which splits files after applying protection for the web UI's 100K character limit. **The primary `.en.md` files contain the full module content.** This tool ignores split files entirely — the API has no such character limit (sync: 10K, async: unlimited), and we send the original unsplit files directly.

### Segment Marker Validation

After receiving the API response, count `<!-- SEG:` occurrences in both input and output. If the counts don't match, treat it as a translation failure (the API truncated or corrupted the output). Log a warning and skip writing the file.

## CLI Interface

```bash
# Single module
node tools/api-translate.js --book efnafraedi-2e --chapter 1 --module m68664

# Entire chapter
node tools/api-translate.js --book efnafraedi-2e --chapter 1

# Entire book
node tools/api-translate.js --book efnafraedi-2e

# Force re-translate (overwrite existing)
node tools/api-translate.js --book efnafraedi-2e --chapter 1 --force

# Dry run (show plan + cost estimate)
node tools/api-translate.js --book efnafraedi-2e --dry-run

# Skip glossary
node tools/api-translate.js --book efnafraedi-2e --chapter 1 --no-glossary
```

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--book` | string | `efnafraedi-2e` | Book slug |
| `--chapter` | string/number | null | Chapter number (omit for whole book) |
| `--module` | string | null | Single module ID (requires --chapter) |
| `--force` | boolean | false | Overwrite existing output files |
| `--dry-run, -n` | boolean | false | Show plan without translating |
| `--no-glossary` | boolean | false | Skip glossary in API requests |
| `--rate-delay` | number | 500 | Milliseconds between API calls |
| `-v, --verbose` | boolean | false | Show detailed progress |
| `-h, --help` | boolean | false | Show help |

## Key Behaviors

### Resumability
Skip modules that already have a `.is.md` file in `02-mt-output/` (unless `--force`). This makes the tool safe to re-run after partial failures — only untranslated modules get sent to the API.

### Error Handling
1. API client retries 3x with exponential backoff (built into `malstadur-api.js`)
2. If a module still fails after retries, log the error and continue to the next module
3. Report all failures in the final summary
4. Exit with code 1 if any modules failed

### Glossary
- Load `books/{book}/glossary/glossary-unified.json`
- Filter to `status === 'approved'` terms only
- Convert to API format via `formatGlossary()` with domain derived from book slug (e.g., `efnafraedi-2e` → `'chemistry'`, `liffraedi-2e` → `'biology'`)
- Send with every translation request
- Skip gracefully if: glossary file doesn't exist, or no approved terms after filtering (warn, don't fail)

### Unicode Normalization
Post-process API output to convert Unicode sub/superscripts back to markdown format:

```
Subscripts:  ₀→~0~ ₁→~1~ ₂→~2~ ₃→~3~ ₄→~4~ ₅→~5~ ₆→~6~ ₇→~7~ ₈→~8~ ₉→~9~
             ₊→~+~ ₋→~-~ ₌→~=~ ₍→~(~ ₎→~)~
Superscripts: ⁰→^0^ ¹→^1^ ²→^2^ ³→^3^ ⁴→^4^ ⁵→^5^ ⁶→^6^ ⁷→^7^ ⁸→^8^ ⁹→^9^
              ⁺→^+^ ⁻→^-^ ⁼→^=^ ⁽→^(^ ⁾→^)^
```

Also normalize common Unicode fraction/symbol replacements if the API produces them.

Note: Unicode normalization is safe because `[[MATH:N]]` placeholders contain no actual mathematical notation — math content is stored separately in `equations.json` and restored during injection. The normalization only affects the translatable text between markers.

### Links JSON
Copy `-links.json` files from `02-for-mt/` to `02-mt-output/` for each translated module. These are needed by:
- `unprotect-segments.js` (if user runs legacy pipeline)
- `cnxml-inject.js` for link restoration during injection

### API Key Loading
Read from `MALSTADUR_API_KEY` environment variable. If not already set in the shell environment, the tool loads the root `.env` file (simple `KEY=VALUE` parser — skip comments and empty lines, no `dotenv` dependency). Shell environment takes precedence over `.env` values.

### Input Validation
- If `--module` is provided without `--chapter`, exit with an error
- If no modules found for the specified scope, exit with an informative message

### Cost Tracking
After all translations complete, report:
- Total characters sent
- Total API cost in ISK
- Number of modules translated, skipped, and failed
- Elapsed time

## Output Format

The output file (`m{ID}-segments.is.md`) uses the same format as existing files in `02-mt-output/`:

```markdown
<!-- SEG:m68664:title:auto-1 --> Efnafræði í samhengi

<!-- SEG:m68664:abstract:auto-2 --> Þegar þessum kafla lýkur muntu geta:

<!-- SEG:m68664:para:fs-idp77567568 --> Í gegnum mannkynssöguna...
```

This is directly consumable by `cnxml-inject.js` — no intermediate processing needed.

## Module Discovery

To find translatable modules for a chapter:

1. List `books/{book}/02-for-mt/ch{NN}/` directory
2. Find all files matching `m*-segments.en.md` (exclude split files like `(b).en.md`)
3. For each, check if corresponding `.is.md` exists in `02-mt-output/ch{NN}/`
4. Skip existing unless `--force`

For whole-book translation, iterate all `ch{NN}` directories (in numerical order) plus `appendices/` if present.

The tool does NOT depend on `chapter-modules.js` (which is chemistry-specific) — it discovers modules from the filesystem, making it work for any book.

## File Dependencies

| File | Role | Status |
|------|------|--------|
| `tools/lib/malstadur-api.js` | API client (translate, glossary, usage) | Built |
| `tools/lib/parseArgs.js` | CLI argument parsing | Existing |
| `tools/api-translate.js` | **This tool** | To build |
| `books/{book}/glossary/glossary-unified.json` | Terminology source | Existing |
| `.env` | API key storage | Created |

## Testing

### Unit Tests (in `tools/__tests__/api-translate.test.js`)
1. `normalizeUnicode()` — verify all subscript/superscript conversions
2. `loadEnvFile()` — verify `.env` parsing, shell precedence
3. Module discovery — verify correct files found, split files excluded
4. Skip-existing logic — verify existing `.is.md` files cause skip
5. Segment marker validation — verify mismatch detection (input vs output marker count)
6. Glossary loading — verify approved-only filtering, graceful fallback when no approved terms
7. Domain derivation — verify book slug → glossary domain mapping
8. Error recovery — verify that a failing module doesn't prevent subsequent modules from translating

### Integration Test (requires API key, opt-in via `MALSTADUR_API_KEY`)
1. Translate a single small module via real API
2. Verify output has same `<!-- SEG -->` marker count as input
3. Verify output is consumable by `cnxml-inject.js`
4. Verify async path works for a module > 10K chars

## Cost Estimates

| Scope | Modules | Est. Characters | Est. Cost |
|-------|---------|----------------|-----------|
| 1 chapter (ch01) | 7 | ~200K | ~1,000 ISK |
| Chemistry 2e (full) | 197 | ~3.9M | ~19,500 ISK |
| Biology 2e (full) | ~255 | ~12M | ~60,000 ISK |

## Implementation Notes

- Use `fileURLToPath` guard so the module can be imported for testing without running `main()`
- Use `fs.writeFileSync` (not `safeWrite()`) since output is purely generated and can be retranslated at any time — no irreplaceable data
- Follow existing patterns: `BOOKS_DIR` variable, `formatChapter()` for chapter directory names, `printHelp()` function
- The `--no-glossary` flag is implemented as `{ name: 'noGlossary', flags: ['--no-glossary'], type: 'boolean' }` (same pattern as `cnxml-inject.js`'s `--no-annotate-en`)
- The `--rate-delay` option is passed to `createClient({ rateDelayMs })` — it replaces the client's default, not an additional delay

## Future Extensions (Not in Scope)

- Server UI for triggering translations (separate feature)
- Pipeline status integration (update `chapter_pipeline_status` after translation)
- Comparison mode (diff API output vs existing MT output)
- Custom glossary subsets per chapter
- `--chapters` range option (e.g., `--chapters 5-9`) for partial book translation
