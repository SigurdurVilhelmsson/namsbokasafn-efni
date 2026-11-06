/**
 * Holds the SQLite write lock on a database file from ANOTHER PROCESS (PR1 review C2).
 *
 * better-sqlite3 is synchronous: a lock held by a second connection in the test's own process can
 * never be released while the first connection waits on it, because the wait blocks the event loop
 * that would release it. So the lock is held here, in a child process.
 *
 * argv: <dbPath> <holdMs> <releasingMarkerPath> [sqlInsideLock]
 *   1. BEGIN IMMEDIATE on dbPath (the write lock, as backup-db.sh's wal_checkpoint takes it), then,
 *      when given, run sqlInsideLock in that transaction: its writes are committed only at step 4,
 *      so a reader in the parent cannot see them while the lock is held (servedWriteLock case (g));
 *   2. print exactly "locked\n";
 *   3. hold until holdMs has passed OR the parent closes this process's stdin, whichever is first;
 *   4. write the marker file, THEN commit.
 * The marker is written before the commit, so a parent that finds no marker when a call returns
 * knows the lock was held for the whole call; a parent that finds one knows the call ran past the
 * release. That is an ordering witness on disk, with no clock in it.
 *
 * Exits 0 only after it locked and released. Not named *.test.* so Vitest does not collect it.
 */
const fs = require('fs');
const Database = require('better-sqlite3');

const [, , dbPath, holdMs, releasingMarker, sqlInsideLock] = process.argv;
process.exitCode = 1; // overwritten only once the lock was taken and released

const db = new Database(dbPath);
db.exec('BEGIN IMMEDIATE');
if (sqlInsideLock) db.exec(sqlInsideLock);
process.stdout.write('locked\n');

let released = false;
let timer = null;
function release() {
  if (released) return;
  released = true;
  clearTimeout(timer);
  fs.writeFileSync(releasingMarker, 'releasing\n');
  db.exec('COMMIT');
  db.close();
  process.stdin.destroy();
  process.exitCode = 0;
}

timer = setTimeout(release, Number(holdMs));
process.stdin.on('data', () => {});
process.stdin.on('end', release);
process.stdin.on('error', release);
