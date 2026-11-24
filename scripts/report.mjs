#!/usr/bin/env node
// Deterministic research report using ONLY finished games archived from providers.
import {readArchive} from '../src/archive.mjs';
import {backtestFast} from '../src/backtest.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';

const input=resolve(process.argv[2]||'data/private/matches.json');
const output=resolve(process.argv[3]||'data/private/report.json');
const archive=await readArchive(input);
const games={};
for(const game of ['cs2','dota']){
 const rows=archive.matches.filter(m=>m.discipline===game);
 const evaluation=backtestFast(rows,game,{warmup:100,conservative:true});
 const dates=rows.map(m=>m.date).sort();
 const latest=dates.at(-1)??null,earliest=dates[0]??null;
 games[game]={
  rows:rows.length,earliest,latest,format:game==='dota'?'map':'series',model:'ensemble-v1-uncalibrated',
  tested:evaluation.tested,coverage:evaluation.coverage,quality:evaluation.results,calibration:evaluation.calibration,
  sampleAdequacy:evaluation.tested>=500?'RESEARCH_SAMPLE_500_PLUS':'INSUFFICIENT_OUT_OF_SAMPLE',
  caveat:'Forward-only historical replay. No independently logged pre-match forecasts or profitable-edge claim.'
 };
}
const result={schemaVersion:1,generatedAt:new Date().toISOString(),archiveUpdatedAt:archive.updatedAt,totalMatches:archive.matches.length,
 games,sourcePolicy:'real finished matches only; provider terms and availability still need monitoring',
 warnings:['Temperature is selected on a separate validation interval and measured on the untouched last interval.','Pre-match odds unavailable: ROI not calculated.','Provider data are not independently audited.']};
await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({savedTo:output,totalMatches:result.totalMatches,
 cs2:{rows:games.cs2.rows,tested:games.cs2.tested},dota:{rows:games.dota.rows,tested:games.dota.tested}},null,2));
