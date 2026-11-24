import {createHash, timingSafeEqual} from 'node:crypto';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hex = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const equal = (a, b) => hex(a) && hex(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

export function verifyJournal(journal) {
  if (!Array.isArray(journal?.events)) throw Error('Malformed forecast journal');
  if (journal.schemaVersion === 1) return journal;
  const {legacyCount, anchor, head} = journal.integrity ?? {};
  if (journal.schemaVersion !== 2 || !Number.isInteger(legacyCount) || legacyCount < 0 ||
    legacyCount > journal.events.length || !equal(anchor, digest(journal.events.slice(0, legacyCount)))) {
    throw Error('Forecast journal legacy anchor mismatch');
  }
  let previous = anchor;
  for (const {hash, prevHash, ...payload} of journal.events.slice(legacyCount)) {
    if (!equal(prevHash, previous) || !equal(hash, digest([previous, payload]))) {
      throw Error('Forecast journal event chain mismatch');
    }
    previous = hash;
  }
  if (!equal(head, previous)) throw Error('Forecast journal head mismatch');
  return journal;
}

export function appendJournal(before, events) {
  verifyJournal(before);
  if (!events.length) return before;
  const legacyCount = before.integrity?.legacyCount ?? before.events.length;
  const anchor = before.integrity?.anchor ?? digest(before.events);
  let head = before.integrity?.head ?? anchor;
  // Serialize once so optional undefined fields are absent from the signed payload.
  const appended = events.map(event => {
    const payload = JSON.parse(JSON.stringify(event));
    const prevHash = head;
    head = digest([prevHash, payload]);
    return {...payload, prevHash, hash: head};
  });
  return {schemaVersion: 2, integrity: {legacyCount, anchor, head}, events: [...before.events, ...appended]};
}

export function verifyJournalAdvance(before, after) {
  verifyJournal(before);
  verifyJournal(after);
  if (before.events.length > after.events.length ||
    ((before.schemaVersion === 2 || before.events.length < after.events.length) && after.schemaVersion !== 2) ||
    (after.schemaVersion === 2 && after.integrity.legacyCount !== (before.integrity?.legacyCount ?? before.events.length)) ||
    digest(before.events) !== digest(after.events.slice(0, before.events.length))) {
    throw Error('Forecast history was overwritten');
  }
}
