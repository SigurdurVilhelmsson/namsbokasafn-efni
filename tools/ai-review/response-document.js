/**
 * response-document.js — reads one raw Messages API response whose text is a JSON document and
 * checks it against a structured-output schema. Shared by the term pass and the glossary
 * pre-screen. Pure: plain data in, plain data out; no I/O and no import from server/.
 *
 * The shape check walks the schema object the caller passes (never a second copy of it), so the
 * schema a prompt embeds and the schema the parser enforces cannot drift apart. The API's own
 * enforcement is not relied on.
 */

/** What can be wrong with a response as a whole, sorted. Any one empties the result. */
export const REQUEST_PROBLEMS = Object.freeze([
  'response-empty', // no message at all
  'response-invalid', // a stop_reason other than end_turn, or a shape that breaks the schema
  'response-refusal', // stop_reason 'refusal'
  'response-truncated', // stop_reason 'max_tokens'
  'response-unparseable', // no text block, or the text blocks do not JSON.parse
]);

export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The schema keywords `conforms` understands; any other keyword is refused at load. */
const SUPPORTED_KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'anyOf',
]);

/**
 * Refuse a schema `conforms` cannot honour: an unknown keyword, or an object that is not closed.
 * @param {object} schema
 * @param {string} [where] a label for the error message
 */
export function assertSupported(schema, where = 'RESPONSE_SCHEMA') {
  const unknown = Object.keys(schema).filter((k) => !SUPPORTED_KEYWORDS.has(k));
  if (unknown.length > 0) throw new Error(`${where}: unsupported keyword(s) ${unknown.join(', ')}`);
  if (schema.type === 'object' && schema.additionalProperties !== false) {
    throw new Error(`${where}: an object must set additionalProperties: false`);
  }
  for (const [k, sub] of Object.entries(schema.properties ?? {})) {
    assertSupported(sub, `${where}.${k}`);
  }
  if (schema.items) assertSupported(schema.items, `${where}[]`);
  (schema.anyOf ?? []).forEach((sub, i) => assertSupported(sub, `${where}|${i}`));
}

/**
 * Does `value` (a JSON.parse result) have exactly the shape `schema` describes? Exact keys
 * (additionalProperties is false everywhere), required keys present, types and enums.
 * @param {object} schema a node of the response schema
 * @param {unknown} value
 * @returns {boolean}
 */
export function conforms(schema, value) {
  if (schema.anyOf) return schema.anyOf.some((sub) => conforms(sub, value));
  switch (schema.type) {
    case 'object': {
      if (!isPlainObject(value)) return false;
      const keys = Object.keys(value);
      return (
        keys.every((k) => Object.hasOwn(schema.properties, k)) &&
        schema.required.every((k) => Object.hasOwn(value, k)) &&
        keys.every((k) => conforms(schema.properties[k], value[k]))
      );
    }
    case 'array':
      return Array.isArray(value) && value.every((v) => conforms(schema.items, v));
    case 'string':
      return typeof value === 'string' && (!schema.enum || schema.enum.includes(value));
    case 'null':
      return value === null;
    default:
      throw new Error(`response-document: schema type ${JSON.stringify(schema.type)} unsupported`);
  }
}

/** Content blocks that carry no answer and are skipped. Any other non-text type is invalid. */
const IGNORED_BLOCKS = new Set(['thinking', 'redacted_thinking']);

/**
 * The parsed answer document, or the problem that stops it.
 * @param {object|null|undefined} message one raw Messages API response
 * @param {object} schema the schema the document must conform to
 * @returns {{ problem: string|null, document?: object }}
 */
export function readDocument(message, schema) {
  if (message === null || message === undefined) return { problem: 'response-empty' };
  if (!isPlainObject(message)) return { problem: 'response-invalid' };
  if (message.stop_reason === 'refusal') return { problem: 'response-refusal' };
  if (message.stop_reason === 'max_tokens') return { problem: 'response-truncated' };
  if (message.stop_reason !== 'end_turn') return { problem: 'response-invalid' };
  if (!Array.isArray(message.content)) return { problem: 'response-invalid' };
  const texts = [];
  for (const block of message.content) {
    if (!isPlainObject(block)) return { problem: 'response-invalid' };
    if (block.type === 'text') {
      if (typeof block.text !== 'string') return { problem: 'response-invalid' };
      texts.push(block.text);
    } else if (!IGNORED_BLOCKS.has(block.type)) {
      return { problem: 'response-invalid' };
    }
  }
  if (texts.length === 0) return { problem: 'response-unparseable' };
  let document;
  try {
    document = JSON.parse(texts.join(''));
  } catch {
    return { problem: 'response-unparseable' };
  }
  if (!conforms(schema, document)) return { problem: 'response-invalid' };
  return { problem: null, document };
}
