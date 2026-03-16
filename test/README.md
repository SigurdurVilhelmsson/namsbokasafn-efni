# MT Syntax Survival Tests (Legacy)

**Note:** These are legacy test files from the markdown-era pipeline (pre-February 2026). The pipeline has since switched to CNXML-based processing, and the tools referenced below (`post-mt-pipeline.js`, `restore-links.js`, `repair-directives.js`) no longer exist. This directory is kept as historical documentation of the original MT testing approach.

**Current test infrastructure:**
- **Vitest** (424 unit tests) in `tools/__tests__/` and `server/__tests__/`
- **Playwright** (96 E2E tests) in `server/e2e/`
- Run with: `npm test` (unit) or `cd server && npm run test:e2e` (E2E)

---

## Original Purpose

This directory contains test files for analyzing how markdown syntax survives machine translation through Erlendur (malstadur.is). The methodology -- translating a sample file and comparing input/output -- remains valid as a concept for evaluating MT services, even though the specific tooling has changed.

## Files

| File | Description |
|------|-------------|
| `mt-sample.en.md` | Comprehensive test file with all syntax patterns |
| `mt-sample.is.md` | MT output (create by translating the above) |
| `mt-analysis.md` | Analysis template for documenting results |

## Original Usage

### Step 1: Translate

1. Go to https://malstadur.is
2. Upload `mt-sample.en.md` (or paste content)
3. Translate English to Icelandic
4. Download/save result as `mt-sample.is.md`

### Step 2: Analyze

1. Open `mt-analysis.md`
2. Compare input and output for each section
3. Fill in the analysis template
4. Document issues found

### Step 3: Verify

```bash
# Quick diff
diff mt-sample.en.md mt-sample.is.md | head -100

# Check for common issues
grep -n '\\[' mt-sample.is.md          # Escaped brackets
grep -n ':::' mt-sample.is.md          # Directives
grep -n '\[\[EQ:' mt-sample.is.md      # Equations
```

Note: The `post-mt-pipeline.js` command referenced in the original version of this file has been removed.

## Syntax Patterns Tested

1. **Directive Blocks**: `:::learning-objectives`, `:::example`, `:::practice-problem`, `:::note`, `:::warning`, `:::chemistry-everyday`, `:::scientist-spotlight`, `:::link-to-material`

2. **Link Syntax**: `[text]{url="..."}`, `[text]{ref="..."}`, `[text]{doc="..."}`, standard `[text](url)`

3. **Equation Placeholders**: `[[EQ:1]]`, `[[EQ:2]]{id="..."}`

4. **Image Attributes**: `{id="..." class="..." alt="..."}`

5. **Figure Captions**: `*Caption text*{id="..."}`

6. **Term Definitions**: `**term**{id="..."}`

7. **Tables**: With alignment and attribute blocks

8. **Subscripts/Superscripts**: `H~2~O`, `Na^+^`, `10^-3^`

9. **Math Delimiters**: `$...$`, `$$...$$`

10. **Special Characters**: Icelandic, Greek, mathematical symbols

11. **Nested Structures**: Directives inside directives, tables inside examples

12. **Edge Cases**: Empty blocks, back-to-back directives, punctuation after syntax
