---
description: Identify localization opportunities for Pass 2
allowed-tools: Read, Write
---

# Identify Localization Opportunities

Identify localization opportunities in chapter $ARGUMENTS.

## Pre-flight Checks

1. Parse argument (e.g., "efnafraedi 3")
2. Format as ch{NN}
3. Verify faithful translation exists: `books/{book}/03-faithful/docx/ch{NN}/`
4. If not found, STOP: "Pass 1 must be completed first"

## Process

1. Load localization skill: read `.claude/skills/localization/SKILL.md`
2. Read all supporting files in that skill folder
3. Invoke the localization-reviewer subagent
4. Generate draft localization log

## Output Locations

- Report: Display to user
- Draft log: `books/{book}/04-localized/localization-logs/ch{NN}-log.md`
  - Only create draft if user confirms
  - Mark as DRAFT - requires human completion

## Important

- Identify opportunities; don't make changes
- Human decides which adaptations to make
- Human completes the actual localization
- Log this session in `logs/activity-log.md`
