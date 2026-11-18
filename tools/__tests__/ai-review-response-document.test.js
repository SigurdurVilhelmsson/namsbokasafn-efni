import { describe, it, expect } from 'vitest';
import { readDocument, conforms, REQUEST_PROBLEMS } from '../ai-review/response-document.js';
import { assertMainCheckout } from '../ai-review/provenance.js';

const SCHEMA = {
  type: 'object',
  properties: { a: { type: 'string' } },
  required: ['a'],
  additionalProperties: false,
};
const msg = (text, stop_reason = 'end_turn', extra = []) => ({
  stop_reason,
  content: [...extra, { type: 'text', text }],
});

describe('readDocument', () => {
  it('reports a refusal', () => {
    expect(readDocument(msg('', 'refusal'), SCHEMA)).toEqual({ problem: 'response-refusal' });
  });
  it('reports truncation', () => {
    expect(readDocument(msg('', 'max_tokens'), SCHEMA).problem).toBe('response-truncated');
  });
  it('skips a thinking block and parses the text', () => {
    const m = msg('{"a":"x"}', 'end_turn', [{ type: 'thinking', thinking: '...' }]);
    expect(readDocument(m, SCHEMA)).toEqual({ problem: null, document: { a: 'x' } });
  });
  it('rejects a document that breaks the schema', () => {
    expect(readDocument(msg('{"a":1}'), SCHEMA).problem).toBe('response-invalid');
  });
  it('rejects text that is not JSON', () => {
    expect(readDocument(msg('not json'), SCHEMA).problem).toBe('response-unparseable');
  });
  it('reports an empty message', () => {
    expect(readDocument(null, SCHEMA).problem).toBe('response-empty');
  });
});

describe('conforms and REQUEST_PROBLEMS', () => {
  it('conforms accepts the exact shape', () => {
    expect(conforms(SCHEMA, { a: 'x' })).toBe(true);
  });
  it('lists the five codes', () => {
    expect(REQUEST_PROBLEMS).toHaveLength(5);
  });
  it('names its own module in the error for a schema type it does not support', () => {
    expect(() => conforms({ type: 'number' }, 1)).toThrow(
      /^response-document: schema type "number" unsupported$/
    );
  });
});

describe('assertMainCheckout', () => {
  it('refuses when the git dir differs from the common git dir', () => {
    const git = () => '/tmp\n/\n';
    let err;
    try {
      assertMainCheckout(git);
    } catch (e) {
      err = e;
    }
    expect(err?.code).toBe('linked-worktree');
  });
});
