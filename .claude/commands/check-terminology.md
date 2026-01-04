---
description: Check terminology consistency in a file or chapter
allowed-tools: Read, Grep, Glob
---

# Check Terminology

Check terminology in $ARGUMENTS.

## Process

1. Invoke the terminology-checker subagent
2. Compare against `glossary/terminology-en-is.csv`
3. Generate report

## Output

Structured terminology report (see terminology-checker subagent for format).

## Important

- Flag inconsistencies for human decision
- Don't auto-correct terminology
- Log the check in activity log
