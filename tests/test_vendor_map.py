import importlib.util
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT / 'vendor' / 'csgopred'))
from map_elo import MapModel

spec = importlib.util.spec_from_file_location('bets_map_insights',ROOT / 'scripts' / 'map-insights.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def record(i, date):
    return {'id':f'bo3-map-{i}','date':date,'map':'Mirage',
            'a':'bo3:10','b':'bo3:20','winner':'bo3:10'}

class ActualImportedModelTest(unittest.TestCase):
    def test_vendor_map_model_updates_real_style_games(self):
        model=MapModel()
        model.update_map('bo3:10','bo3:20','Mirage',True,1500.,1500.)
        self.assertGreater(model.map_rating('bo3:10','Mirage',1500.),1500.)
        self.assertLess(model.map_rating('bo3:20','Mirage',1500.),1500.)

    def test_no_map_prediction_without_evidence(self):
        fixture={'id':'bo3-fixture','providerIds':['10','20'],
                 'format':'bo3','date':'2026-11-24T12:00:00Z'}
        result=module.build_insight(fixture,[])
        self.assertEqual(result['status'],'insufficient-maps')
        self.assertEqual(result['teamAMaps'],0)

    def test_predictions_use_only_maps_before_start(self):
        fixture={'id':'bo3-fixture','providerIds':['10','20'],
                 'format':'bo3','date':'2026-11-24T12:00:00Z'}
        past=[record(i,'2026-11-10T10:00:00Z') for i in range(12)]
        future=[record(i+100,'2026-12-01T10:00:00Z') for i in range(35)]
        a=module.build_insight(fixture,past)
        b=module.build_insight(fixture,past+future)
        self.assertEqual(a['status'],'map-analysis')
        self.assertAlmostEqual(a['seriesProbabilityA'],b['seriesProbabilityA'])
        self.assertEqual(a['teamAMaps'],12)

if __name__=='__main__':
    unittest.main()
