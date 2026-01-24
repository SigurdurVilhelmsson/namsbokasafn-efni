# MT Syntax Survival Tests

This directory contains test files for analyzing how markdown syntax survives machine translation through Erlendur (malstadur.is).

## Files

| File | Description |
|------|-------------|
| `mt-sample.en.md` | Comprehensive test file with all syntax patterns |
| `mt-sample.is.md` | MT output (create by translating the above) |
| `mt-analysis.md` | Analysis template for documenting results |

## Usage

### Step 1: Translate

1. Go to https://malstadur.is
2. Upload `mt-sample.en.md` (or paste content)
3. Translate English → Icelandic
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

# Test post-MT pipeline
node ../tools/post-mt-pipeline.js mt-sample.is.md --verbose
```

## Test Markers

The sample file includes markers for easy navigation:

- `TEST MARKER: START OF DOCUMENT`
- `TEST MARKER: END OF DIRECTIVE BLOCKS`
- `TEST MARKER: END OF LINK SYNTAX`
- etc.

Search for these in both files to locate corresponding sections.

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
