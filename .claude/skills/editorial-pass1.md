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

## Output Location

Pass 1 outputs go to: `books/{book}/03-faithful/docx/ch{NN}/`
Filename format: `{section-id}-pass1-{initials}.docx`

---

## Grammar Guidelines

### Common MT Errors to Watch For

**Declension Errors:**
- Incorrect noun cases (nefnifall, þolfall, þágufall, eignarfall)
- Wrong adjective agreement with nouns
- Pronoun case errors

**Word Order Issues:**
- English word order preserved incorrectly
- Verb placement errors (V2 rule in main clauses)
- Adjective placement (generally before noun in Icelandic)

**Verb Errors:**
- Incorrect verb conjugation
- Wrong tense usage
- Subject-verb agreement errors

### Punctuation Conventions

- Quotation marks: „text" (not "text")
- Decimal separator: comma (3,14 not 3.14)
- Thousands separator: period or space (1.000 or 1 000)

### Style for Secondary School Audience

- Clear, accessible language
- Explain technical terms on first use
- Avoid unnecessarily complex sentence structures
- Maintain appropriate register (formal but not stiff)

---

## Terminology Reference

### Checking Process

1. **First:** Check project glossary at `glossary/terminology-en-is.csv`
2. **Second:** Check `docs/editorial/terminology.md` for guidelines
3. **Third:** Search [Íðorðabankinn](https://idord.arnastofnun.is/)
4. **Fourth:** Check [Orðabanki HÍ](https://ordabanki.hi.is/)
5. **If still unsure:** Flag with `[TERM]` comment for discussion

### Key Chemistry Terms

| English | Icelandic |
|---------|-----------|
| atom | atóm |
| molecule | sameind |
| element | frumefni |
| compound | efnasamband |
| electron | rafeind |
| proton | róteind |
| neutron | nifteind |
| ion | jón |
| mole | mól |
| reaction | efnahvarf |
| solution | lausn |
| periodic table | lotukerfi |

### Terminology Principles

1. **Prefer established terms** - Use what's in Íðorðabankinn
2. **Follow Icelandic patterns** - -eind (particle), -efni (substance), -hvarf (transformation)
3. **Be consistent** - Same term throughout entire book
4. **Document decisions** - Add new terms to glossary with source

### Flagging Unknown Terms

When you encounter an unknown term:
1. Add comment: `[TERM] "English term" - suggested: "íslenskt hugtak" - source: {where you found it}`
2. If no source found: `[TERM] "English term" - needs decision`
