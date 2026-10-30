/**
 * The leftover-form check (pilot item i02, [USER] 2026-10-29: it FLAGS for the editor, and
 * never retries or rejects). After a ruling's term operations are accepted in an occurrence,
 * does an old form of that ruling still stand in the after-text? Old forms are the ruling's
 * competitors and the model's own `find` words ("this is the old form"); words that already
 * carry the ruled target are not leftovers.
 *
 * The i02 fixtures are the ch10 pilot's real after-texts for `m68761:para:fs-idm53508384`:
 * at high the model fixed `millikrafta` and missed the sentence-initial `Millikraftar`; at
 * xhigh it fixed both.
 */
import { describe, it, expect } from 'vitest';
import { leftoverForms } from '../ai-review/leftover-forms.js';

const ruling = (id, is, competitors = [], sense = null) => ({ id, is, competitors, sense });
const byId = (...rs) => new Map(rs.map((r) => [r.id, r]));
const term = (rulingId, find, category = 'term') => ({
  opId: `o-${find}`,
  category,
  rulingId,
  find,
});

const IMF = ruling('intermolecular-force', 'millisameindakraftur');
const TEMPERATURE = ruling('temperature', 'hitastig', ['hiti']);

const I02_HIGH_AFTER =
  'Efnisstigið sem efni er í fer eftir hlutfallslegum mæli [[term:millisameindakrafta|term-00001]] ' +
  '(IMFs) þess og hreyfiorku (KE) sameinda þess. Millikraftar eru hinir ýmsu togkraftar sem geta ' +
  'verið til staðar milli atóma og sameinda efnis vegna rafstöðufyrirbæra.';
const I02_XHIGH_AFTER =
  'Efnisstigið sem efni er í fer eftir hlutfallslegum mæli [[term:millisameindakrafta|term-00001]] ' +
  '(IMFs) þess og hreyfiorku (KE) sameinda þess. Millisameindakraftar eru hinir ýmsu togkraftar sem ' +
  'geta verið til staðar milli atóma og sameinda efnis vegna rafstöðufyrirbæra.';

describe('leftoverForms', () => {
  it('flags the sentence-initial form the model left (i02 at high)', () => {
    const got = leftoverForms({
      after: I02_HIGH_AFTER,
      accepted: [term('intermolecular-force', 'millikrafta')],
      rulingsById: byId(IMF),
    });
    expect(got).toEqual([
      { rulingId: 'intermolecular-force', forms: ['millikraf'], words: ['Millikraftar'] },
    ]);
  });

  it('stays quiet once every use carries the target (i02 at xhigh)', () => {
    const got = leftoverForms({
      after: I02_XHIGH_AFTER,
      accepted: [
        term('intermolecular-force', 'millikrafta'),
        term('intermolecular-force', 'Millikraftar'),
      ],
      rulingsById: byId(IMF),
    });
    expect(got).toEqual([]);
  });

  it('does not count a word that carries the target as a leftover (hitastig holds hit-)', () => {
    const got = leftoverForms({
      after: 'Þegar hitastigið hækkar eykst hreyfiorkan.',
      accepted: [term('temperature', 'hitinn')],
      rulingsById: byId(TEMPERATURE),
    });
    expect(got).toEqual([]);
  });

  it('flags another inflection of the model’s own find', () => {
    const got = leftoverForms({
      after: 'Hitastigið hækkar og hitann þarf að mæla.',
      accepted: [term('temperature', 'hitanum')],
      rulingsById: byId(ruling('temperature', 'hitastig')),
    });
    expect(got).toEqual([{ rulingId: 'temperature', forms: ['hitan'], words: ['hitann'] }]);
  });

  it('flags a competitor the find did not name', () => {
    const got = leftoverForms({
      after: 'Hitastigið hækkar og hitinn dreifist.',
      accepted: [term('temperature', 'hitanum')],
      rulingsById: byId(TEMPERATURE),
    });
    expect(got).toEqual([{ rulingId: 'temperature', forms: ['hit'], words: ['hitinn'] }]);
  });

  it('takes a multi-word find’s longest word as its old form', () => {
    const got = leftoverForms({
      after: 'Kristalkennt fastefni og kristallað efni.',
      accepted: [term('crystalline-solid', 'Kristallað fast efni')],
      rulingsById: byId(ruling('crystalline-solid', 'kristalkennt fastefni')),
    });
    expect(got).toEqual([
      { rulingId: 'crystalline-solid', forms: ['kristall'], words: ['kristallað'] },
    ]);
  });

  it('ignores agreement operations: their find is not an old form of the term', () => {
    const got = leftoverForms({
      after: I02_HIGH_AFTER,
      accepted: [
        {
          opId: 'a1',
          category: 'agreement',
          rulingId: 'intermolecular-force',
          find: 'Millikraftar',
        },
      ],
      rulingsById: byId(IMF),
    });
    expect(got).toEqual([]);
  });

  it('reads term-sense operations as term operations', () => {
    const got = leftoverForms({
      after: I02_HIGH_AFTER,
      accepted: [term('intermolecular-force', 'millikrafta', 'term-sense')],
      rulingsById: byId(IMF),
    });
    expect(got.map((g) => g.rulingId)).toEqual(['intermolecular-force']);
  });

  it('reads what a reader sees: a link’s URL is not a leftover', () => {
    const got = leftoverForms({
      after: 'Sjá [[link:millisameindakrafta|http://openstax.org/l/millikraftar]] hér.',
      accepted: [term('intermolecular-force', 'millikrafta')],
      rulingsById: byId(IMF),
    });
    expect(got).toEqual([]);
  });

  it('reports one entry per ruling, with each leftover word once', () => {
    const got = leftoverForms({
      after: 'Millikraftar og millikraftar og millikröftum.',
      accepted: [
        term('intermolecular-force', 'millikrafta'),
        term('intermolecular-force', 'millikraftana'),
      ],
      rulingsById: byId(IMF),
    });
    expect(got).toEqual([
      {
        rulingId: 'intermolecular-force',
        // `millikraftana` has a stem of its own; every old-form stem that matched is named.
        forms: ['millikraf', 'millikrafta'],
        words: ['Millikraftar', 'millikraftar', 'millikröftum'],
      },
    ]);
  });

  it('refuses an accepted operation whose ruling it cannot find', () => {
    expect(() =>
      leftoverForms({ after: 'x', accepted: [term('nope', 'abcd')], rulingsById: byId(IMF) })
    ).toThrow(/nope/);
  });
});
