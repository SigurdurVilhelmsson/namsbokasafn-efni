/**
 * The term-pass prompt against the code that enforces it. A prompt looser than the gate
 * means mass rejections; a prompt stricter than it, lost fixes; a worked example the gate
 * refuses teaches the model to make refused edits. So: the schema is the parser's own, the
 * limits the prompt states are the gate's, the examples are verbatim corpus segments, and
 * every example operation passes the real gate with the committed ruling set.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PROMPT_PATH,
  loadPrompt,
  parseUserMessage,
  rulingForRequest,
} from '../ai-review/term-pass-request.js';
import { RESPONSE_SCHEMA, parseTermPassResponse } from '../ai-review/term-pass-response.js';
import { gateSegment, DEFAULT_LIMITS, REJECTION_CODES } from '../ai-review/gate.js';
import { loadRulingSet } from '../ai-review/ruling-set.js';
import { parseLayerFile } from '../lib/mt-layers.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOOK = path.join(REPO, 'books', 'efnafraedi-2e');
const RULINGS = loadRulingSet(
  'experiments/terminology-consistency/results/2026-10-26/ruling-set-2026-10-26.json'
);
const PROMPT = loadPrompt(path.join(REPO, PROMPT_PATH));

/** Every ```json block after "## Examples", in order. */
function exampleBlocks(text) {
  const at = text.indexOf('\n## Examples\n');
  expect(at).toBeGreaterThan(-1);
  return [...text.slice(at).matchAll(/^```json\n([\s\S]*?)^```$/gm)].map((m) => m[1]);
}

/** The examples as [{ request, answerText }] pairs. */
function examples() {
  const blocks = exampleBlocks(PROMPT.text);
  const pairs = [];
  for (let i = 0; i < blocks.length; i += 2) {
    pairs.push({ request: parseUserMessage(blocks[i]), answerText: blocks[i + 1] });
  }
  return pairs;
}

const layerCache = new Map();
function corpusBody(dir, chapter, stem, ext, segmentId) {
  const file = path.join(BOOK, dir, chapter, `${stem}-segments.${ext}.md`);
  if (!layerCache.has(file)) layerCache.set(file, parseLayerFile(fs.readFileSync(file, 'utf8')));
  const rec = layerCache.get(file).records.find((r) => r.key === segmentId);
  return rec ? rec.body : undefined;
}

function walkObjects(schema, visit, where = '$') {
  if (Array.isArray(schema)) {
    schema.forEach((s, i) => walkObjects(s, visit, `${where}[${i}]`));
    return;
  }
  if (schema === null || typeof schema !== 'object') return;
  if (schema.type === 'object') visit(schema, where);
  for (const [k, v] of Object.entries(schema)) walkObjects(v, visit, `${where}.${k}`);
}

describe('the response schema', () => {
  it('is the parser’s RESPONSE_SCHEMA, exactly', () => {
    expect(PROMPT.schema).toEqual(JSON.parse(JSON.stringify(RESPONSE_SCHEMA)));
  });

  it('closes every object and requires every property (structured outputs need both)', () => {
    let objects = 0;
    walkObjects(PROMPT.schema, (o, where) => {
      objects += 1;
      expect(o.additionalProperties, where).toBe(false);
      expect([...o.required].sort(), where).toEqual(Object.keys(o.properties).sort());
    });
    expect(objects).toBe(5);
  });

  it('uses no constraint the API does not support', () => {
    const text = JSON.stringify(PROMPT.schema);
    for (const k of [
      'minLength',
      'maxLength',
      'minimum',
      'maximum',
      'minItems',
      'maxItems',
      'pattern',
    ]) {
      expect(text).not.toContain(`"${k}"`);
    }
  });
});

describe('the limits the prompt states are the gate’s', () => {
  it('covers every limit the gate has (a new one means revisiting the prompt)', () => {
    expect(Object.keys(DEFAULT_LIMITS).sort()).toEqual([
      'agreementMinStemLetters',
      'agreementWindowWords',
      'changedShareFloorChars',
      'maxAcceptedOpsPerSegment',
      'maxChangedShare',
      'maxFindChars',
      'maxFindWords',
      'maxReplaceChars',
      'maxReplaceWords',
    ]);
  });

  it('states each one with the gate’s value', () => {
    const L = DEFAULT_LIMITS;
    expect(L.maxReplaceWords).toBe(L.maxFindWords);
    expect(L.maxReplaceChars).toBe(L.maxFindChars);
    expect(L.maxChangedShare).toBe(0.5);
    expect(L.agreementMinStemLetters).toBe(3);
    const t = PROMPT.text.replace(/\s+/g, ' ');
    expect(t).toContain(`at most ${L.maxFindWords} words and ${L.maxFindChars} characters each`);
    expect(t).toContain(`At most ${L.maxAcceptedOpsPerSegment} operations per segment`);
    expect(t).toContain(`lies at most ${L.agreementWindowWords} words from the term change`);
    expect(t).toContain(`at most ${L.agreementWindowWords} words between them`);
    expect(t).toContain("at most half of a segment's characters");
    expect(t).toContain(
      `a change of up to ${L.changedShareFloorChars} characters is always allowed`
    );
    expect(t).toContain('a shared stem of at least three letters');
  });
});

// The runner review (2026-10-27, prompt-model high + medium): the gate gained two term-op
// refusals, and a prompt that does not teach them invites edits the gate then throws away
// (the model was leaving a gendered numeral unchanged: "tvær kolefnisatóm").
describe('the term-op rules the gate added on 2026-10-27 are taught', () => {
  // Matched on whitespace-collapsed text: the prompt is wrapped markdown.
  const t = PROMPT.text.replace(/\s+/g, ' ');
  it('term-op-too-wide: a term operation changes no more words than the target has', () => {
    expect(REJECTION_CODES).toContain('term-op-too-wide');
    expect(t).toContain(
      'Apart from words it leaves unchanged at its start or end, `replace` has no more words than the target'
    );
  });
  it('quantifier-agreement: a gendered number word or quantifier near the term means no edit', () => {
    expect(REJECTION_CODES).toContain('quantifier-agreement');
    expect(t).toContain('one of the two words just before the term');
    for (const w of [
      'einn',
      'tveir',
      'þrír',
      'fjórir',
      'annar',
      'báðir',
      'enginn',
      'hálfur',
      'hvorugur',
    ]) {
      expect(t).toContain(`\`${w}\``);
    }
    expect(t).toContain('`tvær O-frumeindir`');
  });
  // The Skerfur review (2026-10-27, measured over the 591 planned requests): a request carries
  // only segments that need a check, and only 40% of consecutive presented pairs are adjacent in
  // the module, so the prompt must not tell the model that a segment's neighbours are its context.
  it('does not promise that the segments around a segment are its context', () => {
    expect(t).not.toContain('the segments around a segment are its context');
    expect(t).toContain('not necessarily neighbours');
  });
  // The final review (2026-10-27): the gate now also reads the word right after the term, and a
  // part glued to the term no longer takes one of the two places before it.
  it('teaches the word right after the term and the glued-prefix window, with real examples', () => {
    // The whole clause: the phrase alone also occurs in the sentence that qualifies it.
    expect(t).toContain(
      'one of the two words just before the term, the word right after it, or a word you would keep unchanged'
    );
    expect(t).toContain('`I-frumeindirnar tvær`');
    expect(t).toContain('`þrjár jónanlegar H-frumeindir`');
    expect(t).toContain('does not count as one of the two');
  });
  it('a hyphen is a word boundary, so a symbol prefix stays out of find', () => {
    expect(t).toContain('A hyphen is a word boundary');
  });
});

describe('the worked examples', () => {
  const pairs = examples();

  it('come in four request/answer pairs', () => {
    expect(pairs).toHaveLength(4);
  });

  it('show each ruling exactly as the committed ruling set has it', () => {
    for (const { request } of pairs) {
      for (const r of request.rulings) {
        expect(RULINGS.byId.has(r.id), r.id).toBe(true);
        expect(r).toEqual(rulingForRequest(RULINGS.byId.get(r.id)));
      }
    }
  });

  it('quote each segment verbatim from the committed English and machine translation', () => {
    for (const { request } of pairs) {
      for (const s of request.segments) {
        expect(s.id.startsWith(`${request.module}:`), s.id).toBe(true);
        expect(s.en, s.id).toBe(
          corpusBody('02-for-mt', request.chapter, request.module, 'en', s.id)
        );
        expect(s.is, s.id).toBe(
          corpusBody('02-mt-output', request.chapter, request.module, 'is', s.id)
        );
      }
    }
  });

  it('parse cleanly as answers to their requests', () => {
    for (const { request, answerText } of pairs) {
      const parsed = parseTermPassResponse({
        message: { stop_reason: 'end_turn', content: [{ type: 'text', text: answerText }] },
        requestKey: `example/${request.module}`,
        presented: request.segments.map((s) => ({ segmentId: s.id, rulingIds: s.rulings })),
        rulingsById: RULINGS.byId,
      });
      expect(parsed.problem).toBeNull();
      expect(parsed.rejected).toEqual([]);
      expect(parsed.missing).toEqual([]);
      expect(parsed.senses.every((s) => s.valid)).toBe(true);
    }
  });

  it('propose only operations the real gate accepts, and the edits they claim', () => {
    let opsSeen = 0;
    for (const { request, answerText } of pairs) {
      const parsed = parseTermPassResponse({
        message: { stop_reason: 'end_turn', content: [{ type: 'text', text: answerText }] },
        requestKey: `example/${request.module}`,
        presented: request.segments.map((s) => ({ segmentId: s.id, rulingIds: s.rulings })),
        rulingsById: RULINGS.byId,
      });
      for (const s of request.segments) {
        const ops = parsed.segments.get(s.id);
        opsSeen += ops.length;
        const res = gateSegment({
          ops,
          en: s.en,
          is: s.is,
          chapterDir: request.chapter,
          rulingsById: RULINGS.byId,
        });
        expect(res.rejected, s.id).toEqual([]);
        expect(res.accepted).toHaveLength(ops.length);
      }
    }
    // Example 1: 4 operations, example 2: 2; examples 3 and 4 make none (control: some ran).
    expect(opsSeen).toBe(6);
  });

  it('end example 1 on neuter atóm with agreeing adjectives', () => {
    const { request, answerText } = pairs[0];
    const s = request.segments[0];
    const parsed = parseTermPassResponse({
      message: { stop_reason: 'end_turn', content: [{ type: 'text', text: answerText }] },
      requestKey: 'example/1',
      presented: [{ segmentId: s.id, rulingIds: s.rulings }],
      rulingsById: RULINGS.byId,
    });
    const res = gateSegment({
      ops: parsed.segments.get(s.id),
      en: s.en,
      is: s.is,
      chapterDir: request.chapter,
      rulingsById: RULINGS.byId,
    });
    expect(res.after).toContain('Títanatómin eru grá og súrefnisatómin eru rauð.');
  });
});
