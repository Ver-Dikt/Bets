import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {emptyArchive,isValidMatch,mergeArchive,readArchive,writeArchive} from '../src/archive.mjs';
const m={id:'cs-1',discipline:'cs2',a:'A',b:'B',winner:'A',date:'2026-11-10T12:00:00.000Z',source:'bo3.gg (unofficial)'};
test('dedupe by stable provider ID and reject malformed inputs',()=>{
 const a=mergeArchive(emptyArchive(),[m,m,{...m,id:'other',winner:'C'}]);
 assert.deepEqual(a.report,{added:1,duplicates:1,conflicts:0,rejected:1,total:1});
 assert.equal(isValidMatch(a.archive.matches[0]),true);
});
test('conflicting winner cannot silently rewrite historical event',()=>{
 const a=mergeArchive(emptyArchive(),[m]).archive;
 const next=mergeArchive(a,[{...m,winner:'B'}]);
 assert.equal(next.report.conflicts,1);assert.equal(next.archive.matches[0].winner,'A');
});
test('archive persists and loads; no data is invented when missing',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bets-')),file=join(dir,'archive.json');
 try{
  assert.deepEqual(await readArchive(file),emptyArchive());
  const value=mergeArchive(emptyArchive(),[m]).archive;await writeArchive(file,value);
  const loaded=await readArchive(file);assert.equal(loaded.matches.length,1);assert.equal(loaded.matches[0].id,m.id);
  assert.ok((await readFile(file,'utf8')).includes('cs-1'));
 }finally{await rm(dir,{recursive:true,force:true})}
});
