#!/usr/bin/env node
// One-time script to generate server/data/microbiology.json
import fs from 'fs';
import path from 'path';

const book = {
  book: 'microbiology',
  slug: 'orverufraedi',
  title: 'Microbiology',
  titleIs: 'Örverufræði',
  repo: 'openstax/osbooks-microbiology',
  preface: 'm63247',
  chapters: [],
};

// Official OpenStax Microbiology chapter titles
const CHAPTER_TITLES = {
  1: 'An Invisible World',
  2: 'How We See the Invisible World',
  3: 'The Cell',
  4: 'Prokaryotic Diversity',
  5: 'The Eukaryotes of Microbiology',
  6: 'Acellular Pathogens',
  7: 'Microbial Biochemistry',
  8: 'Microbial Metabolism',
  9: 'Microbial Growth',
  10: 'Biochemistry of the Genome',
  11: 'Mechanisms of Microbial Genetics',
  12: 'Modern Applications of Microbial Genetics',
  13: 'Control of Microbial Growth',
  14: 'Antimicrobial Drugs',
  15: 'Microbial Mechanisms of Pathogenicity',
  16: 'Disease and Epidemiology',
  17: 'Innate Nonspecific Host Defenses',
  18: 'Adaptive Specific Host Defenses',
  19: 'Diseases of the Immune System',
  20: 'Laboratory Analysis of the Immune Response',
  21: 'Skin and Eye Infections',
  22: 'Respiratory System Infections',
  23: 'Urogenital System Infections',
  24: 'Digestive System Infections',
  25: 'Circulatory and Lymphatic System Infections',
  26: 'Nervous System Infections',
};

const sourceDir = 'books/orverufraedi/01-source';
const chapterDirs = fs
  .readdirSync(sourceDir)
  .filter((d) => d.startsWith('ch') && d !== 'ch00')
  .sort();

for (const chDir of chapterDirs) {
  const chNum = parseInt(chDir.replace('ch', ''), 10);
  const files = fs
    .readdirSync(path.join(sourceDir, chDir))
    .filter((f) => f.endsWith('.cnxml'))
    .sort();

  const modules = [];
  let section = 0;
  let chapterTitle = '';

  for (const f of files) {
    const content = fs.readFileSync(path.join(sourceDir, chDir, f), 'utf-8');
    const titleMatch = content.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? titleMatch[1] : '';
    const modId = f.replace('.cnxml', '');

    if (section === 0) {
      const metaTitle = content.match(/<md:title>([^<]+)<\/md:title>/);
      chapterTitle = metaTitle ? metaTitle[1] : title;
      modules.push({ id: modId, section: 'intro', title, titleIs: null });
    } else {
      modules.push({ id: modId, section: `${chNum}.${section}`, title, titleIs: null });
    }
    section++;
  }

  book.chapters.push({
    chapter: chNum,
    title: CHAPTER_TITLES[chNum] || chapterTitle || `Chapter ${chNum}`,
    titleIs: null,
    modules,
  });
}

fs.writeFileSync('server/data/microbiology.json', JSON.stringify(book, null, 2) + '\n');
console.log(`Generated microbiology.json: ${book.chapters.length} chapters`);
