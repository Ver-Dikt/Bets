#!/usr/bin/env python3
"""Compute independent map-level CS2 estimates with actual MIT csgopred MapModel.
Uses only verified map events before each scheduled fixture. No invented veto,
rosters, series format or map information. Standalone diagnostics, not ensemble input.
"""
from __future__ import annotations
import json
import pathlib
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT / 'vendor' / 'csgopred'))
from map_elo import MapModel, POOL  # type: ignore

ARCHIVE = ROOT / 'data' / 'private' / 'maps.json'
FIXTURES = ROOT / 'data' / 'public' / 'fixtures.json'
OUTPUT = ROOT / 'data' / 'public' / 'map-insights.json'

def load(path: pathlib.Path, default: dict) -> dict:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except FileNotFoundError:
        return default

def safe_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc)

def build_insight(fixture: dict, maps: list[dict]) -> dict:
    ids = fixture.get('providerIds')
    if not isinstance(ids, list) or len(ids) != 2 or not all(ids):
        return {'status':'missing-team-identifiers'}
    a, b = 'bo3:'+str(ids[0]), 'bo3:'+str(ids[1])
    before = min(safe_time(fixture['date']), datetime.now(timezone.utc))
    history = [m for m in maps if safe_time(m['date']) + timedelta(days=1) < before]
    model = MapModel()
    counts = Counter()
    for m in sorted(history,key=lambda x:x['date']):
        if m.get('map') not in POOL: continue
        left,right = m.get('a'),m.get('b')
        if not left or not right or left == right: continue
        counts[left] += 1
        counts[right] += 1
        model.update_map(left,right,m['map'],m.get('winner') == left,1500.,1500.)
    n_a,n_b = counts[a],counts[b]
    if min(n_a,n_b) < 10:
        return {'status':'insufficient-maps','teamAMaps':n_a,'teamBMaps':n_b,'required':10}
    from map_elo import _expected  # MIT open-source original helper
    map_probs=[]
    for mp in POOL:
        ra=model.map_rating(a,mp,1500.)
        rb=model.map_rating(b,mp,1500.)
        map_probs.append({'map':mp,'probA':_expected(ra,rb),
            'mapsA':model.games.get((a,mp),0),'mapsB':model.games.get((b,mp),0)})
    fmt=(fixture.get('format') or '').lower()
    result={'status':'map-analysis','teamAMaps':n_a,'teamBMaps':n_b,
            'maps':map_probs,'teamIds':ids,'format':fixture.get('format'),'availableAt':before.isoformat(),'model':'Aokua/csgopred MapModel · MIT',
            'caution':'Map Elo exploratory and not calibrated. Includes only recorded maps. No confirmed veto.'}
    if fmt in ('bo1','bo3','bo5'):
        result['vetoEstimate'] = model.veto(a,b,fmt,1500.,1500.)
        result['seriesProbabilityA'] = model.series_prob(a,b,fmt,1500.,1500.)
        result['caution'] += ' Veto is SIMULATED, not official picks/bans.'
    else:
        result['caution'] += ' Unknown best-of: series probability not calculated.'
    return result

def main() -> None:
    raw=load(ARCHIVE,{'matches':[]})
    games=load(FIXTURES,{'fixtures':[]})
    rows=raw.get('matches',[])
    if not isinstance(rows,list): raise ValueError('Corrupted map archive')
    fixtures=[f for f in games.get('fixtures',[])
              if f.get('game')=='cs2' and f.get('status')=='upcoming']
    insights={}
    for fixture in fixtures:
        try:
            insights[fixture['id']]=build_insight(fixture,rows)
        except (ValueError,TypeError,KeyError) as error:
            insights[fixture['id']]={'status':'bad-data','reason':str(error)[:150]}
    report={'schemaVersion':1,'generatedAt':datetime.now(timezone.utc).isoformat(),
            'source':'verified bo3.gg map scores via MIT Aokua/csgopred map model',
            'historicalMaps':len(rows),'insights':insights}
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('MapModel: historicalMaps',len(rows),'upcomingCS2',len(fixtures),
          'analysed',sum(x.get('status')=='map-analysis' for x in insights.values()))

if __name__=='__main__':
    main()
