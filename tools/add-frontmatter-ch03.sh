#!/bin/bash
# Add frontmatter to chapter 3 markdown files

CHAPTER_DIR="books/efnafraedi/05-publication/mt-preview/chapters/ch03"

add_frontmatter() {
    local file="$1"
    local title="$2"
    local section="$3"
    local type="$4"

    cat > "${file}.tmp" << EOF
---
title: "${title}"
chapter: 3
section: "${section}"
type: "${type}"
status: "mt-preview"
translation: "machine"
sourceBook: "OpenStax Chemistry 2e"
language: "is"
lastUpdated: "$(date +%Y-%m-%d)"
---

EOF

    cat "$file" >> "${file}.tmp"
    mv "${file}.tmp" "$file"
    echo "Added frontmatter to: $file"
}

add_frontmatter "$CHAPTER_DIR/3-introduction.md" "Kafli 3: Inngangur" "intro" "introduction"
add_frontmatter "$CHAPTER_DIR/3-1-formula-mass-and-the-mole-concept.md" "3.1 Formúlumassi og mólhugtakið" "3.1" "section"
add_frontmatter "$CHAPTER_DIR/3-2-determining-empirical-and-molecular-formulas.md" "3.2 Ákvörðun reynsluformúla og sameindaformúla" "3.2" "section"
add_frontmatter "$CHAPTER_DIR/3-3-molarity.md" "3.3 Mólstyrkur" "3.3" "section"
add_frontmatter "$CHAPTER_DIR/3-4-other-units-for-solution-concentrations.md" "3.4 Aðrar einingar fyrir styrk lausna" "3.4" "section"
add_frontmatter "$CHAPTER_DIR/3-key-terms.md" "Kafli 3: Lykilhugtök" "key-terms" "reference"
add_frontmatter "$CHAPTER_DIR/3-key-equations.md" "Kafli 3: Lykiljöfnur" "key-equations" "reference"
add_frontmatter "$CHAPTER_DIR/3-summary.md" "Kafli 3: Samantekt" "summary" "reference"
add_frontmatter "$CHAPTER_DIR/3-exercises.md" "Kafli 3: Æfingar" "exercises" "exercises"
add_frontmatter "$CHAPTER_DIR/chapter-3.md" "Kafli 3: Svör við æfingum" "answers" "answers"

echo "Frontmatter added to all Chapter 3 files"
