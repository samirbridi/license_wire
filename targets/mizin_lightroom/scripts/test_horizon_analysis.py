import hashlib
import math
import os
import unittest
from pathlib import Path

from horizon_analysis import propose_from_lines


def segments(angle):
    dy=600*math.tan(math.radians(angle))
    return [[100, y, 700, y+dy] for y in (50, 200, 400, 650)]


class HorizonTests(unittest.TestCase):
    def test_consensus_proposal_not_automatic(self):
        result=propose_from_lines(segments(2), 1000, 800)
        self.assertEqual(result['status'], 'PROPOSAL_ONLY')
        self.assertAlmostEqual(result['imageSlopeDegrees'], 2)
        self.assertFalse(result['applyAutomatically'])

    def test_reverse_endpoints_same_result(self):
        lines=[line[2:]+line[:2] for line in segments(-3)]
        self.assertAlmostEqual(propose_from_lines(lines,1000,800)['imageSlopeDegrees'],-3)

    def test_no_lines_or_single_line_keeps_existing(self):
        for lines in ([], segments(2)[:1]):
            self.assertEqual(propose_from_lines(lines,1000,800)['status'],'KEEP_EXISTING')

    def test_conflicting_perspective_keeps_existing(self):
        self.assertEqual(propose_from_lines(segments(3)+segments(-3),1000,800)['status'],'KEEP_EXISTING')

    def test_local_decoration_not_global_evidence(self):
        # Narrow in X (15% of width): a real local object, not a horizon spanning the frame.
        lines=[[50,y,200,y+5] for y in (100,110,120,130)]
        self.assertEqual(propose_from_lines(lines,1000,800)['status'],'KEEP_EXISTING')

    def test_level_and_extreme_angle_preserved(self):
        for angle in (0, 15):
            self.assertEqual(propose_from_lines(segments(angle),1000,800)['status'],'KEEP_EXISTING')

    def test_vertical_family_measures_roll_with_horizon_sign(self):
        from horizon_analysis import family_peak
        # A clockwise roll of 2 degrees (y-down) tilts verticals by the same signed amount.
        t=math.tan(math.radians(2))
        # Rotating (0,1) clockwise by 2 degrees moves it left while going down the frame.
        verticals=[[x+300*t,100,x-300*t,700] for x in (420,480,520,580)]
        peak=family_peak(verticals,1000,800,vertical=True)
        self.assertAlmostEqual(peak[0],2,delta=.05)
        self.assertAlmostEqual(family_peak([[100,y,700,y+600*t] for y in (100,300,500,700)],1000,800,vertical=False)[0],2,delta=.05)
        self.assertIsNone(family_peak([],1000,800,vertical=True))

    def test_combine_agreement_veto_and_intentional_tilt(self):
        from horizon_analysis import combine
        proposal={'status':'PROPOSAL_ONLY','imageSlopeDegrees':1.2,'applyAutomatically':False}
        keep={'status':'KEEP_EXISTING','reason':'INSUFFICIENT_AGREEMENT','applyAutomatically':False}
        agreed=combine(keep,(1.0,10.),(1.2,10.))
        self.assertEqual((agreed['status'],agreed['evidence']),('PROPOSAL_ONLY','HORIZONTAL_AND_VERTICAL_AGREE'))
        self.assertAlmostEqual(agreed['imageSlopeDegrees'],1.1)
        self.assertEqual(combine(proposal,None,None)['evidence'],'HORIZONTAL_NOT_CONTRADICTED')
        self.assertEqual(combine(proposal,None,(1.9,5.))['status'],'PROPOSAL_ONLY')
        vetoed=combine(proposal,None,(-.5,5.))
        self.assertEqual((vetoed['status'],vetoed['reason']),('KEEP_EXISTING','INSUFFICIENT_AGREEMENT'))
        self.assertEqual(combine(keep,None,None),keep)
        self.assertEqual(combine(keep,(.1,1.),(.1,1.))['reason'],'ALREADY_LEVEL')
        self.assertEqual(combine({**proposal,'imageSlopeDegrees':6.5},None,None)['reason'],'LIKELY_INTENTIONAL_TILT')
        for result in (agreed,vetoed):self.assertFalse(result['applyAutomatically'])

    def test_real_preserved_renders_never_raise_and_stay_conservative(self):
        # Regression guard: the original thresholds produced zero PROPOSAL_ONLY results on
        # every real technical render preserved from prior QA jobs (102 unique by content
        # hash). This replays analyze_image's own Canny/Hough call against that same real
        # evidence so the calibration cannot silently regress back to never proposing.
        try:
            import cv2
            import numpy as np
        except ImportError:
            self.skipTest('opencv/numpy unavailable in this interpreter')
        from horizon_analysis import analyze_image
        root = Path(__file__).resolve().parents[1] / 'private'
        if not root.exists():
            self.skipTest('private evidence folder unavailable in this environment')
        seen = {}
        for dirpath, _, files in os.walk(root):
            for name in files:
                if name.startswith('input-') and name.endswith('.jpg'):
                    path = Path(dirpath) / name
                    digest = hashlib.sha256(path.read_bytes()).hexdigest()
                    seen.setdefault(digest, path)
        if not seen:
            self.skipTest('no preserved technical renders found')
        proposals = 0
        for path in seen.values():
            result = analyze_image(path)
            self.assertIn(result['status'], ('PROPOSAL_ONLY', 'KEEP_EXISTING'))
            self.assertFalse(result['applyAutomatically'])
            if result['status'] == 'PROPOSAL_ONLY':
                proposals += 1
                self.assertLessEqual(abs(result['imageSlopeDegrees']), 8)
        # Conservative by design: expect a small minority, never zero and never most photos.
        self.assertGreater(proposals, 0)
        self.assertLess(proposals, len(seen) * 0.5)


if __name__=='__main__':
    unittest.main()
