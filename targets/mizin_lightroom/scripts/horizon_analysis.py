"""Conservative line-based horizon proposal; does not write Lightroom settings.

Perspective and intentional camera roll remain ambiguous. A proposal requires
agreement among spatially distributed near-horizontal edges, never one line.
CropAngle conversion and rotation-safe cropping belong to the Lightroom adapter.
Eyes corroborate scene geometry; head pose alone never establishes gravity.
The perspective estimate is diagnostic only: measured real-photo errors did not
justify using it to authorize additional automatic rotations.

Calibrated against 102 real technical renders preserved from prior QA jobs
(private/incoming, private/qa; de-duplicated by content hash). The original
thresholds (18% minimum line length, 80% cluster-weight ratio, and a vertical
Y-spread >=30% of height) never produced a single proposal on any of those 102
photos: KEEP_EXISTING fired 100% of the time. Two distinct problems caused
that, fixed below:
  1. Geometric bug: for a near-level line (angle<=8 degrees) spanning the full
     image width, the maximum possible Y-spread is width/height * tan(angle),
     which stays under ~9% of height even at the 8-degree limit on a portrait
     684x1024 render. A >=30% vertical-spread requirement was therefore nearly
     impossible to satisfy by construction, regardless of real agreement
     between segments. The "spatially distributed, not one local decoration"
     check now measures horizontal (X) coverage instead, which is the axis a
     near-horizontal line actually extends along.
  2. Overly strict calibration: minLineLength=18% of width and a cluster-weight
     ratio of 0.80 left real photos with too few candidate segments, or a
     dominant cluster too small relative to Hough noise, to ever pass. Lowered
     to 10% and 0.55 respectively; 0.55 keeps a deliberate safety margin above
     the exact 0.50 tie that the conflicting-perspective synthetic test below
     exercises (two equally-weighted opposing clusters must still be rejected).
This still returns proposals on only ~2 of the 102 real photos tested (most
real photos simply lack a confident Hough consensus): the detector stays
conservative by design, not tuned to accept on every frame.
"""
import math
import numpy as np


def propose_from_lines(lines, width, height):
    if width <= 0 or height <= 0:
        raise ValueError('Invalid image dimensions')
    candidates = []
    min_length = width*.10
    for line in lines:
        x1, y1, x2, y2 = map(float, line)
        if not all(math.isfinite(v) for v in (x1, y1, x2, y2)):
            continue
        dx, dy = x2-x1, y2-y1
        length = math.hypot(dx, dy)
        angle = (math.degrees(math.atan2(dy, dx))+90) % 180-90
        if length >= min_length and abs(angle) <= 8:
            candidates.append((angle, length, min(x1, x2), max(x1, x2)))
    rejected = {'status': 'KEEP_EXISTING', 'reason': 'INSUFFICIENT_AGREEMENT',
                'applyAutomatically': False}
    if len(candidates) < 4:
        return rejected
    angles = np.array([c[0] for c in candidates])
    weights = np.array([c[1] for c in candidates])
    # Select the strongest angular consensus; a long outlier cannot decide alone.
    support = [np.abs(angles-a) <= .6 for a in angles]
    mask = max(support, key=lambda m: float(weights[m].sum()))
    if mask.sum() < 4 or weights[mask].sum()/weights.sum() < .55:
        return rejected
    kept = [c for c, keep in zip(candidates, mask) if keep]
    x_span = max(c[3] for c in kept) - min(c[2] for c in kept)
    if x_span < width*.3:
        return rejected
    angle = float(np.average(angles[mask], weights=weights[mask]))
    if abs(angle) < .25:
        return {**rejected, 'reason': 'ALREADY_LEVEL'}
    return {'status': 'PROPOSAL_ONLY', 'imageSlopeDegrees': angle,
            'supportingSegments': int(mask.sum()), 'applyAutomatically': False,
            'reason': 'REQUIRES_LIGHTROOM_SIGN_AND_CROP_VALIDATION'}


# Build 0037: measured against the photographer's own leveling (544 approved photos with a
# Lightroom CropAngle; 425 of them straightened by >=0.3 degree). The horizontal-only rule
# above proposed on 11 photos: 6 closer to the photographer, 4 farther. Near-vertical edges
# (walls, doors, columns: common at indoor events) are an independent witness of camera
# roll, while perspective bends horizontals and verticals differently. Requiring the two
# families to agree, or at least verticals not to contradict, gave 9 closer and 2 farther.
# Every naive variant that proposed more often made more photos worse than better, so the
# detector stays deliberately rare. The photographer never leveled beyond ~4 degrees;
# larger tilts are treated as intentional.
MAX_TILT = 5.0
AGREEMENT = .5
VETO = 1.0


def family_peak(lines, width, height, vertical, min_length=.05, max_dev=6.0, bandwidth=.3,
                min_segments=3, min_fraction=.3, min_span=.3, center_weight=.6):
    """Dominant deviation (degrees, image y-down, same sign as imageSlopeDegrees) of the
    near-horizontal or near-vertical segments, or None without a spread-out consensus."""
    if width <= 0 or height <= 0:
        raise ValueError('Invalid image dimensions')
    segments = np.asarray(lines, dtype=float).reshape(-1, 4)
    if not len(segments):
        return None
    x1, y1, x2, y2 = segments.T
    length = np.hypot(x2-x1, y2-y1)
    angle = np.degrees(np.arctan2(y2-y1, x2-x1))
    if vertical:
        deviation = angle % 180-90
        # Keystone tilts off-center verticals in opposite directions; the center column is honest.
        weight = length*(1-center_weight*np.abs((x1+x2)/2-width/2)/(width/2))
        low, high = np.minimum(y1, y2)/height, np.maximum(y1, y2)/height
    else:
        deviation = (angle+90) % 180-90
        weight = length.copy()
        low, high = np.minimum(x1, x2)/width, np.maximum(x1, x2)/width
    keep = np.isfinite(deviation) & (length >= min_length*max(width, height)) & (np.abs(deviation) <= max_dev)
    if keep.sum() < min_segments:
        return None
    deviation, weight, low, high = deviation[keep], weight[keep], low[keep], high[keep]
    grid = np.arange(-max_dev, max_dev+.001, .05)
    density = (weight[None, :]*np.exp(-.5*((deviation[None, :]-grid[:, None])/bandwidth)**2)).sum(1)
    chosen = np.abs(deviation-grid[density.argmax()]) <= 2*bandwidth
    if chosen.sum() < min_segments or weight[chosen].sum()/weight.sum() < min_fraction:
        return None
    if high[chosen].max()-low[chosen].min() < min_span:
        return None
    return float(np.average(deviation[chosen], weights=weight[chosen])), float(weight[chosen].sum())


def combine(horizontal, line_peak, vertical_peak):
    """Final decision from the Hough horizon proposal and the LSD horizontal/vertical peaks."""
    angle = None
    if line_peak and vertical_peak and abs(line_peak[0]-vertical_peak[0]) <= AGREEMENT:
        angle = (line_peak[0]*line_peak[1]+vertical_peak[0]*vertical_peak[1])/(line_peak[1]+vertical_peak[1])
        evidence = 'HORIZONTAL_AND_VERTICAL_AGREE'
    elif horizontal.get('status') == 'PROPOSAL_ONLY':
        if vertical_peak and abs(vertical_peak[0]-horizontal['imageSlopeDegrees']) > VETO:
            return {'status': 'KEEP_EXISTING', 'reason': 'INSUFFICIENT_AGREEMENT',
                    'vetoedByVerticals': True, 'applyAutomatically': False}
        angle, evidence = horizontal['imageSlopeDegrees'], 'HORIZONTAL_NOT_CONTRADICTED'
    if angle is None:
        return horizontal
    if abs(angle) < .25:
        return {'status': 'KEEP_EXISTING', 'reason': 'ALREADY_LEVEL', 'applyAutomatically': False}
    if abs(angle) > MAX_TILT:
        return {'status': 'KEEP_EXISTING', 'reason': 'LIKELY_INTENTIONAL_TILT', 'applyAutomatically': False}
    return {'status': 'PROPOSAL_ONLY', 'imageSlopeDegrees': float(angle), 'evidence': evidence,
            'applyAutomatically': False, 'reason': 'REQUIRES_LIGHTROOM_SIGN_AND_CROP_VALIDATION'}


def eye_evidence(faces, width, height):
    """YuNet 15-column output: box, right/left eye, nose, mouth corners, score.

    Eyes measure head roll, NOT gravity. Retain only sufficiently large, frontal,
    well localized faces; a consensus is corroboration for scene geometry.
    No recognition, identity or biometric template is produced.
    """
    usable, boxes = [], []
    for row in ([] if faces is None else faces):
        row = np.asarray(row, dtype=float).reshape(-1)
        if len(row) != 15 or not np.isfinite(row).all():
            continue
        x, y, w, h = row[:4]
        if w <= 0 or h <= 0 or row[14] < .9:
            continue
        boxes.append([float(x), float(y), float(x+w), float(y+h)])
        points = row[4:14].reshape(5, 2)
        if any(not (0 <= px < width and 0 <= py < height and
                    x <= px <= x+w and y <= py <= y+h) for px, py in points):
            continue
        left, right = sorted(points[:2], key=lambda p: p[0])
        delta = right-left
        distance = float(np.linalg.norm(delta))
        if distance < 16 or not .2 <= distance/w <= .75:
            continue
        axis = delta/distance
        nose = points[2]-(left+right)/2
        # Oblique faces and hidden eyes are poor references even with a high face score.
        if abs(float(nose @ axis))/distance > .22:
            continue
        mouth_left, mouth_right = sorted(points[3:], key=lambda p: p[0])
        mouth = mouth_right-mouth_left
        angle = math.degrees(math.atan2(delta[1], delta[0]))
        mouth_angle = math.degrees(math.atan2(mouth[1], mouth[0]))
        if abs(angle) > 20 or abs(mouth_angle-angle) > 8:
            continue
        usable.append({'angle': float(angle), 'x': float((x+w/2)/width),
                       'y': float((y+h/2)/height), 'eyePixels': distance})
    usable = sorted(usable, key=lambda f: f['eyePixels'], reverse=True)[:64]
    result = {'status': 'NO_RELIABLE_EYES', 'detectedFaces': len(boxes),
              'usableFaces': len(usable), 'supportingFaces': 0, 'boxes': boxes}
    if not usable:
        return result
    angles = np.array([f['angle'] for f in usable])
    median = float(np.median(angles))
    selected = np.abs(angles-median) <= 2
    kept = [f for f, keep in zip(usable, selected) if keep]
    if not kept or selected.sum()/len(usable) < .7:
        return {**result, 'status': 'HEAD_POSES_DISAGREE'}
    angle = float(np.median(angles[selected]))
    spread = float(np.median(np.abs(angles[selected]-angle)))
    span = max(f['x'] for f in kept)-min(f['x'] for f in kept)
    group = len(kept) >= 3 and span >= .2 and spread <= 1
    return {**result, 'status': 'GROUP_CONSENSUS' if group else 'HEAD_POSE_ONLY',
            'angle': angle, 'supportingFaces': len(kept), 'spread': spread}


def scene_axis(lines, width, height, vertical, face_boxes=()):
    """One background direction, supported across different parts of the frame.

    Remove facial segments so eyes cannot double-count as background evidence.
    Long parallel duplicates confined to one decoration cannot decide the roll.
    """
    segments = np.asarray(lines, dtype=float).reshape(-1, 4)
    if not len(segments):
        return None
    mid = (segments[:, :2]+segments[:, 2:])/2
    keep = np.isfinite(segments).all(axis=1)
    for x0, y0, x1, y1 in face_boxes:
        keep &= ~((mid[:, 0] >= x0) & (mid[:, 0] <= x1) & (mid[:, 1] >= y0) & (mid[:, 1] <= y1))
    segments = segments[keep]
    peak = family_peak(segments, width, height, vertical, min_length=.08,
                       min_fraction=.55, min_span=.5, bandwidth=.4, max_dev=8)
    if peak is None:
        return None
    dx, dy = segments[:, 2]-segments[:, 0], segments[:, 3]-segments[:, 1]
    raw = np.degrees(np.arctan2(dy, dx))
    angles = raw % 180-90 if vertical else (raw+90) % 180-90
    chosen = (np.abs(angles-peak[0]) <= .8) & (np.hypot(dx, dy) >= .08*max(width, height))
    supporting = segments[chosen]
    if len(supporting) < 3:
        return None
    across = (supporting[:, 0]+supporting[:, 2])/(2*width) if vertical else (supporting[:, 1]+supporting[:, 3])/(2*height)
    if float(np.ptp(across)) < .2:
        return None
    return {'angle': float(peak[0]), 'supportingSegments': len(supporting), 'acrossSpan': float(np.ptp(across))}


def combine_scene_eyes(legacy, horizontal, vertical, eyes):
    """Conservative multi-cue roll: scene authority, eyes only as corroboration."""
    result = dict(legacy)
    eye_angle = eyes.get('angle')
    axes = [a for a in (horizontal, vertical) if a is not None]
    angle, evidence = None, None
    if horizontal and vertical and abs(horizontal['angle']-vertical['angle']) <= .5:
        angle = (horizontal['angle']+vertical['angle'])/2
        evidence = 'SCENE_AXES_AGREE'
    # Measured development set: an eye line plus one scene axis introduced eight
    # extra worse corrections. Head pose is not an independent gravity reference.
    # Eyes corroborate a scene proposal, but never authorize a new rotation alone.
    elif legacy.get('status') == 'PROPOSAL_ONLY' and eye_angle is not None and abs(legacy['imageSlopeDegrees']-eye_angle) <= .8:
        angle = legacy['imageSlopeDegrees']
        evidence = 'SCENE_AND_EYES_AGREE'
    # Conflicting scene directions mean perspective; no eye-only escape from that veto.
    if angle is not None:
        if abs(angle) < .25:
            result = {'status': 'KEEP_EXISTING', 'reason': 'ALREADY_LEVEL', 'applyAutomatically': False}
        elif abs(angle) <= MAX_TILT:
            result = {'status': 'PROPOSAL_ONLY', 'imageSlopeDegrees': angle, 'evidence': evidence,
                      'reason': 'MULTI_CUE_CONSENSUS', 'applyAutomatically': False}
        else:
            result = {'status': 'KEEP_EXISTING', 'reason': 'LIKELY_INTENTIONAL_TILT', 'applyAutomatically': False}
    elif legacy.get('reason') == 'INSUFFICIENT_AGREEMENT' and eye_angle is not None:
        disagrees = any(abs(axis['angle']-eye_angle) > .8 for axis in axes)
        result['reason'] = 'SCENE_EYES_DISAGREE' if disagrees else 'EYES_WITHOUT_SCENE_SUPPORT'
    # Fixed-size diagnostics only; no image or landmark coordinates in the job report.
    result['analysisMethod'] = 'scene-and-eyes/1'
    result['scene'] = {'horizontal': horizontal, 'vertical': vertical}
    result['eyes'] = {k: v for k, v in eyes.items() if k != 'boxes'}
    return result


def perspective_vertical(lines, width, height, face_boxes=()):
    """Robust vertical vanishing point, including a point at infinity (parallel walls).

    Different vertical slopes can be perspective, not conflicting camera roll.
    Fit one common vanishing direction across multiple image regions, excluding
    approximate person regions so clothing/poses do not masquerade as room axes.
    """
    segments = np.asarray(lines, dtype=float).reshape(-1, 4)
    if not len(segments):
        return None
    mid = (segments[:, :2]+segments[:, 2:])/2
    delta = segments[:, 2:]-segments[:, :2]
    length = np.linalg.norm(delta, axis=1)
    dev = np.degrees(np.arctan2(delta[:, 1], delta[:, 0])) % 180-90
    keep = np.isfinite(segments).all(axis=1) & (length >= .12*height) & (np.abs(dev) < 25)
    for x0, y0, x1, y1 in face_boxes:
        fw, fh = x1-x0, y1-y0
        keep &= ~((mid[:, 0] >= x0-.5*fw) & (mid[:, 0] <= x1+.5*fw) &
                  (mid[:, 1] >= y0-.2*fh) & (mid[:, 1] <= y1+3*fh))
    indices = np.flatnonzero(keep)
    # At most two long segments per grid cell; duplicate edge fragments cannot vote unboundedly.
    cells, chosen = {}, []
    for i in sorted(indices, key=lambda i: -length[i]):
        cell = (int(mid[i, 0]/width*8), int(mid[i, 1]/height*6))
        if cells.get(cell, 0) < 2:
            chosen.append(i);cells[cell] = cells.get(cell, 0)+1
    if len(chosen) < 6:
        return None
    segments, mid, length, delta = segments[chosen], mid[chosen], length[chosen], delta[chosen]
    scale = max(width, height)
    center = np.array([width/2, height/2])
    first = np.column_stack(((segments[:, :2]-center)/scale, np.ones(len(segments))))
    last = np.column_stack(((segments[:, 2:]-center)/scale, np.ones(len(segments))))
    equations = np.cross(first, last)
    equations /= np.linalg.norm(equations[:, :2], axis=1)[:, None]
    ia, ib = np.triu_indices(len(segments), 1)
    vp = np.cross(equations[ia], equations[ib])
    norm = np.linalg.norm(vp[:, :2], axis=1)
    valid = norm > 1e-8
    vp = vp[valid]/norm[valid, None]
    vp *= np.where(vp[:, 1:2] > 0, -1, 1)
    roll = np.degrees(np.arctan2(vp[:, 0], -vp[:, 1]))
    # Avoid extrapolating from an implausibly close vanishing point.
    valid = (np.abs(roll) <= 8) & (np.abs(vp[:, 2])*height/scale < .65)
    vp = vp[valid]
    if not len(vp):
        return None
    mids = (mid-center)/scale
    rays = vp[:, None, :2]-vp[:, None, 2:]*mids[None, :, :]
    unit = delta/length[:, None]
    cross = np.abs(rays[:, :, 0]*unit[None, :, 1]-rays[:, :, 1]*unit[None, :, 0])
    residual = np.degrees(np.arcsin(np.clip(cross/np.linalg.norm(rays, axis=2), 0, 1)))
    support = residual < .5
    scores = support @ length
    best = support[int(np.argmax(scores))]
    if best.sum() < 6 or length[best].sum()/length.sum() < .6:
        return None
    xs = mid[best, 0]/width
    if np.ptp(xs) < .4 or xs.min() > .35 or xs.max() < .65:
        return None
    points = segments[best].reshape(-1, 2)
    if np.ptp(points[:, 1])/height < .5:
        return None
    _, _, vectors = np.linalg.svd(equations[best]*np.sqrt(length[best, None]))
    point = vectors[-1]
    if point[1] > 0:
        point = -point
    angle = float(np.degrees(np.arctan2(point[0], -point[1])))
    if not math.isfinite(angle) or abs(angle) > MAX_TILT:
        return None
    return {'angle': angle, 'supportingSegments': int(best.sum()),
            'supportFraction': float(length[best].sum()/length.sum()), 'acrossSpan': float(np.ptp(xs))}


def analyze_image(path, face_detector=None, include_legacy=False):
    import cv2
    # imdecode keeps non-ASCII Windows profile paths working (cv2.imread does not).
    data = np.fromfile(str(path), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_GRAYSCALE) if data.size else None
    if image is None:
        raise ValueError('Image unavailable')
    height, width = image.shape
    eyes = {'status': 'DETECTOR_UNAVAILABLE', 'usableFaces': 0, 'supportingFaces': 0, 'boxes': []}
    if face_detector is not None:
        try:
            color = cv2.imdecode(data, cv2.IMREAD_COLOR)
            scale = min(1, 960/max(width, height))
            small = cv2.resize(color, (round(width*scale), round(height*scale))) if scale < 1 else color
            face_detector.setInputSize((small.shape[1], small.shape[0]))
            _, found = face_detector.detect(small)
            if found is not None:
                found = np.asarray(found, dtype=float).copy()
                found[:, :14] /= scale
            eyes = eye_evidence(found, width, height)
        except Exception:
            eyes['status'] = 'DETECTOR_FAILED'
    edges = cv2.Canny(image, 60, 160)
    lines = cv2.HoughLinesP(edges, 1, np.pi/1800, threshold=60,
                            minLineLength=max(20, int(width*.10)), maxLineGap=12)
    horizontal = propose_from_lines([] if lines is None else lines.reshape(-1, 4), width, height)
    line_peak = vertical_peak = None
    segments = np.zeros((0, 4))
    detector = getattr(cv2, 'createLineSegmentDetector', None)
    if detector is not None:
        found = detector(cv2.LSD_REFINE_STD).detect(image)[0]
        segments = np.zeros((0, 4)) if found is None else found.reshape(-1, 4)
        line_peak = family_peak(segments, width, height, vertical=False)
        vertical_peak = family_peak(segments, width, height, vertical=True)
    legacy = combine(horizontal, line_peak, vertical_peak)
    result = combine_scene_eyes(legacy, scene_axis(segments, width, height, False, eyes['boxes']),
                               scene_axis(segments, width, height, True, eyes['boxes']), eyes)
    vp = perspective_vertical(segments, width, height, eyes['boxes'])
    result['scene']['perspectiveVertical'] = vp
    # Development corpus: this fallback added 15 proposals, but 10 moved farther
    # from the photographer's approved angle. Preserve it as diagnostic evidence,
    # never as authority to rotate. Do not trade correctness for a higher counter.
    if include_legacy:
        result['legacy'] = legacy
    # Oriented render size: the editor needs the aspect ratio for a rotation-safe crop.
    return {**result, 'imageWidth': int(width), 'imageHeight': int(height)}


# Camera electronic level (Canon MakerNotes RollAngle, 0.1 degree steps), note 48.
# Measured on 544 photos with the photographer's approved CropAngle (development = first
# 360 rows, holdout = rest): the sensor carries a real signal (r=0.61) but is only about
# +-1 degree accurate, so the full reading over-rotates. Half of it was best on development
# (least-squares slope 0.39-0.48); a scene axis that agrees with the camera is more precise
# and replaces it. Holdout: mean error 0.996 -> ~0.72 degree, about 3 photos closer per 1 farther.
CAMERA_LEVEL_WEIGHT = .5
CAMERA_SCENE_AGREEMENT = .75
CAMERA_MAX_TILT = 5.0


def camera_tilt(roll):
    """Residual roll of the camera body relative to the nearest 90-degree orientation,
    returned in the CropAngle / imageSlopeDegrees sign (a camera rolled +x needs -x)."""
    return -(roll - round(roll / 90.0) * 90.0)


def apply_camera_level(result, camera_roll):
    """Fuse the camera's level with the scene axes already in `result` (analyze_image output).

    Without a finite camera reading the detector's own decision is returned unchanged.
    """
    if not isinstance(result, dict) or not isinstance(camera_roll, (int, float)) or not math.isfinite(camera_roll):
        return result
    if result.get('reason') == 'ANALYSIS_FAILED':
        return result
    camera = camera_tilt(float(camera_roll))
    out = dict(result)
    out['cameraLevel'] = {'rollAngle': float(camera_roll), 'cameraSlopeDegrees': round(camera, 3)}
    for key in ('imageSlopeDegrees', 'evidence'):
        out.pop(key, None)
    if abs(camera) > CAMERA_MAX_TILT:
        out.update(status='KEEP_EXISTING', reason='LIKELY_INTENTIONAL_TILT', applyAutomatically=False)
        return out
    scene = result.get('scene') or {}
    best = None
    for axis in ('horizontal', 'vertical', 'perspectiveVertical'):
        item = scene.get(axis)
        angle = item.get('angle') if isinstance(item, dict) else None
        if isinstance(angle, (int, float)) and math.isfinite(angle) and abs(angle - camera) <= CAMERA_SCENE_AGREEMENT:
            if best is None or abs(angle - camera) < abs(best[1] - camera):
                best = (axis, float(angle))
    if best is not None:
        angle, evidence = best[1], 'SCENE_CONFIRMED_BY_CAMERA_LEVEL'
    else:
        angle, evidence = CAMERA_LEVEL_WEIGHT * camera, 'CAMERA_LEVEL'
    if abs(angle) < .25:
        out.update(status='KEEP_EXISTING', reason='ALREADY_LEVEL', applyAutomatically=False)
    else:
        out.update(status='PROPOSAL_ONLY', imageSlopeDegrees=angle, evidence=evidence,
                   reason='CAMERA_LEVEL_FUSION', applyAutomatically=False)
    return out
