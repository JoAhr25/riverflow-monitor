"""Camera-based water-edge detection (supplementary water-level cue).

Detects the dominant horizontal boundary between water and bank/vegetation
inside the ROI using a row-wise vertical-gradient profile. This is an
experimental visual cue only: the LiDAR (TF-Luna) is the primary water-level
measurement. The detector reports detected / not detected with a confidence;
it does not produce a water level in meters unless a calibration maps the edge
position to elevation.
"""
from typing import Any

import cv2
import numpy as np


class WaterEdgeDetector:
    def __init__(self, params: dict[str, Any] | None = None) -> None:
        p = params or {}
        self.min_ratio = float(p.get("min_ratio", 1.8))
        self.min_z_score = float(p.get("min_z_score", 3.0))
        self.enabled = bool(p.get("enabled", True))

    def detect(self, gray: np.ndarray) -> dict[str, Any]:
        """Return {"detected": bool, "edge_y": int|None, "edge_y_normalized": float|None, "confidence": float}."""
        if not self.enabled or gray is None or gray.size == 0:
            return {"detected": False, "edge_y": None, "edge_y_normalized": None, "confidence": 0.0}

        h, w = gray.shape[:2]
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        gradient = cv2.Sobel(blurred, cv2.CV_32F, dy=1, dx=0, ksize=3)
        row_profile = np.abs(gradient).mean(axis=1)

        if row_profile.size < 10:
            return {"detected": False, "edge_y": None, "edge_y_normalized": None, "confidence": 0.0}

        kernel = np.ones(5) / 5.0
        profile = np.convolve(row_profile, kernel, mode="same")

        median = float(np.median(profile))
        std = float(profile.std()) or 1e-9
        edge_y = int(np.argmax(profile))
        peak = float(profile[edge_y])
        ratio = peak / max(median, 1e-9)
        z_score = (peak - median) / std

        margin = max(2, h // 20)
        interior = profile[margin : h - margin]
        if interior.size:
            interior_peak = int(np.argmax(interior)) + margin
            if interior_peak != edge_y:
                edge_y = interior_peak
                peak = float(profile[edge_y])
                ratio = peak / max(median, 1e-9)
                z_score = (peak - median) / std

        detected = bool(ratio >= self.min_ratio and z_score >= self.min_z_score)
        return {
            "detected": detected,
            "edge_y": int(edge_y) if detected else None,
            "edge_y_normalized": round(edge_y / h, 4) if detected else None,
            "confidence": round(min(1.0, z_score / 15.0), 3),
        }
