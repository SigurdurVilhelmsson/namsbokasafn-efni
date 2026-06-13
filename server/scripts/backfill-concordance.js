#!/usr/bin/env node

/**
 * Backfill the concordance index (tm_segments) from existing faithful content.
 *
 * The index is normally kept current by applyApprovedEdits → indexModule, but
 * faithful files written before Unit 2 (or imported out-of-band) have no index
 * rows. This rebuilds the index for every faithful module in a book (or all
 * books). indexModule replaces a module's rows each time, so re-running is
 * idempotent.
 *
 * Usage:
 *   node server/scripts/backfill-concordance.js [--book <slug>]
 */

const concordance = require('../services/concordanceService');

function main() {
  const argv = process.argv.slice(2);
  let book = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--book') book = argv[++i];
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log('Usage: node server/scripts/backfill-concordance.js [--book <slug>]');
      process.exit(0);
    }
  }

  const { modules, indexed } = concordance.backfill(book);
  console.log(
    `Concordance backfill complete: indexed ${indexed} segment pairs across ${modules} module(s)${
      book ? ` in ${book}` : ''
    }.`
  );
}

if (require.main === module) {
  main();
}
