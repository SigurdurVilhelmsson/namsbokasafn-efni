---
name: review-protocol
description: Define handoff points between Claude Code and human reviewers. Ensures AI outputs are properly reviewed before advancing workflow stages.
---

# Human Review Protocol

## Core Principle

**Claude Code assists; humans decide.**

All substantive changes to translation content require human review and approval before the workflow advances.

## Mandatory Review Points

### 1. After Pass 1 AI Suggestions
- Claude Code generates suggestions
- Human editor reviews each suggestion
- Human accepts/rejects in Word (Track Changes)
- Human marks as approved in files.json
- Only then can Pass 2 begin

### 2. After Localization Recommendations
- Claude Code identifies opportunities
- Human decides which adaptations to make
- Human completes the actual localization
- Human fills in localization log
- Human marks as approved

### 3. After Tagging Suggestions
- Claude Code proposes tags
- Human reviews pedagogical appropriateness
- Human approves or adjusts tags
- Human marks as approved

### 4. Before Publication
- All content must have `approved: true` in files.json
- Human explicitly authorizes publication
- No automatic publication without approval

## Review Status Values

In `files.json`, each file has:

```json
{
  "pendingReview": null | "pass1" | "localization" | "tagging",
  "approved": false | true,
  "reviewedBy": null | "human" | "{name}"
}
```

## Claude Code Behavior by Status

### File is PENDING REVIEW
Claude Code may:
- Read the file
- Generate reports about the file
- Remind user review is needed

Claude Code may NOT:
- Modify the file
- Advance to next workflow stage
- Mark as complete

### File is APPROVED
Claude Code may:
- Proceed to next stage
- Process and generate new outputs
- Must create backup before modifying
- Must mark new output as PENDING REVIEW

### File is NOT YET PROCESSED
Claude Code may:
- Process and generate outputs
- Must mark output as PENDING REVIEW
- Must log the action

## Review Checklist Template

When presenting work for review:

```markdown
## Ready for Review: {filename}

**Stage:** {Pass 1 / Localization / Tagging}

**Changes proposed:**
1. {change 1}
2. {change 2}
...

**Terminology decisions:**
- {term}: {decision}

**Questions for reviewer:**
- {question 1}
- {question 2}

**To approve:** Update files.json with `"approved": true`
**To request changes:** Note issues and Claude Code will revise
```

## Escalation

If Claude Code is uncertain:
- Flag with `[DISCUSS]` or `[QUESTION]`
- Do not proceed with uncertain changes
- Document the uncertainty in activity log
- Wait for human guidance
