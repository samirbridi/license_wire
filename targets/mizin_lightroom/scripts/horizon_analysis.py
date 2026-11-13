"""Conservative line-based horizon proposal; does not write Lightroom settings.

Perspective and intentional camera roll remain ambiguous. A proposal requires
agreement among spatially distributed near-horizontal edges, never one line.
The image-coordinate slope is NOT a validated Lightroom CropAngle convention.

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


def analyze_image(path):
    import cv2
    # imdecode keeps non-ASCII Windows profile paths working (cv2.imread does not).
    data = np.fromfile(str(path), dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_GRAYSCALE) if data.size else None
    if image is None:
        raise ValueError('Image unavailable')
    height, width = image.shape
    edges = cv2.Canny(image, 60, 160)
    lines = cv2.HoughLinesP(edges, 1, np.pi/1800, threshold=60,
                            minLineLength=max(20, int(width*.10)), maxLineGap=12)
    horizontal = propose_from_lines([] if lines is None else lines.reshape(-1, 4), width, height)
    line_peak = vertical_peak = None
    detector = getattr(cv2, 'createLineSegmentDetector', None)
    if detector is not None:
        found = detector(cv2.LSD_REFINE_STD).detect(image)[0]
        segments = np.zeros((0, 4)) if found is None else found.reshape(-1, 4)
        line_peak = family_peak(segments, width, height, vertical=False)
        vertical_peak = family_peak(segments, width, height, vertical=True)
    result = combine(horizontal, line_peak, vertical_peak)
    # Oriented render size: the editor needs the aspect ratio for a rotation-safe crop.
    return {**result, 'imageWidth': int(width), 'imageHeight': int(height)}
