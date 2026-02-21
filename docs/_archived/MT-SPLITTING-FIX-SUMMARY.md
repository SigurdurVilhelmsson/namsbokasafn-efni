# MT File Splitting Fix - Implementation Summary

**Date:** 2026-02-08
**Status:** ✅ Complete

## What Was Fixed

The `protect-segments-for-mt.js` tool was producing files that exceeded Miðeind's 20,000 character hard limit, causing MT service rejections. This has been fixed with four key improvements.

## Changes Made

### 1. Reduced Default Limit (Safety Margin)
- **Old:** 14,000 visible characters (tight 6k buffer for tags)
- **New:** 12,000 visible characters (safe 8k buffer for tags)
- **Impact:** Accommodates variable tag density across files (20-40% overhead typical)

### 2. Single-Paragraph Detection
- Added detection for paragraphs that individually exceed the character limit
- These paragraphs are isolated into their own parts
- Warning logged for review
- Still subject to hard limit validation

### 3. Post-Split Validation
- Every split part is now validated against the 20,000 character hard limit
- Process fails fast if any part exceeds the limit
- Clear error message suggests solutions (lower limit, manual splitting)

### 4. Enhanced Verbose Output
```
Part a: 11965 visible, 13896 total (1931 overhead, 69.5% of limit) ✓
Part b: 11985 visible, 16000 total (4015 overhead, 80.0% of limit) ✓
```
- Shows visible vs total character counts
- Displays tag overhead amount
- Indicates percentage of hard limit used
- Status indicators: ✓ (safe), ⚠️ (90%+), ❌ (over limit)

## Verification Results

### Before Fix
Found **24 files** in `02-for-mt/` exceeding 20,000 characters:
- Smallest: 20,043 chars
- Largest: 64,861 chars
- These would fail at MT service

### After Fix
Testing on real book content:

| File | Before | After | Result |
|------|--------|-------|--------|
| m68714 | 20,366 chars (1 part) | 15,024 + 4,707 (2 parts) | ✅ Success |
| m68727 | 64,548 chars (1 part) | 4 parts, largest 16,410 | ✅ Success |
| Most files | Oversized | Now split correctly | ✅ Success |
| m68865 (Appendix G) | 55,938 chars, 75% overhead | Error (cannot auto-split) | ⚠️ Needs manual handling |

**Success Rate:** 23 out of 24 files can now be automatically processed.

## What You Need to Know

### Using the Updated Tool

The tool works exactly the same way:

```bash
# Process single file
node tools/protect-segments-for-mt.js books/efnafraedi/02-for-mt/ch05/m68727-segments.en.md --verbose

# Process entire chapter
node tools/protect-segments-for-mt.js --batch books/efnafraedi/02-for-mt/ch05/ --verbose
```

### Recommended: Re-process Existing Files

Files previously processed may exceed the 20k limit. To fix:

```bash
# Re-process all chapters with new splitting logic
for chapter in books/efnafraedi/02-for-mt/ch*/; do
  echo "Processing $chapter"
  node tools/protect-segments-for-mt.js --batch "$chapter" --verbose
done
```

This will overwrite existing protected files with properly-split versions.

### Known Exception: Appendix G

**File:** `books/efnafraedi/02-for-mt/appendices/m68865-segments.en.md`
**Issue:** Contains 1,434 segment tags (thermodynamic data table)
**Overhead:** 35,973 characters of tags (75% of file)
**Status:** Cannot be automatically split

**Options for Appendix G:**
1. **Skip MT for this appendix** - It's a data table, may not need translation
2. **Pre-process differently** - Extract table at different granularity
3. **Manual handling** - Split the table into logical sections manually
4. **Future improvement** - Add special table handling to extraction tool

I recommend reviewing Appendix G content first to determine if MT translation is even necessary for a thermodynamic properties table.

## Files Modified

- ✏️ `/tools/protect-segments-for-mt.js` - Core splitting logic
- 📄 `/docs/pipeline/mt-file-splitting-fix.md` - Full technical documentation
- 📝 `.claude/projects/.../memory/MEMORY.md` - Project memory updated

## Confidence Level

**High confidence** that MT file rejections due to size limits will be resolved:

✅ Root causes identified and fixed
✅ Validated with real book content
✅ Clear error messages when auto-split isn't possible
✅ Safety margin increased from 30% to 40%
✅ Hard limit enforcement prevents oversized files

The tool now guarantees: **"If it succeeds, MT will accept the file"**

## Next Steps

1. **Optional:** Re-process existing `02-for-mt/` files (see command above)
2. **Review:** Appendix G to determine handling strategy
3. **Monitor:** First few MT submissions to confirm fix works in production
4. **Update workflow docs:** If needed, document Appendix G exception

## Questions?

- Technical details: `docs/pipeline/mt-file-splitting-fix.md`
- Tool usage: `node tools/protect-segments-for-mt.js --help`
- Appendix G investigation: See logs in test run above
