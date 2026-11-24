import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {mergeArchive} from '../src/archive.mjs';

export const yearArchivePath='data/private/year-results.json';
export const recoveredPath = 'data/private/recovered-results.json';
export async function readRecovered(file = recoveredPath) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const bundle = JSON.parse(raw);
  if (bundle.schemaVersion !== 1 || bundle.encoding !== 'gzip+base64') throw Error('Invalid recovered results schema');
  const data = JSON.parse(gunzipSync(Buffer.from(bundle.payload, 'base64')).toString('utf8'));
  if (!Array.isArray(data) || data.length !== bundle.count) throw Error('Invalid recovered results count');
  return data;
}

export async function researchArchive(archive) {
  const sources=await Promise.all([readRecovered(),readRecovered(yearArchivePath)]);
  return mergeArchive(archive,sources.flat()).archive;
}
