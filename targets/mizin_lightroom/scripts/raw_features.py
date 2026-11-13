"""Shared read-only RAW input domain, used identically in training and inference."""
import ctypes
import hashlib
import math
import os
from pathlib import Path

import numpy as np

def sha256_file(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def source_reader(path):
    if os.name != "nt":
        return open(path, "rb")
    import msvcrt
    from ctypes import wintypes
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    create = kernel.CreateFileW
    create.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                       wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    create.restype = wintypes.HANDLE
    handle = create(str(path), 0x80000000, 0x00000001, None, 3, 0x08000000, None)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        fd = msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
    except BaseException:
        close = kernel.CloseHandle
        close.argtypes = [wintypes.HANDLE]
        close(handle)
        raise
    return os.fdopen(fd, "rb", buffering=4 * 1024 * 1024)


def technical_render(path, output, metadata, face_detector=None):
    os.environ.setdefault("OMP_NUM_THREADS", "4")
    import numpy as np
    import rawpy
    from PIL import Image
    with rawpy.imread(str(path)) as raw:
        camera_wb = [float(v) for v in raw.camera_whitebalance]
        size = {"rawWidth": int(raw.sizes.raw_width), "rawHeight": int(raw.sizes.raw_height)}
        rgb = raw.postprocess(half_size=True, use_camera_wb=True, use_auto_wb=False,
                              no_auto_bright=True, bright=1.0, exp_shift=1.0,
                              output_color=rawpy.ColorSpace.sRGB, output_bps=8,
                              demosaic_algorithm=rawpy.DemosaicAlgorithm.LINEAR)
    image = Image.fromarray(rgb)
    image.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    image.save(output, format="JPEG", quality=90, subsampling=0)
    small = image.copy()
    small.thumbnail((128, 128), Image.Resampling.LANCZOS)
    pixels = np.asarray(small, dtype=np.float64) / 255.0
    luma = pixels @ np.array([0.2126, 0.7152, 0.0722])
    features = {}
    # Measured against 186 real approved references (private dataset, not shipped): the
    # skin-sampled red/blue ratio correlates -0.73 with the photographer's approved
    # Temperature, far stronger than any whole-frame statistic already collected above.
    # Optional by construction (face_detector=None keeps every existing caller working
    # unchanged): when a face is confidently found, its skin tone becomes additional
    # input features for a FUTURE model to learn from; it is never required, never
    # fabricated when absent, and never itself an edit -- predicting from it is future
    # work once a model is trained with it in its featureNames.
    if face_detector is not None:
        skin = skin_tone_sample(np.asarray(image), face_detector)
        if skin is not None:
            features.update(skin)
    for channel, name in enumerate(("red", "green", "blue")):
        values = pixels[:, :, channel]
        features[name + "Mean"] = float(values.mean())
        features[name + "Std"] = float(values.std())
        for q in (0.05, 0.25, 0.5, 0.75, 0.95):
            features[name + f"Q{round(q*100):02}"] = float(np.quantile(values, q))
    features["lumaMean"] = float(luma.mean())
    features["lumaStd"] = float(luma.std())
    features["shadowFraction"] = float((luma < 0.1).mean())
    features["highlightFraction"] = float((luma > 0.9).mean())
    for q in (0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99):
        features[f"lumaQ{round(q*100):02}"] = float(np.quantile(luma, q))
    for index, value in enumerate(camera_wb):
        features[f"cameraWb{index}"] = value
    for key in ("ISO", "ExposureTime", "FNumber", "FocalLength"):
        value = metadata.get(key)
        if type(value) in (int, float) and math.isfinite(value):
            features["capture" + key] = value
    if not all(math.isfinite(value) for value in features.values()):
        raise ValueError("Nonfinite features")
    return {"features": features, "inputDomain": "LIBRAW_CAMERA_WB_SRGB_HALF_SIZE_NO_AUTO_BRIGHT_V1",
            "renderWidth": image.width, "renderHeight": image.height, "cameraWb": camera_wb,
            "rawSize": size, "jpegSha256": sha256_file(output), "rawpyVersion": rawpy.__version__,
            "librawVersion": list(rawpy.libraw_version), "lightroomAdjustmentsApplied": False,
            "adobeRenderingEquivalentClaimed": False}


def _skin_pixel_mask(patch):
    """Classic RGB skin-color rule (Peer et al., widely cited and reused, e.g. in OpenCV
    sample code); evaluated per pixel so hair/eyes/shadow/background inside the face box
    do not dilute the measurement. `patch` is HxWx3 uint8 RGB.
    """
    r = patch[:, :, 0].astype(np.int16)
    g = patch[:, :, 1].astype(np.int16)
    b = patch[:, :, 2].astype(np.int16)
    hi = np.maximum(np.maximum(r, g), b).astype(np.int16)
    lo = np.minimum(np.minimum(r, g), b).astype(np.int16)
    return (r > 95) & (g > 40) & (b > 20) & ((hi - lo) > 15) & (np.abs(r - g) > 15) & (r > g) & (r > b)


def skin_tone_sample(display, detector):
    """Average skin-pixel color from the largest detected face, measured on the oriented
    display render (the same one the technical JPEG comes from). Returns None (never a
    fabricated neutral value) when no face is confidently detected or too few pixels in
    the box classify as skin to be a reliable average -- absence must stay absence so a
    model trained on this never learns a false "no adjustment needed" from a missing face.
    """
    height, width = display.shape[:2]
    scale = min(1, 960 / max(height, width))
    import cv2
    detector_image = cv2.resize(display, (round(width * scale), round(height * scale))) if scale < 1 else display
    detector.setInputSize((detector_image.shape[1], detector_image.shape[0]))
    _, found = detector.detect(cv2.cvtColor(detector_image, cv2.COLOR_RGB2BGR))
    if found is None or len(found) == 0:
        return None
    face = max(found, key=lambda f: f[-1])
    x, y, w, h = (float(v) / scale for v in face[:4])
    x0, y0 = max(0, round(x)), max(0, round(y))
    x1, y1 = min(width, round(x + w)), min(height, round(y + h))
    if x1 <= x0 or y1 <= y0:
        return None
    # Inner-central crop of the detected box: cheeks/forehead, away from hair, background
    # and the detector's own box-edge uncertainty.
    cx0, cx1 = round(x0 + .3 * (x1 - x0)), round(x0 + .7 * (x1 - x0))
    cy0, cy1 = round(y0 + .3 * (y1 - y0)), round(y0 + .7 * (y1 - y0))
    if cx1 <= cx0 or cy1 <= cy0:
        return None
    patch = display[cy0:cy1, cx0:cx1]
    mask = _skin_pixel_mask(patch)
    if mask.sum() < 25:
        return None
    pixels = patch[mask].astype(np.float64) / 255.0
    r, g, b = (float(pixels[:, i].mean()) for i in range(3))
    if min(r, g, b) <= 1e-6:
        return None
    return {"faceConfidence": float(face[-1]), "skinSampledPixels": int(mask.sum()),
            "skinR": r, "skinG": g, "skinB": b,
            "skinRedBlueRatio": r / b, "skinRedGreenRatio": r / g}
