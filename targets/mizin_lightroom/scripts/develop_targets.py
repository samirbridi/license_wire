"""Validated scalar labels for extended global style learning.

Missing controls stay missing: never manufacture neutral training labels.
Point curves and hue angles require structured/circular models and are deliberately
not flattened into ordinary scalar regression targets here.
"""
import math

BASIC_TARGETS = ('Exposure2012', 'Temperature', 'Tint', 'Contrast2012',
                 'Highlights2012', 'Shadows2012', 'Whites2012', 'Blacks2012',
                 'Saturation', 'Vibrance')
CHANNELS = ('Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta')
EXTENDED_BOUNDS = {
    **{prefix + channel: (-100, 100)
       for prefix in ('HueAdjustment', 'SaturationAdjustment', 'LuminanceAdjustment')
       for channel in CHANNELS},
    'Clarity2012': (-100, 100), 'Texture': (-100, 100), 'Dehaze': (-100, 100),
    'ParametricShadows': (-100, 100), 'ParametricDarks': (-100, 100),
    'ParametricLights': (-100, 100), 'ParametricHighlights': (-100, 100),
}


# Black-and-white mixer labels are learned only from monochrome references, never from color.
MONOCHROME_BOUNDS = {'GrayMixer' + channel: (-100, 100) for channel in CHANNELS}
VARIANTS = ('color', 'monochrome')


def bounds_for(variant='color'):
    if variant not in VARIANTS:
        raise ValueError('Unsupported style variant')
    return {**EXTENDED_BOUNDS, **MONOCHROME_BOUNDS} if variant == 'monochrome' else dict(EXTENDED_BOUNDS)


def extended_labels(settings, variant='color'):
    """Extract only supported, present, finite labels; reject corrupt values."""
    if not isinstance(settings, dict):
        raise ValueError('Develop settings must be an object')
    result = {}
    for key, (lower, upper) in bounds_for(variant).items():
        if key not in settings:
            continue
        value = settings[key]
        if type(value) not in (int, float) or not math.isfinite(value) or not lower <= value <= upper:
            raise ValueError('Invalid develop label: ' + key)
        result[key] = float(value)
    return result
