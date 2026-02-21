#!/usr/bin/env node
/**
 * compare-markers.js
 *
 * Compares EN segments (02-for-mt/) against IS segments (02-machine-translated/)
 * to find segments where EN has [[BR]] or [[SPACE]] but IS doesn't.
 *
 * Also checks 03-translated/mt-preview/ CNXML files for <newline/> and <space/>
 * tags to determine which segments were successfully restored by restoreNewlines().
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const BOOK_DIR = '/home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi';
const EN_DIR = join(BOOK_DIR, '02-for-mt');
const IS_DIR = join(BOOK_DIR, '02-machine-translated');
const CNXML_DIR = join(BOOK_DIR, '03-translated', 'mt-preview');

/**
 * Parse a segment file into a Map of segId -> text
 * Format: <!-- SEG:moduleId:type:segId --> followed by segment text
 */
function parseSegmentFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const segments = new Map();

  const segRegex = /<!-- SEG:([^>]+) -->/g;
  const matches = [...content.matchAll(segRegex)];

  for (let i = 0; i < matches.length; i++) {
    const segId = matches[i][1].trim();
    const startIdx = matches[i].index + matches[i][0].length;
    const endIdx = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const text = content.slice(startIdx, endIdx).trim();
    segments.set(segId, text);
  }

  return segments;
}

/**
 * Check CNXML files for <newline/> and <space/> presence per module
 */
function checkRestoredInCnxml(chapterDir, moduleId) {
  const cnxmlPath = join(CNXML_DIR, chapterDir, `${moduleId}.cnxml`);
  if (!existsSync(cnxmlPath)) return { hasNewline: false, hasSpace: false, exists: false };

  const content = readFileSync(cnxmlPath, 'utf-8');
  return {
    hasNewline: content.includes('<newline/>'),
    hasSpace: content.includes('<space/>'),
    exists: true,
    newlineCount: (content.match(/<newline\/>/g) || []).length,
    spaceCount: (content.match(/<space\/>/g) || []).length,
  };
}

/**
 * Get chapter directories
 */
function getChapterDirs() {
  return readdirSync(EN_DIR)
    .filter((d) => d.startsWith('ch') || d === 'appendices')
    .sort((a, b) => {
      if (a === 'appendices') return 1;
      if (b === 'appendices') return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
}

// -- Main --

const results = [];
const restoredModules = new Map();

const chapters = getChapterDirs();

for (const chapter of chapters) {
  const enChapterDir = join(EN_DIR, chapter);
  const isChapterDir = join(IS_DIR, chapter);

  if (!existsSync(isChapterDir)) {
    console.error(`WARNING: IS chapter dir missing: ${isChapterDir}`);
    continue;
  }

  const enFiles = readdirSync(enChapterDir).filter(
    (f) => f.endsWith('.en.md') && !f.includes('(b)')
  );

  for (const enFile of enFiles) {
    const moduleId = enFile.match(/^(m\d+)/)?.[1];
    if (!moduleId) continue;

    const enPath = join(enChapterDir, enFile);
    const isFile = enFile.replace('.en.md', '.is.md');
    const isPath = join(isChapterDir, isFile);

    const enContent = readFileSync(enPath, 'utf-8');

    if (!enContent.includes('[[BR]]') && !enContent.includes('[[SPACE]]')) continue;

    const enSegments = parseSegmentFile(enPath);

    let isSegments = new Map();
    if (existsSync(isPath)) {
      isSegments = parseSegmentFile(isPath);
    } else {
      console.error(`WARNING: IS file missing: ${isPath}`);
    }

    const cnxmlStatus = checkRestoredInCnxml(chapter, moduleId);
    if (cnxmlStatus.exists && (cnxmlStatus.hasNewline || cnxmlStatus.hasSpace)) {
      restoredModules.set(moduleId, {
        chapter,
        newlineCount: cnxmlStatus.newlineCount,
        spaceCount: cnxmlStatus.spaceCount,
      });
    }

    for (const [segId, enText] of enSegments) {
      const hasBR = enText.includes('[[BR]]');
      const hasSPACE = enText.includes('[[SPACE]]');

      if (!hasBR && !hasSPACE) continue;

      const isText = isSegments.get(segId) || '';
      const isMissingBR = hasBR && !isText.includes('[[BR]]');
      const isMissingSPACE = hasSPACE && !isText.includes('[[SPACE]]');

      if (!isMissingBR && !isMissingSPACE) continue;

      const segParts = segId.split(':');
      const segType = segParts.length >= 3 ? segParts[1] : 'unknown';
      const segName = segParts.length >= 3 ? segParts[2] : segParts[segParts.length - 1];

      const missingMarkers = [];
      if (isMissingBR) missingMarkers.push('[[BR]]');
      if (isMissingSPACE) missingMarkers.push('[[SPACE]]');

      const brCount = isMissingBR ? (enText.match(/\[\[BR\]\]/g) || []).length : 0;
      const spaceCount = isMissingSPACE ? (enText.match(/\[\[SPACE\]\]/g) || []).length : 0;

      results.push({
        chapter,
        moduleId,
        segId,
        segType,
        segName,
        missingMarker: missingMarkers.join(', '),
        enContext: enText.slice(0, 80).replace(/\n/g, ' '),
        brCount,
        spaceCount,
        isRestored: restoredModules.has(moduleId),
      });
    }
  }
}

// -- Output Report --

console.log('='.repeat(100));
console.log('MISSING MARKER REPORT: EN [[BR]]/[[SPACE]] not present in IS segments');
console.log('='.repeat(100));
console.log(`Generated: ${new Date().toISOString()}`);
console.log(`Total segments with missing markers: ${results.length}`);

const totalMissingBR = results.reduce((sum, r) => sum + r.brCount, 0);
const totalMissingSPACE = results.reduce((sum, r) => sum + r.spaceCount, 0);
console.log(`Total missing [[BR]] instances: ${totalMissingBR}`);
console.log(`Total missing [[SPACE]] instances: ${totalMissingSPACE}`);
console.log();

const byChapter = new Map();
for (const r of results) {
  if (!byChapter.has(r.chapter)) byChapter.set(r.chapter, []);
  byChapter.get(r.chapter).push(r);
}

for (const [chapter, items] of byChapter) {
  console.log('-'.repeat(100));
  console.log(`CHAPTER: ${chapter} (${items.length} segments affected)`);
  console.log('-'.repeat(100));

  const byModule = new Map();
  for (const item of items) {
    if (!byModule.has(item.moduleId)) byModule.set(item.moduleId, []);
    byModule.get(item.moduleId).push(item);
  }

  for (const [moduleId, moduleItems] of byModule) {
    const restored = restoredModules.has(moduleId);
    const restoreInfo = restored
      ? ` [RESTORED in CNXML: ${restoredModules.get(moduleId).newlineCount} <newline/>` +
        (restoredModules.get(moduleId).spaceCount > 0
          ? `, ${restoredModules.get(moduleId).spaceCount} <space/>`
          : '') +
        ']'
      : ' [NOT restored in CNXML]';

    console.log();
    console.log(`  Module: ${moduleId}${restoreInfo}`);
    console.log(
      `  ${'Segment ID'.padEnd(40)} ${'Missing'.padEnd(20)} ${'Count'.padEnd(8)} EN Context`
    );
    console.log(`  ${'─'.repeat(40)} ${'─'.repeat(20)} ${'─'.repeat(8)} ${'─'.repeat(28)}`);

    for (const item of moduleItems) {
      const count = item.brCount + item.spaceCount;
      console.log(
        `  ${item.segName.padEnd(40)} ${item.missingMarker.padEnd(20)} ${String(count).padEnd(8)} ${item.enContext}`
      );
    }
  }
  console.log();
}

// -- Summary: Restored vs Not Restored --
console.log('='.repeat(100));
console.log('RESTORATION SUMMARY');
console.log('='.repeat(100));
console.log();

const modulesWithMarkers = new Set(results.map((r) => r.moduleId));

console.log('Modules with [[BR]]/[[SPACE]] in EN segments:');
console.log();

const restoredList = [];
const notRestoredList = [];

for (const moduleId of [...modulesWithMarkers].sort()) {
  const items = results.filter((r) => r.moduleId === moduleId);
  const chapter = items[0].chapter;
  const totalBR = items.reduce((s, r) => s + r.brCount, 0);
  const totalSPACE = items.reduce((s, r) => s + r.spaceCount, 0);

  if (restoredModules.has(moduleId)) {
    const info = restoredModules.get(moduleId);
    restoredList.push({ moduleId, chapter, totalBR, totalSPACE, ...info });
  } else {
    notRestoredList.push({ moduleId, chapter, totalBR, totalSPACE, segCount: items.length });
  }
}

if (restoredList.length > 0) {
  console.log('  RESTORED (have <newline/> in 03-translated/mt-preview/ CNXML):');
  for (const r of restoredList) {
    console.log(
      `    ${r.chapter}/${r.moduleId}: ${r.newlineCount} <newline/> tags restored` +
        (r.spaceCount > 0 ? `, ${r.spaceCount} <space/>` : '') +
        ` (EN had ${r.totalBR} [[BR]]${r.totalSPACE > 0 ? `, ${r.totalSPACE} [[SPACE]]` : ''} missing from IS)`
    );
  }
  console.log();
}

if (notRestoredList.length > 0) {
  console.log('  NOT RESTORED (no <newline/>/<space/> in CNXML, or CNXML file missing):');
  for (const r of notRestoredList) {
    const cnxmlPath = join(CNXML_DIR, r.chapter, `${r.moduleId}.cnxml`);
    const cnxmlExists = existsSync(cnxmlPath);
    const reason = cnxmlExists ? 'restoreNewlines() did not match' : 'CNXML not yet generated';
    console.log(
      `    ${r.chapter}/${r.moduleId}: ${r.segCount} segments, ` +
        `${r.totalBR} [[BR]]${r.totalSPACE > 0 ? `, ${r.totalSPACE} [[SPACE]]` : ''} missing` +
        ` -- ${reason}`
    );
  }
  console.log();
}

console.log('='.repeat(100));
console.log(
  `TOTALS: ${results.length} segments affected across ${modulesWithMarkers.size} modules`
);
console.log(`  Restored modules: ${restoredList.length}`);
console.log(`  Not restored modules: ${notRestoredList.length}`);
console.log(`  Total [[BR]] missing from IS: ${totalMissingBR}`);
console.log(`  Total [[SPACE]] missing from IS: ${totalMissingSPACE}`);
console.log('='.repeat(100));
