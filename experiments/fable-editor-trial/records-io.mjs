/** records-io.mjs — small readers for a run's record files. */
import fs from 'node:fs';

/** A JSON-lines file as an array of objects (blank lines skipped). */
export function readJsonl(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l));
}

/** A JSON file, or null when it does not exist. */
export function readJsonOrNull(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}
