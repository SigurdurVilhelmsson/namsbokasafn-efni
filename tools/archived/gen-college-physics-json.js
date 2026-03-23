#!/usr/bin/env node
// One-time script to generate server/data/college-physics-2e.json
import fs from 'fs';
import path from 'path';

const book = {
  book: 'college-physics-2e',
  slug: 'edlisfraedi-2e',
  title: 'College Physics 2e',
  titleIs: 'Eðlisfræði 2e',
  repo: 'openstax/osbooks-college-physics-bundle',
  preface: 'm42955',
  chapters: [],
};

const sourceDir = 'books/edlisfraedi-2e/01-source';
const chapterDirs = fs
  .readdirSync(sourceDir)
  .filter((d) => d.startsWith('ch') && d !== 'ch00' && d !== 'media')
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
    title: chapterTitle || `Chapter ${chNum}`,
    titleIs: null,
    modules,
  });
}

fs.writeFileSync('server/data/college-physics-2e.json', JSON.stringify(book, null, 2) + '\n');
console.log(`Generated college-physics-2e.json: ${book.chapters.length} chapters, ${book.chapters.reduce((s, c) => s + c.modules.length, 0)} modules`);
