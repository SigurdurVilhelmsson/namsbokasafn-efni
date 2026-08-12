/**
 * cnxml-render-fidelity-disk-driver.test.js — the DISK DRIVER, which the sibling
 * suite deliberately does not cover.
 *
 * cnxml-render-fidelity-check.test.js states its own scope: the fixtures go
 * "straight into the pure checkChapter() (never through the disk driver)". That
 * is a reasonable boundary for detection logic, and it is precisely why the bug
 * below survived: readChapterFromDisk built the 05-publication path with
 * String(chapter), while that tree uses ZERO-PADDED bare dirs (chapters/04).
 *
 * Measured 2026-08-12: `--chapter 4` read 0 HTML files for edlisfraedi-2e ch04
 * and the tool printed "Total findings: 0" — indistinguishable from a clean
 * chapter. CHAPTER_OPTION parses to a NUMBER, so `--chapter 04` also arrives as
 * 4; there was no CLI form that could reach a single-digit chapter. Chemistry's
 * committed baseline shows the blast radius: chapters 00-09 are published but
 * absent from it, while 10-21 + appendices are present.
 *
 * See CLAUDE.md § "TWO on-disk chapter-dir conventions": source/structure dirs
 * are ch-prefixed (chNN), publication-track OUTPUT dirs are BARE (NN).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readChapterFromDisk } from '../cnxml-render-fidelity-check.js';

const TRACK = 'mt-preview';
let bookDir;

beforeAll(() => {
  bookDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fidelity-disk-'));
  // Source/translated side: ch-prefixed, zero-padded.
  const cnxmlDir = path.join(bookDir, '03-translated', TRACK, 'ch04');
  fs.mkdirSync(cnxmlDir, { recursive: true });
  fs.writeFileSync(path.join(cnxmlDir, 'm42069.cnxml'), '<document><content/></document>');
  // Publication side: BARE and zero-padded — this is the convention that bit us.
  const htmlDir = path.join(bookDir, '05-publication', TRACK, 'chapters', '04');
  fs.mkdirSync(htmlDir, { recursive: true });
  fs.writeFileSync(path.join(htmlDir, '4-0-introduction.html'), '<article><p>hi</p></article>');

  // Two-digit control, so a failure localises to padding rather than to the
  // fixture or the reader itself.
  const cnxmlDir20 = path.join(bookDir, '03-translated', TRACK, 'ch20');
  fs.mkdirSync(cnxmlDir20, { recursive: true });
  fs.writeFileSync(path.join(cnxmlDir20, 'm68845.cnxml'), '<document><content/></document>');
  const htmlDir20 = path.join(bookDir, '05-publication', TRACK, 'chapters', '20');
  fs.mkdirSync(htmlDir20, { recursive: true });
  fs.writeFileSync(path.join(htmlDir20, '20-0-introduction.html'), '<article><p>hi</p></article>');
});

afterAll(() => {
  if (bookDir) fs.rmSync(bookDir, { recursive: true, force: true });
});

describe('readChapterFromDisk — publication dirs are zero-padded', () => {
  it('finds the HTML for a single-digit chapter given the NUMBER the CLI produces', () => {
    // CHAPTER_OPTION parses --chapter to a number, so this is exactly what main() passes.
    expect(readChapterFromDisk(bookDir, 4, TRACK).html).toHaveLength(1);
  });

  it('finds it for the zero-padded string form too', () => {
    expect(readChapterFromDisk(bookDir, '04', TRACK).html).toHaveLength(1);
  });

  it('CONTROL: a two-digit chapter was never affected', () => {
    expect(readChapterFromDisk(bookDir, 20, TRACK).html).toHaveLength(1);
  });

  it('CONTROL: the ch-prefixed translated side still resolves', () => {
    expect(readChapterFromDisk(bookDir, 4, TRACK).cnxml).toHaveLength(1);
  });

  it('appendices are not numeric and must not be padded', () => {
    const appCnxml = path.join(bookDir, '03-translated', TRACK, 'appendices');
    fs.mkdirSync(appCnxml, { recursive: true });
    fs.writeFileSync(path.join(appCnxml, 'm99999.cnxml'), '<document><content/></document>');
    const appHtml = path.join(bookDir, '05-publication', TRACK, 'chapters', 'appendices');
    fs.mkdirSync(appHtml, { recursive: true });
    fs.writeFileSync(path.join(appHtml, 'a-appendix.html'), '<article/>');
    expect(readChapterFromDisk(bookDir, 'appendices', TRACK).html).toHaveLength(1);
  });

  it('a genuinely absent chapter still reads nothing — the check can fail', () => {
    expect(readChapterFromDisk(bookDir, 7, TRACK).html).toHaveLength(0);
  });
});
