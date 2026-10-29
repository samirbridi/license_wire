"""Shared read-only RAW input domain, used identically in training and inference."""
import ctypes
import hashlib
import math
import os
from pathlib import Path

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


def technical_render(path, output, metadata):
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
