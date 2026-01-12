#!/bin/bash
# Add frontmatter to chapter 4 markdown files

CHAPTER_DIR="books/efnafraedi/05-publication/mt-preview/chapters/ch04"

add_frontmatter() {
    local file="$1"
    local title="$2"
    local section="$3"
    local type="$4"

    cat > "${file}.tmp" << EOF
---
title: "${title}"
chapter: 4
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

add_frontmatter "$CHAPTER_DIR/4-introduction.md" "Kafli 4: Inngangur" "intro" "introduction"
add_frontmatter "$CHAPTER_DIR/4-1-writing-and-balancing-chemical-equations.md" "4.1 Ritun og jöfnun efnajafna" "4.1" "section"
add_frontmatter "$CHAPTER_DIR/4-2-classifying-chemical-reactions.md" "4.2 Flokkun efnahvarfa" "4.2" "section"
add_frontmatter "$CHAPTER_DIR/4-3-reaction-stoichiometry.md" "4.3 Magnskipti efnahvarfa" "4.3" "section"
add_frontmatter "$CHAPTER_DIR/4-4-reaction-yields.md" "4.4 Afköst efnahvarfa" "4.4" "section"
add_frontmatter "$CHAPTER_DIR/4-5-quantitative-chemical-analysis.md" "4.5 Magngreining" "4.5" "section"
add_frontmatter "$CHAPTER_DIR/4-key-terms.md" "Kafli 4: Lykilhugtök" "key-terms" "reference"
add_frontmatter "$CHAPTER_DIR/4-key-equations.md" "Kafli 4: Lykiljöfnur" "key-equations" "reference"
add_frontmatter "$CHAPTER_DIR/4-summary.md" "Kafli 4: Samantekt" "summary" "reference"
add_frontmatter "$CHAPTER_DIR/4-exercises.md" "Kafli 4: Æfingar" "exercises" "exercises"
add_frontmatter "$CHAPTER_DIR/chapter-4.md" "Kafli 4: Svör við æfingum" "answers" "answers"

echo "Frontmatter added to all Chapter 4 files"
