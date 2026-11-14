"""Scene roll and head pose are different: regression guards for that distinction."""
import math
from pathlib import Path
import tempfile
import unittest

import numpy as np
from horizon_analysis import eye_evidence, scene_axis, combine_scene_eyes, analyze_image, perspective_vertical

KEEP = {'status': 'KEEP_EXISTING', 'reason': 'INSUFFICIENT_AGREEMENT', 'applyAutomatically': False}


def face(angle=2, x=200, y=200, size=100):
    points = np.array([[-.22, -.15], [.22, -.15], [0, .02], [-.16, .25], [.16, .25]])*size
    c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    points = points @ np.array([[c, s], [-s, c]]) + [x, y]
    return [x-size/2, y-size/2, size, size, *points.reshape(-1).tolist(), .99]


def lines(angle=2, vertical=False):
    t = math.tan(math.radians(angle))
    if vertical:
        return [[x+300*t, 100, x-300*t, 700] for x in (100, 350, 600, 850)]
    return [[100, y, 800, y+700*t] for y in (50, 250, 450, 650)]


class SceneEyeTests(unittest.TestCase):
    def test_eyes_measure_signed_head_angle_and_group_consensus_without_identity(self):
        for angle in (-4, 2):
            eyes = eye_evidence([face(angle, x) for x in (200, 500, 800)], 1000, 800)
            self.assertEqual(eyes['status'], 'GROUP_CONSENSUS')
            self.assertAlmostEqual(eyes['angle'], angle)
            self.assertEqual(eyes['supportingFaces'], 3)

    def test_small_occluded_profile_nan_and_reversed_eye_order(self):
        examples = [face(size=20), face(x=-5), face()[:10], [math.nan]*15]
        profile = face();profile[8] += 25
        examples.append(profile)
        for row in examples:
            self.assertNotIn('angle', eye_evidence([row], 1000, 800))
        row = face(-2);row[4:8] = row[6:8]+row[4:6]
        self.assertAlmostEqual(eye_evidence([row], 1000, 800)['angle'], -2)

    def test_different_head_poses_are_not_a_level_reference(self):
        eyes = eye_evidence([face(-8, 200), face(1, 500), face(10, 800)], 1000, 800)
        self.assertEqual(eyes['status'], 'HEAD_POSES_DISAGREE')
        self.assertNotIn('angle', eyes)

    def test_eye_only_even_a_group_never_rotates_the_room(self):
        for count in (1, 3):
            eyes = eye_evidence([face(3, 200+i*250) for i in range(count)], 1000, 800)
            result = combine_scene_eyes(KEEP, None, None, eyes)
            self.assertEqual(result['status'], 'KEEP_EXISTING')
            self.assertEqual(result['reason'], 'EYES_WITHOUT_SCENE_SUPPORT')
            self.assertNotIn('boxes', result['eyes'])

    def test_level_scene_wins_over_inclined_head(self):
        result = combine_scene_eyes(KEEP, {'angle': 0}, {'angle': .1}, eye_evidence([face(10)], 1000, 800))
        self.assertEqual((result['status'], result['reason']), ('KEEP_EXISTING', 'ALREADY_LEVEL'))

    def test_eyes_corroborate_existing_scene_decision_but_never_authorize_single_axis(self):
        eyes = eye_evidence([face(2.5)], 1000, 800)
        legacy = {'status':'PROPOSAL_ONLY','imageSlopeDegrees':2,'applyAutomatically':False}
        result = combine_scene_eyes(legacy, None, {'angle': 2}, eyes)
        self.assertEqual(result['evidence'], 'SCENE_AND_EYES_AGREE')
        self.assertEqual(result['imageSlopeDegrees'], 2)
        result = combine_scene_eyes(KEEP, None, {'angle': -2}, eyes)
        self.assertEqual(result['status'], 'KEEP_EXISTING')
        self.assertEqual(result['reason'], 'SCENE_EYES_DISAGREE')
        result = combine_scene_eyes(KEEP, None, {'angle': 2}, eyes)
        self.assertEqual(result['reason'], 'EYES_WITHOUT_SCENE_SUPPORT')
        result = combine_scene_eyes({**KEEP,'reason':'ALREADY_LEVEL'}, None, None, eyes)
        self.assertEqual(result['reason'], 'ALREADY_LEVEL')

    def test_converging_room_verticals_recover_roll_including_parallel_case(self):
        for angle in (-3, 2):
            for convergence in (0, .00015):
                segments=[]
                for x in (60, 200, 350, 550, 750, 940):
                    # dx/dy = perspective*(x-center) - tan(camera roll).
                    slope=convergence*(x-500)-math.tan(math.radians(angle))
                    for y in (200, 600):
                        segments.append([x-90*slope, y-90, x+90*slope, y+90])
                result=perspective_vertical(segments,1000,800)
                self.assertIsNotNone(result)
                self.assertAlmostEqual(result['angle'],angle,delta=.1)
        self.assertIsNone(perspective_vertical(lines(vertical=True),1000,800))

    def test_perspective_disagreement_cannot_be_resolved_by_one_head(self):
        result = combine_scene_eyes(KEEP, {'angle': 2}, {'angle': -2}, eye_evidence([face(2)], 1000, 800))
        self.assertEqual(result['status'], 'KEEP_EXISTING')

    def test_scene_requires_lines_distributed_across_the_photo_and_excludes_faces(self):
        for vertical in (False, True):
            segments = lines(vertical=vertical)
            result = scene_axis(segments, 1000, 800, vertical)
            self.assertAlmostEqual(result['angle'], 2, delta=.05)
            self.assertIsNone(scene_axis([segments[0]]*8, 1000, 800, vertical))
            self.assertIsNone(scene_axis(segments, 1000, 800, vertical, [[0, 0, 1000, 800]]))

    def test_large_intentional_angle_is_not_forced(self):
        result = combine_scene_eyes(KEEP, {'angle': 7}, {'angle': 7}, {'status': 'NO_RELIABLE_EYES'})
        self.assertEqual(result['reason'], 'LIKELY_INTENTIONAL_TILT')

    def test_detector_failure_keeps_scene_analysis_and_unicode_paths_work(self):
        import cv2
        class Broken:
            def setInputSize(self, size):
                raise RuntimeError('unavailable')
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'cenário.jpg'
            gray = np.full((800, 1000), 255, np.uint8)
            for line in lines():
                x1, y1, x2, y2 = map(round, line)
                cv2.line(gray, (x1, y1), (x2, y2), 0, 3)
            path.write_bytes(cv2.imencode('.jpg', gray)[1].tobytes())
            result = analyze_image(path, Broken())
            self.assertEqual(result['eyes']['status'], 'DETECTOR_FAILED')
            self.assertEqual(result['status'], 'PROPOSAL_ONLY')
            self.assertEqual(result['analysisMethod'], 'scene-and-eyes/1')
