import {readFile} from 'node:fs/promises';
import {verifyJournalAdvance} from './journal-integrity.mjs';

const [previous, current] = await Promise.all(process.argv.slice(2).map(async path => JSON.parse(await readFile(path, 'utf8'))));
verifyJournalAdvance(previous, current);
console.log('Journal prefix verified ·', previous.events.length, '→', current.events.length);
