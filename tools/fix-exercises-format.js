#!/usr/bin/env node

/**
 * fix-exercises-format.js
 *
 * Converts exercises from old format to new format:
 * - Changes :::exercise{id="fs-xxx"} to :::exercise{#fs-xxx number=N}
 * - Extracts inline :::answer blocks to separate answer-key file
 * - Creates properly formatted answer-key.md file
 *
 * Usage: node fix-exercises-format.js <chapter> [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOOK_PATH = path.join(__dirname, '../books/efnafraedi/05-publication/mt-preview/chapters');

/**
 * Extract exercises section from a markdown file
 * Handles multiple formats:
 * Format 1: :::exercise{id="xxx"}\n content \n:::
 * Format 2: :::exercise{id="xxx"} content on same line...\n more content\n:::
 * Format 3: :::answer content...\n::: :::
 *
 * Returns array of {id, lines, hasAnswer, answerLines}
 */
function extractExercisesFromSection(filePath, sectionTitle) {
  if (!fs.existsSync(filePath)) {
    return { exercises: [], sectionTitle: null };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const exercises = [];

  // Use regex to find all exercise blocks
  // Pattern matches :::exercise{id="xxx"} or :::exercise{#xxx ...}
  const exerciseStarts = [...content.matchAll(/:::exercise\{(?:id="([^"]+)"|#([^\s}]+)[^}]*)\}/g)];

  for (let i = 0; i < exerciseStarts.length; i++) {
    const match = exerciseStarts[i];
    const exerciseId = match[1] || match[2];
    const startPos = match.index + match[0].length;

    // Find the end of this exercise (next exercise start or end of content)
    const endPos = i < exerciseStarts.length - 1 ? exerciseStarts[i + 1].index : content.length;

    // Get the content between this exercise start and the next one (or end)
    const blockContent = content.slice(startPos, endPos);

    // Check for :::answer within this block
    const answerMatch = blockContent.match(/\n?:::answer\s*/);
    let exerciseContent = '';
    let answerContent = '';
    let hasAnswer = false;

    if (answerMatch) {
      hasAnswer = true;
      // Content before :::answer is exercise content
      exerciseContent = blockContent.slice(0, answerMatch.index);

      // Content after :::answer (until ::: close) is answer content
      const afterAnswer = blockContent.slice(answerMatch.index + answerMatch[0].length);

      // Find the closing ::: for the answer
      // Could be just ::: or ::: ::: (double close)
      const answerCloseMatch = afterAnswer.match(/\n:::\s*(?:::)?/);
      if (answerCloseMatch) {
        answerContent = afterAnswer.slice(0, answerCloseMatch.index);
      } else {
        answerContent = afterAnswer;
      }
    } else {
      // No answer - find the closing ::: for the exercise
      const closeMatch = blockContent.match(/\n:::\s*$/m);
      if (closeMatch) {
        exerciseContent = blockContent.slice(0, closeMatch.index);
      } else {
        // Try to find just ::: on its own line
        const closeMatch2 = blockContent.match(/\n:::\n/);
        if (closeMatch2) {
          exerciseContent = blockContent.slice(0, closeMatch2.index);
        } else {
          exerciseContent = blockContent;
        }
      }
    }

    // Clean up exercise content - remove trailing ::: if present
    exerciseContent = exerciseContent.replace(/\n:::(\s*:::)?\s*$/g, '').trim();
    answerContent = answerContent.replace(/\n:::(\s*:::)?\s*$/g, '').trim();

    // Split into lines
    const exerciseLines = exerciseContent.split('\n').map((l) => (l.trim() === '' ? '' : l));

    const answerLines = answerContent
      ? answerContent.split('\n').map((l) => (l.trim() === '' ? '' : l))
      : [];

    exercises.push({
      id: exerciseId,
      lines: exerciseLines,
      hasAnswer,
      answerLines,
    });
  }

  return { exercises, sectionTitle };
}

function fixExercisesFormat(chapter, dryRun = false) {
  const chapterDir = path.join(BOOK_PATH, chapter.toString().padStart(2, '0'));
  const exercisesPath = path.join(chapterDir, `${chapter}-exercises.md`);
  const answerKeyPath = path.join(chapterDir, `${chapter}-answer-key.md`);

  // Collect exercises from all sources
  const allExercises = [];
  const sectionInfo = [];

  // First, try existing exercises file
  if (fs.existsSync(exercisesPath)) {
    console.log(`Reading existing exercises file: ${exercisesPath}`);
    const { exercises } = extractExercisesFromSection(exercisesPath, 'Existing exercises');
    if (exercises.length > 0) {
      sectionInfo.push({ title: `${chapter}.1`, count: exercises.length });
      allExercises.push(...exercises);
    }
  }

  // Then, extract from section files
  const sectionFiles = fs
    .readdirSync(chapterDir)
    .filter((f) => f.match(new RegExp(`^${chapter}-(\\d+)\\.md$`)))
    .sort();

  for (const sectionFile of sectionFiles) {
    const sectionPath = path.join(chapterDir, sectionFile);
    const sectionNum = sectionFile.match(new RegExp(`${chapter}-(\\d+)`))[1];
    const sectionTitle = `${chapter}.${sectionNum}`;

    console.log(`Checking section file: ${sectionFile}`);
    const { exercises } = extractExercisesFromSection(sectionPath, sectionTitle);
    if (exercises.length > 0) {
      console.log(`  Found ${exercises.length} exercises`);
      sectionInfo.push({ title: sectionTitle, count: exercises.length });
      allExercises.push(...exercises);
    }
  }

  if (allExercises.length === 0) {
    console.error('Error: No exercises found');
    process.exit(1);
  }

  console.log(`\nTotal exercises collected: ${allExercises.length}`);

  // Assign numbers and prepare exercises and answers
  const numberedExercises = [];
  const answers = [];

  for (let i = 0; i < allExercises.length; i++) {
    const ex = allExercises[i];
    const number = i + 1;
    numberedExercises.push({
      id: ex.id,
      number,
      lines: ex.lines,
    });

    if (ex.hasAnswer && ex.answerLines.length > 0) {
      answers.push({
        id: ex.id,
        number,
        lines: ex.answerLines,
      });
    }
  }

  // Build new exercises content with frontmatter
  const exercisesFrontmatter = `---
title: Æfingar
chapter: ${chapter}
translation-status: Vélþýðing - ekki yfirfarin
publication-track: mt-preview
published-at: "${new Date().toISOString()}"
type: exercises
---

`;

  let newExercisesContent = exercisesFrontmatter;
  newExercisesContent += '## Æfingar\n\n';

  // Add section headers based on section info
  let exerciseIndex = 0;
  for (const section of sectionInfo) {
    newExercisesContent += `### ${section.title}\n\n`;
    for (
      let i = 0;
      i < section.count && exerciseIndex < numberedExercises.length;
      i++, exerciseIndex++
    ) {
      const ex = numberedExercises[exerciseIndex];
      newExercisesContent += `:::exercise{#${ex.id} number=${ex.number}}\n`;
      newExercisesContent += ex.lines.join('\n');
      if (ex.lines.length > 0 && ex.lines[ex.lines.length - 1] !== '') {
        newExercisesContent += '\n';
      }
      newExercisesContent += ':::\n\n';
    }
  }

  // Build answer key content
  const answerKeyFrontmatter = `---
title: Svarlykill
chapter: ${chapter}
translation-status: Vélþýðing - ekki yfirfarin
publication-track: mt-preview
published-at: "${new Date().toISOString()}"
type: answer-key
---

## Svarlykill

`;

  let answerKeyContent = answerKeyFrontmatter;
  for (const answer of answers) {
    answerKeyContent += `:::answer-entry{#${answer.id} number=${answer.number}}\n`;
    answerKeyContent += answer.lines.join('\n');
    if (answer.lines.length > 0 && answer.lines[answer.lines.length - 1] !== '') {
      answerKeyContent += '\n';
    }
    answerKeyContent += ':::\n\n';
  }

  // Output results
  console.log(`Found ${numberedExercises.length} exercises`);
  console.log(`Found ${answers.length} answers`);

  if (dryRun) {
    console.log('\n--- DRY RUN: Exercises content preview ---');
    console.log(newExercisesContent.slice(0, 2000));
    console.log('...\n');
    console.log('--- DRY RUN: Answer key content preview ---');
    console.log(answerKeyContent.slice(0, 1500));
    console.log('...\n');
  } else {
    // Backup original file
    const backupPath =
      exercisesPath + `.${new Date().toISOString().slice(0, 16).replace(/[:-]/g, '')}.bak`;
    fs.copyFileSync(exercisesPath, backupPath);
    console.log(`Backup created: ${backupPath}`);

    // Write new files
    fs.writeFileSync(exercisesPath, newExercisesContent);
    console.log(`Updated: ${exercisesPath}`);

    fs.writeFileSync(answerKeyPath, answerKeyContent);
    console.log(`Created: ${answerKeyPath}`);
  }
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node fix-exercises-format.js <chapter> [--dry-run]');
  console.log('Example: node fix-exercises-format.js 5 --dry-run');
  process.exit(1);
}

const chapter = parseInt(args[0], 10);
const dryRun = args.includes('--dry-run');

if (isNaN(chapter)) {
  console.error('Error: Chapter must be a number');
  process.exit(1);
}

fixExercisesFormat(chapter, dryRun);
