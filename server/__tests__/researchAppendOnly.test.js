// server/__tests__/researchAppendOnly.test.js — append-only research rows (spec §5.9; plan decision 41)
//
// No code path changes a research row: no UPDATE, REPLACE INTO, INSERT OR REPLACE, upsert or DELETE
// on a research table anywhere under server/, outside DELETE_ALLOWED. A database trigger would also
// block the deletion scripts PR4 adds (spec §5.15), so this is a scan of the source.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const TABLES = ['research_events', 'research_event_items', 'editor_keys'];
const MUTATION = new RegExp(
  String.raw`\b(?:UPDATE\s+(?:OR\s+\w+\s+)?|REPLACE\s+INTO\s+|INSERT\s+OR\s+REPLACE\s+INTO\s+|DELETE\s+FROM\s+)(${TABLES.join('|')})\b`,
  'gi'
);
// An upsert's UPDATE is followed by SET, not a table name, so MUTATION cannot see it (the form
// userService.js:589-595 uses). STMT is a tempered character: it never crosses into another INSERT or another
// prepare(/exec( call, so a match stays inside one statement. Reported as `UPSERT <table>`.
const STMT = String.raw`(?:(?!\bINSERT\b|\bprepare\(|\bexec\()[\s\S])`;
const UPSERT = new RegExp(
  String.raw`\bINSERT\s+(?:OR\s+\w+\s+)?INTO\s+(${TABLES.join('|')})\b${STMT}{0,800}?\bON\s+CONFLICT\b${STMT}{0,200}?\bDO\s+UPDATE\b`,
  'gi'
);
// Files allowed to DELETE research rows (spec §5.15), and ONLY from the tables listed: an UPDATE, an upsert, or a
// DELETE from an unlisted table in an allowed file is still a finding. Keys are paths relative to server/; each entry
// is { tables: string[], reason: string }. Empty in PR3; PR4 adds research-withdrawal.js, research-retention.js and the
// withdraw route's deletion service, each with its tables and its reason, and changes nothing else here.
const DELETE_ALLOWED = Object.freeze({
  'scripts/research-withdrawal.js': {
    tables: ['research_event_items', 'research_events', 'editor_keys'],
    reason: "a withdrawn interval's rows, its key last (spec §5.15, §5.16)",
  },
  'scripts/research-retention.js': {
    tables: ['research_event_items', 'research_events', 'editor_keys'],
    reason:
      'every research row, the key map included, once the retention date has passed (spec §5.15)',
  },
  'services/researchDeletion.js': {
    tables: ['research_event_items', 'research_events'],
    reason:
      "the withdraw route's immediate deletion; the key row stays for research-withdrawal.js (spec §5.15)",
  },
});
const isAllowed = (f, allowed) =>
  Boolean(allowed[f.file]) &&
  allowed[f.file].tables.some((t) => f.statement === `DELETE FROM ${t}`);

const SKIP_DIRS = new Set(['node_modules', '.venv', '__tests__']);
const SOURCE = /\.(?:js|cjs|mjs)$/;

/** Every .js/.cjs/.mjs file under root, outside SKIP_DIRS, as paths relative to root with '/'. */
function sourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) walk(abs);
      } else if (ent.isFile() && SOURCE.test(ent.name)) {
        out.push(path.relative(root, abs).split(path.sep).join('/'));
      }
    }
  };
  walk(root);
  return out.sort();
}

/** @returns {{file: string, statement: string}[]} every change to a research row not in `allowed` */
function mutations(root, allowed = DELETE_ALLOWED) {
  const found = [];
  for (const file of sourceFiles(root)) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    for (const m of src.matchAll(MUTATION)) {
      const verb = m[0]
        .slice(0, m[0].length - m[1].length)
        .trim()
        .replace(/\s+/g, ' ')
        .toUpperCase();
      found.push({ file, statement: `${verb} ${m[1].toLowerCase()}` });
    }
    for (const m of src.matchAll(UPSERT)) {
      found.push({ file, statement: `UPSERT ${m[1].toLowerCase()}` });
    }
  }
  return found.filter((f) => !isAllowed(f, allowed));
}

const planted = [];
function plant(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-append-only-'));
  planted.push(root);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

afterAll(() => {
  for (const root of planted) fs.rmSync(root, { recursive: true, force: true });
});

const statements = (found) => found.map((f) => f.statement).sort();

describe('append-only research rows (spec §5.9; decision 41)', () => {
  it('no code changes a research row; only the listed files delete, from the listed tables', () => {
    expect(mutations(SERVER_ROOT)).toEqual([]);
    // Aimed right: the allowed file really does delete.
    const src = fs.readFileSync(
      path.join(SERVER_ROOT, 'scripts', 'research-withdrawal.js'),
      'utf8'
    );
    expect(src).toMatch(/DELETE FROM editor_keys/);
  });

  it('control: an allowed file may delete, and nothing else', () => {
    const root = plant({
      'scripts/research-withdrawal.js': [
        '"DELETE FROM research_events";',
        "db.prepare('UPDATE research_events SET event_type = ?');",
        'db.prepare(`INSERT INTO editor_keys (interval_id, editor_key) VALUES (?, ?)',
        '  ON CONFLICT (interval_id) DO UPDATE SET editor_key = excluded.editor_key`);',
      ].join('\n'),
      'scripts/research-backup.js': '"DELETE FROM research_events";',
      // The deletion service may never delete the key row: research-withdrawal.js does, last.
      'services/researchDeletion.js': '"DELETE FROM editor_keys";',
    });
    expect(
      mutations(root)
        .map((f) => `${f.file} ${f.statement}`)
        .sort()
    ).toEqual([
      'scripts/research-backup.js DELETE FROM research_events',
      'scripts/research-withdrawal.js UPDATE research_events',
      'scripts/research-withdrawal.js UPSERT editor_keys',
      'services/researchDeletion.js DELETE FROM editor_keys',
    ]);
  });

  it('control: a planted UPDATE, DELETE and upsert are named; a DO NOTHING insert is not', () => {
    const root = plant({
      'services/x.js': [
        "db.prepare('UPDATE research_events SET event_type = ?');",
        '"DELETE FROM editor_keys";',
        'db.prepare(`INSERT INTO editor_keys (interval_id, editor_key) VALUES (?, ?)',
        '  ON CONFLICT (interval_id) DO UPDATE SET editor_key = excluded.editor_key`);',
        'db.prepare("INSERT INTO research_events (id) VALUES (?) ON CONFLICT (id) DO NOTHING");',
      ].join('\n'),
    });
    const found = mutations(root);
    expect(statements(found)).toEqual([
      'DELETE FROM editor_keys',
      'UPDATE research_events',
      'UPSERT editor_keys',
    ]);
    expect(found.every((f) => f.file === 'services/x.js')).toBe(true);
  });

  it('control: an allowed file deletes only from its listed tables; its UPDATE is still a finding', () => {
    const root = plant({
      'services/x.js': [
        '"DELETE FROM research_events";',
        '"DELETE FROM editor_keys";',
        "db.prepare('UPDATE research_events SET event_type = ?');",
      ].join('\n'),
    });
    const allowed = { 'services/x.js': { tables: ['research_events'], reason: 'control' } };
    expect(statements(mutations(root, allowed))).toEqual([
      'DELETE FROM editor_keys',
      'UPDATE research_events',
    ]);
    // The positive control: with the real list, which does not list this file, the allowance is what removed it.
    expect(statements(mutations(root))).toEqual([
      'DELETE FROM editor_keys',
      'DELETE FROM research_events',
      'UPDATE research_events',
    ]);
  });

  it('the scanner reads the real writer (aimed right)', () => {
    expect(sourceFiles(SERVER_ROOT)).toContain('services/researchLog.js');
    const src = fs.readFileSync(path.join(SERVER_ROOT, 'services', 'researchLog.js'), 'utf8');
    expect(src).toMatch(/INSERT INTO research_events/);
  });
});
