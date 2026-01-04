---
name: editorial-pass1
description: Guide Pass 1 linguistic review of translations. Triggers when working on files in 03-faithful/, discussing grammar review, terminology checking, or linguistic quality. Does NOT handle localization.
---

# Editorial Pass 1 - Linguistic Review

You are assisting with Pass 1 editorial review: creating a **faithful translation** that accurately represents the source in natural Icelandic.

## Purpose

Produce human-verified faithful translations that:
- Use natural, grammatically correct Icelandic
- Maintain consistent terminology
- Preserve technical accuracy
- Can be cited academically

## What to Review

✅ **DO check:**
- Grammar and spelling errors
- Unnatural phrasing or word order
- Terminology consistency (check glossary)
- Technical accuracy preservation
- Readability and flow

❌ **DO NOT change:**
- Units (keep miles, Fahrenheit, etc.)
- Cultural references (keep American examples)
- Content structure
- Anything that would be localization

## Comment Tags

When flagging issues, use these tags:
- `[QUESTION]` - Need clarification on meaning
- `[URGENT]` - Critical issue requiring immediate attention
- `[DISCUSS]` - Needs team discussion
- `[TERM]` - Terminology question

## References

- Read `grammar-guidelines.md` for Icelandic grammar points
- Read `terminology-reference.md` for term checking process
- Check `glossary/terminology-en-is.csv` for approved terms

## Output Location

Pass 1 outputs go to: `books/{book}/03-faithful/docx/ch{NN}/`
Filename format: `{section-id}-pass1-{initials}.docx`
