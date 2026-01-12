#!/bin/bash
# Add frontmatter to chapter 2 markdown files

CHAPTER_DIR="books/efnafraedi/05-publication/mt-preview/chapters/ch02"

# Function to add frontmatter
add_frontmatter() {
    local file="$1"
    local title="$2"
    local section="$3"
    local type="$4"

    # Create temp file with frontmatter
    cat > "${file}.tmp" << EOF
---
title: "${title}"
chapter: 2
section: "${section}"
type: "${type}"
status: "mt-preview"
translation: "machine"
sourceBook: "OpenStax Chemistry 2e"
language: "is"
lastUpdated: "$(date +%Y-%m-%d)"
---

EOF

    # Append original content
    cat "$file" >> "${file}.tmp"
    mv "${file}.tmp" "$file"
    echo "Added frontmatter to: $file"
}

# Add frontmatter to each file
add_frontmatter "$CHAPTER_DIR/2-introduction.md" "Kafli 2: Inngangur" "intro" "introduction"
add_frontmatter "$CHAPTER_DIR/2-1-early-ideas-in-atomic-theory.md" "2.1 Fyrstu hugmyndir atómkenningarinnar" "2.1" "section"
add_frontmatter "$CHAPTER_DIR/2-2-evolution-of-atomic-theory.md" "2.2 Þróun atómkenningarinnar" "2.2" "section"
add_frontmatter "$CHAPTER_DIR/2-3-atomic-structure-and-symbolism.md" "2.3 Bygging atóma og táknmál" "2.3" "section"
add_frontmatter "$CHAPTER_DIR/2-4-chemical-formulas.md" "2.4 Efnaformúlur" "2.4" "section"
add_frontmatter "$CHAPTER_DIR/2-5-the-periodic-table.md" "2.5 Lotukerfið" "2.5" "section"
add_frontmatter "$CHAPTER_DIR/2-6-ionic-and-molecular-compounds.md" "2.6 Jóna- og sameindaefni" "2.6" "section"
add_frontmatter "$CHAPTER_DIR/2-7-chemical-nomenclature.md" "2.7 Nafnakerfi efnafræðinnar" "2.7" "section"
add_frontmatter "$CHAPTER_DIR/2-key-terms.md" "Kafli 2: Lykilhugtök" "key-terms" "reference"
add_frontmatter "$CHAPTER_DIR/2-key-equations.md" "Kafli 2: Lykiljöfnur" "key-equations" "reference"
add_frontmatter "$CHAPTER_DIR/2-summary.md" "Kafli 2: Samantekt" "summary" "reference"
add_frontmatter "$CHAPTER_DIR/2-exercises.md" "Kafli 2: Æfingar" "exercises" "exercises"
add_frontmatter "$CHAPTER_DIR/chapter-2.md" "Kafli 2: Svör við æfingum" "answers" "answers"

echo "Frontmatter added to all Chapter 2 files"
