/**
 * researchEmission.emit: the one never-throwing call from a route to record (G1.2 PR3 Task 20; spec §5.11;
 * plan decisions 14, 42, 53; Review Focus 21). A built event is recorded once with the head winning, null
 * records nothing, a builder that throws is recorded as a loss (buildFailed) without its content in the log,
 * and a head that cannot be built records nothing.
 */
import { mkdtempSync } from 'fs';
import fs from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Env BEFORE any server require: researchEmission requires researchLog and through it researchDb.
const work = mkdtempSync(path.join(tmpdir(), 'research-emission-emit-'));
process.env.SESSIONS_DB_PATH = path.join(work, 'sessions.db');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'prufa-leyndarmal';

const E = require('../services/researchEmission');
const researchLog = require('../services/researchLog');
const logger = require('../lib/logger');
const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const head = {
  actorProviderId: 'p-1',
  eventType: 'edit-save',
  book: 'efnafraedi-2e',
  chapter: 1,
  moduleId: 'm1',
};
let recordSpy;
let errorSpy;
beforeEach(() => {
  recordSpy = vi
    .spyOn(researchLog, 'record')
    .mockImplementation(() => ({ status: 'skipped', reason: 'not-consenting' }));
  errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('emit', () => {
  it('a built event is recorded once, and the head wins over a builder that tries to set it', () => {
    E.emit(
      () => head,
      () => ({ segmentId: 's', actorProviderId: 'someone-else', eventType: 'apply' })
    );
    expect(recordSpy.mock.calls).toEqual([[{ ...head, segmentId: 's' }]]);
  });
  it('null from the builder records nothing (an act that wrote nothing)', () => {
    E.emit(
      () => head,
      () => null
    );
    expect(recordSpy).not.toHaveBeenCalled();
  });
  it('a builder that throws never throws out of emit; it is recorded as buildFailed, and the log holds no content', () => {
    const sentinel = 'SENTINEL-TEXT-' + 'x'.repeat(8);
    expect(() =>
      E.emit(
        () => head,
        () => {
          throw new TypeError(sentinel);
        }
      )
    ).not.toThrow();
    expect(recordSpy.mock.calls).toEqual([[{ ...head, buildFailed: true }]]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [obj] = errorSpy.mock.calls[0];
    expect(Object.keys(obj).sort()).toEqual(['book', 'errorCode', 'eventType']);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(sentinel);
  });
  it('a head that cannot be built records nothing and still does not throw', () => {
    expect(() =>
      E.emit(
        () => {
          throw new Error('no req');
        },
        () => ({})
      )
    ).not.toThrow();
    expect(recordSpy).not.toHaveBeenCalled();
  });
  it('control: a record that returns written is not looked at (routes ignore its result)', () => {
    recordSpy.mockImplementation(() => ({ status: 'written', eventId: 1n }));
    expect(
      E.emit(
        () => head,
        () => ({})
      )
    ).toBeUndefined();
  });
  it('the source calls record outside any try (activityLogCallsiteGuard, Task 11)', () => {
    const src = fs.readFileSync(path.join(SERVER, 'services', 'researchEmission.js'), 'utf8');
    expect(src).not.toMatch(/try\s*\{\s*researchLog\.record\(/);
    expect(src.match(/researchLog\.record\(/g)).toHaveLength(1); // the one call site
  });
});

describe('shared field sets and headFor', () => {
  it('NO_CLIENT clears the client fields, NONE every reference field too', () => {
    expect(E.NO_CLIENT).toEqual({ clientActionId: null, clientActionTime: null, replayed: false });
    expect(E.NONE).toEqual({
      segmentId: null,
      occurrence: null,
      servedVersionId: null,
      editingKind: null,
      editingId: null,
      editingContentSha256: null,
      origin: null,
      items: null,
      sessionId: null,
      ...E.NO_CLIENT,
    });
    expect(Object.isFrozen(E.NONE) && Object.isFrozen(E.NO_CLIENT)).toBe(true);
  });
  it('headFor reads the actor from the token and the place from its argument', () => {
    expect(
      E.headFor({ user: { id: 'p-9' } }, 'apply', { book: 'b', chapter: -1, moduleId: 'm' })
    ).toEqual({
      actorProviderId: 'p-9',
      eventType: 'apply',
      book: 'b',
      chapter: -1,
      moduleId: 'm',
    });
  });
});
