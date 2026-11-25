// Plain-word labels for AssignGate.tla, for the /statechart skill's chart and report.
//
// Each chart state says who holds chapter 1 (the one real chapter in the model) and whether its study unit has
// opened, in the words the editors and admins use. Detail that does not change what the study cares about (which of
// the two modelled users it is, a non-holder's consent or licence once someone holds the chapter) is left out, so
// that equal situations share one chart state.
//
// Values arrive as plain JSON: a function is an object keyed by user (u1, u2), a set is an array, a tuple is an
// object keyed "1", "2", and a record is an object.

export const title = 'G1.13: who can open a chemistry study unit';

const ROLE = { editor: 'an editor', head: 'a head editor', admin: 'an admin' };
const CHAPTER = 1;

const holdersOf = (v) => v.rows.filter((r) => r['2'] === CHAPTER).map((r) => r['1']);
const openingOf = (v) => v.openings.find((o) => o.unit === CHAPTER);

/** What the study's rules forbid about a holder or an opener, besides their role, in words. */
function issues({ consent, licence }) {
  const out = [];
  if (consent === 'none') out.push('no consent decision');
  if (!licence) out.push('no licence clause');
  return out;
}

const withIssues = (list) => (list.length ? ` with ${list.join(' and ')}` : '');
const isBroken = (role, list) => role !== 'editor' || list.length > 0;

export function state(v) {
  const o = openingOf(v);
  if (o) {
    const list = issues({ consent: o.consentAt, licence: o.licenceAt });
    return `Unit opened by ${ROLE[o.roleAt]}${withIssues(list)}`;
  }
  const holders = holdersOf(v);
  if (holders.length) {
    const h = holders[0];
    return `Chapter assigned to ${ROLE[v.role[h]]}${withIssues(issues({ consent: v.consent[h], licence: v.licence[h] }))}`;
  }
  const users = Object.keys(v.role);
  const cleared = users.some(
    (u) => v.role[u] === 'editor' && v.consent[u] !== 'none' && v.licence[u]
  );
  const partway = users.some((u) => v.consent[u] !== 'none' || v.licence[u]);
  if (cleared) return `Nobody holds the chapter; an editor is cleared to be assigned`;
  if (partway) return `Nobody holds the chapter; an editor is part-way cleared`;
  return `Nobody holds the chapter`;
}

export function group(v) {
  const o = openingOf(v);
  if (o) {
    const list = issues({ consent: o.consentAt, licence: o.licenceAt });
    return isBroken(o.roleAt, list) ? 'broken' : 'opened';
  }
  const holders = holdersOf(v);
  if (holders.length) {
    const h = holders[0];
    return isBroken(v.role[h], issues({ consent: v.consent[h], licence: v.licence[h] }))
      ? 'broken'
      : 'assigned';
  }
  return 'waiting';
}

export const colors = { waiting: 'blue', assigned: 'teal', opened: 'purple', broken: 'orange' };

const changedUser = (from, to) => Object.keys(to.role).find((u) => from.role[u] !== to.role[u]);

export function step(action, from, to) {
  switch (action) {
    case 'AssignReplacing':
    case 'AssignAdding':
      return 'an admin assigns the chapter';
    case 'RemoveRow':
    case 'ClearChapter':
      return 'an admin takes the chapter away';
    case 'SetRole': {
      const r = to.role[changedUser(from, to)];
      return r === 'editor'
        ? 'an admin makes them a plain editor'
        : `an admin makes them ${ROLE[r]}`;
    }
    case 'RecordDecision':
      return 'the editor records a consent decision';
    case 'Withdraw':
      return 'the editor withdraws consent';
    case 'RecordLicence':
      return 'an admin records their licence clause';
    case 'RemoveLicence':
      return 'an admin removes their licence clause';
    case 'Serve':
      return 'the holder opens the module';
    default:
      return action;
  }
}
