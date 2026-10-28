/**
 * Fixture for the term pass's end-to-end tests: a throwaway git repository holding a real
 * copy of one chemistry chapter (structure, layer 1, English, links), the prompt and the
 * ruling set at their repository paths, plus a mock transport that answers like the model.
 * Nothing here touches the network or the real repository's tree.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseUserMessage, PROMPT_PATH } from '../../ai-review/term-pass-request.js';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const RULING_SET_PATH =
  'experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json';
const REAL_BOOK = path.join(REPO, 'books', 'efnafraedi-2e');

/** Every temp directory this fixture made; `removeTempDirs` deletes them (/tmp is a small tmpfs). */
const made = [];
export function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
}
export function removeTempDirs() {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
}

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

/**
 * @param {{ chapters?: string[] }} [opts]
 * @returns {{ root: string, book: string, records: string, sh: (args: string[]) => string, commit: string }}
 */
export function makeTempRepo({ chapters = ['ch02'] } = {}) {
  const root = makeTempDir('tp-repo-');
  const book = path.join(root, 'books', 'efnafraedi-2e');
  for (const ch of chapters) {
    const stems = fs
      .readdirSync(path.join(REAL_BOOK, '02-structure', ch))
      .filter((n) => /^m\d+-structure\.json$/.test(n))
      .map((n) => n.replace('-structure.json', ''));
    for (const stem of stems) {
      copy(
        path.join(REAL_BOOK, '02-structure', ch, `${stem}-structure.json`),
        path.join(book, '02-structure', ch, `${stem}-structure.json`)
      );
    }
    for (const stem of [...stems, 'chapter-metadata']) {
      for (const [dir, name] of [
        ['02-mt-output', `${stem}-segments.is.md`],
        ['02-mt-output', `${stem}-segments-links.json`],
        ['02-for-mt', `${stem}-segments.en.md`],
      ]) {
        const from = path.join(REAL_BOOK, dir, ch, name);
        if (fs.existsSync(from)) copy(from, path.join(book, dir, ch, name));
      }
    }
  }
  copy(path.join(REPO, PROMPT_PATH), path.join(root, PROMPT_PATH));
  copy(path.join(REPO, RULING_SET_PATH), path.join(root, RULING_SET_PATH));
  const sh = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  sh(['init', '-q']);
  sh(['config', 'user.email', 't@example.invalid']);
  sh(['config', 'user.name', 't']);
  sh(['add', '.']);
  sh(['commit', '-q', '-m', 'fixture']);
  return {
    root,
    book,
    records: path.join(book, 'ai-review'),
    sh,
    commit: sh(['rev-parse', 'HEAD']),
  };
}

/** The prompt's example 1 operations, on the real TiO2 caption. */
export const TIO2_ID = 'm68693:caption:CNX_Chem_02_04_TiO2-caption';
export const TIO2_OPS = [
  {
    category: 'term',
    ruling: 'atom',
    sense: null,
    find: 'Títanfrumeindirnar',
    replace: 'Títanatómin',
    reason: 'atom',
  },
  {
    category: 'term',
    ruling: 'atom',
    sense: null,
    find: 'súrefnisfrumeindirnar',
    replace: 'súrefnisatómin',
    reason: 'atom',
  },
  {
    category: 'agreement',
    ruling: 'atom',
    sense: null,
    find: 'gráar',
    replace: 'grá',
    reason: 'agreement',
  },
  {
    category: 'agreement',
    ruling: 'atom',
    sense: null,
    find: 'rauðar',
    replace: 'rauð',
    reason: 'agreement',
  },
];
export const AL_ID = 'm68696:para:fs-idp232924112';

/** The model's answer to one request: empty for every segment except the ones we script. */
export function scriptedAnswer(body) {
  const doc = parseUserMessage(body.messages[0].content);
  return {
    segments: doc.segments.map((s) => {
      if (s.id === TIO2_ID) return { id: s.id, senses: [], ops: TIO2_OPS, flags: [] };
      if (s.id === AL_ID) {
        return {
          id: s.id,
          senses: [],
          ops: [],
          flags: [
            { kind: 'needs-rewrite', ruling: 'atom', note: 'pronoun hún would need to become það' },
          ],
        };
      }
      return { id: s.id, senses: [], ops: [], flags: [] };
    }),
  };
}

export function messageFor(answer, { stopReason = 'end_turn' } = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    stop_reason: stopReason,
    content: [
      { type: 'thinking', thinking: 'summary', signature: 'sig' },
      { type: 'text', text: JSON.stringify(answer) },
    ],
    usage: {
      input_tokens: 900,
      output_tokens: 400,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  };
}

/**
 * A transport with the harness's five methods, answering from `answer(body)`.
 * `batchStates` is the sequence getBatch reports (last value repeats).
 */
export function mockTransport({ answer = scriptedAnswer, batchStates = ['ended'] } = {}) {
  const calls = { send: 0, countTokens: 0, submitBatch: 0, getBatch: 0 };
  let submitted = [];
  let polls = 0;
  return {
    calls,
    async countTokens() {
      calls.countTokens += 1;
      return { input_tokens: 1000 };
    },
    async send(body) {
      calls.send += 1;
      return messageFor(answer(body));
    },
    async submitBatch(requests) {
      calls.submitBatch += 1;
      submitted = requests;
      return { id: 'msgbatch_test', processing_status: 'in_progress' };
    },
    async getBatch() {
      calls.getBatch += 1;
      const state = batchStates[Math.min(polls, batchStates.length - 1)];
      polls += 1;
      return { id: 'msgbatch_test', processing_status: state };
    },
    async *batchResults() {
      for (const r of submitted) {
        yield {
          custom_id: r.custom_id,
          result: { type: 'succeeded', message: messageFor(answer(r.params)) },
        };
      }
    },
    sdk: () => ({ name: '@anthropic-ai/sdk', version: '1.3.0' }),
    anthropicVersion: () => '2026-10-21',
    secrets: () => [],
  };
}
