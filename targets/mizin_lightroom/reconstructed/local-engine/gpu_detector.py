"""GPU and Hardware Acceleration detector for CRISPIX.
Detects NVIDIA RTX / CUDA capabilities and provides hardware telemetry for the Lightroom plugin.
"""
from __future__ import annotations

import ctypes
import json
import os
from pathlib import Path
import sys


def detect_cuda_driver() -> dict:
    """Query NVIDIA CUDA driver directly via Windows nvcuda.dll without external dependencies."""
    if sys.platform != "win32":
        return {"available": False, "reason": "Not Windows"}

    try:
        nvcuda = ctypes.windll.LoadLibrary("nvcuda.dll")
    except Exception as e:
        return {"available": False, "reason": f"NVIDIA driver nvcuda.dll not loaded: {e}"}

    try:
        if nvcuda.cuInit(0) != 0:
            return {"available": False, "reason": "cuInit failed"}

        count = ctypes.c_int()
        if nvcuda.cuDeviceGetCount(ctypes.byref(count)) != 0 or count.value <= 0:
            return {"available": False, "reason": "No CUDA devices found"}

        devices = []
        for i in range(count.value):
            dev = ctypes.c_int()
            if nvcuda.cuDeviceGet(ctypes.byref(dev), i) != 0:
                continue

            name_buf = ctypes.create_string_buffer(256)
            nvcuda.cuDeviceGetName(name_buf, 256, dev)
            dev_name = name_buf.value.decode("utf-8", errors="ignore").strip()

            # Query VRAM (64-bit on x64)
            vram_bytes = ctypes.c_size_t()
            vram_gb = 0.0
            if hasattr(nvcuda, "cuDeviceTotalMem_v2"):
                if nvcuda.cuDeviceTotalMem_v2(ctypes.byref(vram_bytes), dev) == 0:
                    vram_gb = round(vram_bytes.value / (1024 ** 3), 1)
            elif nvcuda.cuDeviceTotalMem(ctypes.byref(vram_bytes), dev) == 0:
                vram_gb = round(vram_bytes.value / (1024 ** 3), 1)

            devices.append({
                "index": i,
                "name": dev_name,
                "vramGb": vram_gb,
            })

        driver_ver = ctypes.c_int()
        if nvcuda.cuDriverGetVersion(ctypes.byref(driver_ver)) == 0:
            major = driver_ver.value // 1000
            minor = (driver_ver.value % 1000) // 10
            driver_str = f"CUDA {major}.{minor}"
        else:
            driver_str = "CUDA Driver"

        main_device = devices[0]["name"] if devices else "NVIDIA GPU"
        vram_display = f"{devices[0]['vramGb']} GB" if devices and devices[0]['vramGb'] > 0 else ""

        return {
            "available": True,
            "backend": "cuda",
            "driver": driver_str,
            "deviceCount": len(devices),
            "primaryDevice": main_device,
            "vram": vram_display,
            "devices": devices,
            "recommendedBatchSize": 32 if devices and devices[0].get("vramGb", 0) >= 4 else 16,
        }
    except Exception as e:
        return {"available": False, "reason": f"CUDA query error: {e}"}


def get_hardware_info(cache_file: Path | None = None) -> dict:
    """Detects the NVIDIA driver/device (hardware presence) only.

    'available' here means "an NVIDIA GPU with a CUDA driver exists", NOT "this
    plugin's OpenCV build can use it for inference" -- those are different facts.
    Confirmed 2026-11-16: the bundled opencv-python-headless 4.13.0.92 wheel has no
    CUDA module compiled in (cv2.dnn.getAvailableTargets(DNN_BACKEND_CUDA) == []),
    so acceleration is not wired into culling_engine.py yet. Callers (like
    PluginInfoProvider.lua) must show this as "GPU detected" information, not as
    "GPU acceleration active".
    """
    info = detect_cuda_driver()
    if not info.get("available"):
        info = {
            "available": False,
            "backend": "cpu",
            "driver": "CPU Multi-threading",
            "primaryDevice": "Processador (CPU)",
            "vram": "-",
            "recommendedBatchSize": 8,
        }
    if cache_file:
        try:
            cache_file = Path(cache_file)
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            with cache_file.open("w", encoding="utf-8") as f:
                json.dump(info, f, indent=2, ensure_ascii=False)
        except Exception:
            pass
    return info


def opencv_cuda_actually_available(cv) -> bool:
    """True only if this OpenCV build can really run DNN inference on a CUDA device.

    cv2.dnn.DNN_BACKEND_CUDA exists as an enum value even in CPU-only wheels, and
    Net.setPreferableBackend(DNN_BACKEND_CUDA) does not raise when the backend is
    unsupported: it just logs a warning and silently runs on the CPU (verified
    2026-11-16 against the bundled opencv-python-headless 4.13.0.92 wheel, which
    has no CUDA module compiled in). The only reliable check is asking OpenCV
    which targets that backend actually supports; an unsupported backend reports
    an empty list.
    """
    try:
        targets = cv.dnn.getAvailableTargets(cv.dnn.DNN_BACKEND_CUDA)
        return len(list(targets)) > 0
    except Exception:
        return False


def configure_opencv_dnn_backend(cv, net, use_gpu: bool = True) -> str:
    """Configures OpenCV DNN network to use CUDA only if this build can really run it.

    Returns 'cuda' only when inference will actually execute on the GPU. Otherwise
    returns 'cpu' or 'cpu_fallback': callers must not report GPU acceleration as
    active unless this returns 'cuda'. See opencv_cuda_actually_available for why
    setPreferableBackend alone cannot be trusted to signal support.
    """
    if use_gpu and opencv_cuda_actually_available(cv):
        try:
            net.setPreferableBackend(cv.dnn.DNN_BACKEND_CUDA)
            net.setPreferableTarget(cv.dnn.DNN_TARGET_CUDA)
            return "cuda"
        except Exception:
            pass

    try:
        net.setPreferableBackend(cv.dnn.DNN_BACKEND_OPENCV)
        net.setPreferableTarget(cv.dnn.DNN_TARGET_CPU)
    except Exception:
        pass
    return "cpu" if not use_gpu else "cpu_fallback"


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="CRISPIX GPU/hardware detector")
    parser.add_argument("--cache-file", required=False, type=Path, default=None,
                        help="Where to write the detected hardware info as JSON")
    args = parser.parse_args()
    result = get_hardware_info(cache_file=args.cache_file)
    print(json.dumps(result, indent=2))
