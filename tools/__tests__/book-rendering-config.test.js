import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { getBookRenderConfig } from '../lib/book-rendering-config.js';

const golden = JSON.parse(
  readFileSync(new URL('./fixtures/book-config-golden.json', import.meta.url), 'utf-8')
);

describe('getBookRenderConfig golden equality (migration oracle)', () => {
  for (const slug of Object.keys(golden)) {
    it(`reproduces the pre-migration config for ${slug}`, () => {
      expect(getBookRenderConfig(slug)).toEqual(golden[slug]);
    });
  }
});
