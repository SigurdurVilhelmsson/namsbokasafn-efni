// server/lib/sourceEnglish.js
/**
 * The candidate English strings a book actually contains, read from its
 * extracted EN segments.
 *
 * ⚠️ SOURCE IS `02-for-mt`, NOT `01-source` — ruled during B1 and recorded as an
 * amendment to that spec's §8.2. 02-for-mt holds the extracted EN segments the
 * glossary is actually filtered against; 01-source is raw CNXML.
 *
 * ⚠️ THE TOKENISATION IS PART OF THE METHOD. B1's first census came in 30-46%
 * low (1,398/67/176 against a recorded 2,001/126/310) and was written up as a
 * register discrepancy before the cause was found: a NON-OVERLAPPING two-word
 * regex, which made a term's visibility depend on its byte offset:
 *
 *   "The carbon dioxide molecule"  -> 'The carbon', 'dioxide molecule'  ← term LOST
 *   "a carbon dioxide molecule"    -> 'carbon dioxide', 'molecule'      ← term seen
 *
 * and consuming the following word into a bigram ALSO prevented that word ever
 * being emitted as a unigram — the net was DESTRUCTIVE: unigrams alone
 * (n=22,100) scored 1,558/90/285 = 1,933 resolutions, HIGHER than the old
 * bigram layer's (n=80,037) 1,398/67/176 = 1,641. Deleting the layer beat
 * shipping it. Tokenising once and emitting OVERLAPPING adjacent pairs — same
 * unigram grammar, same files — yields 1,999/120/299 over 118,749 strings,
 * within ~1% of §C36's recorded 2,001/126/310 on three counts produced by
 * three different branches of resolveCandidates.
 *
 * Emit every unigram AND every adjacent pair from ONE token pass. Changing
 * this changes the census, so record it alongside any number derived from it.
 * Whole tokens (not a `word [a-z]+` suffix match) also matter for hyphens: a
 * PREFIX match can resume mid-word, so "carbon di-oxide here" would fragment
 * into `carbon di` / `oxide here` — matching on `[A-Za-z][A-Za-z-]*` tokens
 * instead gives `di-oxide` and `di-oxide here`, with no invented fragments.
 *
 * Four traps, each measured in this tree, each of which silently inflates or
 * empties the census rather than erroring:
 *
 * 1. `02-for-mt` holds hundreds of `<name>.md.backup.<timestamp>` files beside
 *    its real `.md` files. `endsWith('.md')` correctly excludes them BECAUSE
 *    they end in the timestamp. Do NOT "improve" this to `includes('.md')` —
 *    that pulls in every stale backup and counts months-old text as current.
 *
 * 2. Every file is dense with `<!-- SEG:mNNNNN:type:id -->` markers. A bare
 *    word regex harvests `SEG`, `title`, `abstract-item` and friends as
 *    English terms. Strip the comments first.
 *
 * 3. Segment text carries `[[i:…]]`, `[[link:…]]`, `[[xref:…]]`, `[[docref:…]]`
 *    bracket markers whose TYPE names would likewise be counted. Strip the
 *    marker syntax but KEEP the inner prose — `[[i:hydrogen]]` really does
 *    mean the word hydrogen appears in the text.
 *
 * 4. Overlapping bigrams — THE EXPENSIVE ONE. See "THE TOKENISATION IS PART
 *    OF THE METHOD" above: get the overlap wrong and the census silently
 *    drops 30-46%, misread for a while as a register discrepancy rather than
 *    a bug in this function.
 *
 * Quiet by design: it reports `filesRead` and lets the CALLER decide what an
 * empty census means. buildResolvedGlossary throws; verify-resolve-gates.js
 * prints and continues.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

/**
 * @param {string} slug
 * @param {{booksDir?: string}} [opts]
 * @returns {{strings: string[], filesRead: number, root: string}}
 */
function collectSourceEnglish(slug, { booksDir = DEFAULT_BOOKS_DIR } = {}) {
  const root = path.join(booksDir, slug, '02-for-mt');
  if (!fs.existsSync(root)) return { strings: [], filesRead: 0, root };

  const words = new Set();
  let filesRead = 0;

  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (!e.name.endsWith('.md')) continue; // excludes .md.backup.<timestamp>
      filesRead++;
      const text = fs
        .readFileSync(p, 'utf8')
        .replace(/<!--[\s\S]*?-->/g, ' ') // SEG markers
        .replace(/\[\[[a-z]+:/g, ' ') // bracket-marker OPEN, prose kept
        .replace(/\]\]/g, ' ');
      const toks = [...text.matchAll(/[A-Za-z][A-Za-z-]*/g)];
      for (let i = 0; i < toks.length; i++) {
        const [word] = toks[i];
        if (word.length >= 2) words.add(word);
        const next = toks[i + 1];
        if (!next || word.length < 2 || !/^[a-z]+$/.test(next[0])) continue;
        // Adjacent means separated by exactly one space in the SOURCE — not
        // merely consecutive in the token list, which would join across
        // newlines and punctuation and invent terms the book does not contain.
        if (next.index === toks[i].index + word.length + 1 && text[next.index - 1] === ' ') {
          words.add(`${word} ${next[0]}`);
        }
      }
    }
  };

  walk(root);
  return { strings: [...words], filesRead, root };
}

module.exports = { collectSourceEnglish, DEFAULT_BOOKS_DIR };
