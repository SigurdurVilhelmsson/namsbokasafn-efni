# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Progress tracking system with status files at multiple levels
  - `CLAUDE.md` - Instructions for Claude Code when working in this repo
  - `STATUS.md` - Overall project status dashboard
  - `books/efnafraedi/STATUS.md` - Detailed Chemistry book tracking
  - `books/efnafraedi/chapters/ch01-21/status.json` - Per-chapter JSON status
  - `scripts/update-status.js` - Placeholder for status automation

## [0.3.0] - 2025-12-17

### Added
- Two-pass editorial workflow producing multiple valuable assets
- New directory structure:
  - `03-faithful/` - Human-verified faithful translation
  - `04-localized/` - Localized version with SI units and Icelandic context
  - `glossary/` - Terminology files (CSV format)
  - `tm/exports/` - Translation memory exports
- Chapter subdirectories (ch01, ch02) in source/faithful/localized folders
- Complete README.md with Icelandic and English sections
- New documentation:
  - 8-step workflow with ASCII diagrams
  - Editorial guide for two-pass review process
  - Assets documentation describing valuable outputs
  - Expanded terminology standards with chemistry terms
- New templates:
  - `localization-log.md` for documenting Pass 2 changes
  - `editorial-checklist.md` for editor workflow
  - Updated `chapter-status.json` with full workflow stages
- New tool placeholders:
  - `export-parallel-corpus.js`
  - `validate-chapter.js`
- Terminology glossary (`terminology-en-is.csv`)

### Changed
- Renamed `02-machine-translation/` → `02-mt-output/`
- Renamed `06-publication/` → `05-publication/`
- Updated metadata.json for both books
- Updated package.json with new scripts and metadata

### Removed
- `03-tm-translated/` (merged into new workflow)
- `04-editor-review/` (replaced by two-pass system)
- `05-final-docx/` (replaced by 03-faithful/)

## [0.2.0] - 2025-12-16

### Added
- Complete directory structure for translation management
- Chemistry book (efnafræði) setup with 21 chapters
- Biology book (líffræði) placeholder with 47 chapters
- Numbered folders (01-06) tracking translation pipeline stages:
  - `01-source/` - Original OpenStax files
  - `02-machine-translation/` - MT output
  - `03-tm-translated/` - TM-assisted translation
  - `04-editor-review/` - Editorial review
  - `05-final-docx/` - Final documents
  - `06-publication/` - Web-ready markdown
- Documentation in `docs/`:
  - Workflow guide
  - Terminology standards
  - Contributing guide
- Templates in `templates/`:
  - Frontmatter template
  - Chapter status template
- Tool placeholders in `tools/`
- Book metadata files:
  - `metadata.json` - Book information
  - `toc.json` - Table of contents
  - `glossary.json` - Terminology
- Translation memory folders for Matecat exports

## [0.1.0] - 2025-05-18

### Added
- Initial commit
- Repository created for Icelandic OpenStax translations
- LICENSE file (CC BY 4.0)
- Basic README.md
- .gitignore configuration
