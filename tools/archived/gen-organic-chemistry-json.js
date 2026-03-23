#!/usr/bin/env node
// One-time script to generate server/data/organic-chemistry.json
import fs from 'fs';
import path from 'path';

const book = {
  book: 'organic-chemistry',
  slug: 'lifraen-efnafraedi',
  title: 'Organic Chemistry',
  titleIs: 'Lífræn efnafræði',
  repo: 'openstax/osbooks-organic-chemistry',
  preface: 'm00001',
  chapters: [],
};

const sourceDir = 'books/lifraen-efnafraedi/01-source';
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

fs.writeFileSync('server/data/organic-chemistry.json', JSON.stringify(book, null, 2) + '\n');
console.log(`Generated organic-chemistry.json: ${book.chapters.length} chapters, ${book.chapters.reduce((s, c) => s + c.modules.length, 0)} modules`);
