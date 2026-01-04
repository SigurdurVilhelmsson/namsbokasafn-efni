---
name: chemistry-reader-tags
description: Apply Chemistry Reader markdown tags to educational content. Triggers when working on files in 05-publication/, applying pedagogical markup, or preparing content for the web reader.
---

# Chemistry Reader Markdown Tagging

You are applying pedagogical markdown tags for the Chemistry Reader application, used by Icelandic secondary school students (ages 15-19).

## When to Apply Tags

Look for opportunities to tag:
- **Definitions**: Key terms students need to learn -> `:::definition`
- **Practice problems**: Calculations or conceptual questions -> `:::practice-problem`
- **Warnings**: Safety or common mistakes -> `:::warning`
- **Key concepts**: Essential ideas -> `:::key-concept`
- **Checkpoints**: Self-assessment moments -> `:::checkpoint`
- **Misconceptions**: Common student errors -> `:::common-misconception`
- **Notes**: Important information -> `:::note`
- **Examples**: Worked examples -> `:::example`

## Core Principles

1. **Don't over-tag** - Not every paragraph needs a callout
2. **Use the right tag** - See `implemented-tags.md` for distinctions
3. **Icelandic titles** - Tags render with Icelandic headers (Athugid, Vidvorun, etc.)
4. **mhchem for chemistry** - Always use `$\ce{H2O}$` not `$\text{H}_2\text{O}$`

## Quick Reference

| Content Type | Tag |
|-------------|-----|
| Term + definition | `:::definition{term="..."}` |
| Worked example | `:::example` |
| Student exercise | `:::practice-problem` + `:::answer` |
| Safety/caution | `:::warning` |
| Important note | `:::note` |
| Must-know concept | `:::key-concept` |
| Self-check | `:::checkpoint` |
| Wrong thinking | `:::common-misconception` |

## References

- `implemented-tags.md` - Complete syntax for each tag
- `frontmatter-schema.md` - Required YAML frontmatter
- `mhchem-reference.md` - Chemical notation syntax
- `tagging-decisions.md` - When to use which tag

## Output Location

Tagged files go to: `books/{book}/05-publication/chapters/`
