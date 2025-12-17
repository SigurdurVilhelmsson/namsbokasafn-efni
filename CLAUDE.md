# Claude Code Instructions for namsbokasafn-efni

## Repository Purpose

This repo manages the translation workflow for Icelandic OpenStax textbook
translations. Content flows through stages from source to publication.

## Directory Structure

- `books/[book-id]/01-source/` - Original OpenStax files
- `books/[book-id]/02-mt-output/` - Machine translation output (reference)
- `books/[book-id]/03-faithful/` - After editorial Pass 1 (human-verified)
- `books/[book-id]/04-localized/` - After editorial Pass 2 (adapted for Iceland)
- `books/[book-id]/05-publication/` - Web-ready markdown files
- `books/[book-id]/tm/` - Translation memory exports
- `books/[book-id]/glossary/` - Terminology files

## Workflow Stages

1. Source → 2. MT → 3. Matecat → 4. Pass 1 (linguistic) → 5. TM Update →
6. Pass 2 (localization) → 7. Publish

## Key Files to Update

- `STATUS.md` - Overall project status (root)
- `books/efnafraedi/STATUS.md` - Book-specific status
- `books/efnafraedi/chapters/chXX/status.json` - Chapter-level tracking

## When Asked to Update Progress

1. Read current STATUS.md files
2. Ask what has changed (or accept input)
3. Update relevant status files
4. Update any dates/timestamps
5. Commit with clear message: "status: Update chX progress - [stage completed]"

## Status Symbols

- ✅ Complete
- 🔄 In progress
- ⏳ Pending/Waiting
- ❌ Blocked
- `-` Not started

## Current Priority

Pilot at FÁ school, January 2026. Priority is chapters 1-4 faithful translations.
