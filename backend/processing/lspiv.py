"""Grid PIV / LSPIV-style block matching.

This is a lightweight LSPIV implementation: normalized cross-correlation block
matching on a regular grid (cv2.matchTemplate). It measures image-space
displacement in pixels and is used as the in-webapp LSPIV baseline.

For research-grade LSPIV with orthorectification, GCP projection and discharge,
use the PyORC adapter (pyorc_adapter.py) inside the pyorc_env environment;
PyORC is the testing/calibration/validation reference tool for this project.
"""
from typing import Any

import cv2
import numpy as np


class BlockPIVProcessor:
    def __init__(self, params: dict[str, Any] | None = None, vector_grid: int = 32,
                 min_vector_magnitude: float = 1.0) -> None:
        p = params or {}
        self.window = int(p.get("window", 32))
        self.search_radius = int(p.get("search_radius", 16))
        self.grid_step = max(8, int(p.get("grid_step", vector_grid)))
        self.min_vector_magnitude = float(min_vector_magnitude)
        self._prev_gray: np.ndarray | None = None

    def reset(self) -> None:
        self._prev_gray = None

    def process_frame(self, gray_frame: np.ndarray) -> dict[str, Any] | None:
        gray = gray_frame.astype(np.uint8)
        if self._prev_gray is None or gray.shape != self._prev_gray.shape:
            self._prev_gray = gray.copy()
            return None
        prev = self._prev_gray.astype(np.uint8)
        self._prev_gray = gray.copy()

        h, w = gray.shape
        half = self.window // 2
        rad = self.search_radius
        vectors: list[list[float]] = []

        for cy in range(half, h - half, self.grid_step):
            for cx in range(half, w - half, self.grid_step):
                y0, y1 = cy - half, cy + half
                x0, x1 = cx - half, cx + half
                template = prev[y0:y1, x0:x1]
                sy0, sy1 = max(0, y0 - rad), min(h, y1 + rad)
                sx0, sx1 = max(0, x0 - rad), min(w, x1 + rad)
                search = gray[sy0:sy1, sx0:sx1]
                if template.size == 0 or search.shape[0] < template.shape[0] or search.shape[1] < template.shape[1]:
                    continue
                result = cv2.matchTemplate(search, template, cv2.TM_CCOEFF_NORMED)
                _, _, _, max_loc = cv2.minMaxLoc(result)
                dx = float((sx0 + max_loc[0] + half) - cx)
                dy = float((sy0 + max_loc[1] + half) - cy)
                mag = float(np.hypot(dx, dy))
                if mag >= self.min_vector_magnitude:
                    vectors.append([float(cx), float(cy), dx, dy])

        if not vectors:
            return {
                "motion_x": 0.0,
                "motion_y": 0.0,
                "magnitude": 0.0,
                "direction": 0.0,
                "coverage": 0.0,
                "vectors": [],
            }

        arr = np.asarray(vectors)
        u_mean = float(arr[:, 2].mean())
        v_mean = float(arr[:, 3].mean())
        mags = np.hypot(arr[:, 2], arr[:, 3])
        return {
            "motion_x": u_mean,
            "motion_y": v_mean,
            "magnitude": float(mags.mean()),
            "direction": float(np.degrees(np.arctan2(-v_mean, u_mean))),
            "coverage": len(vectors) / max(1, ((h - self.window) // self.grid_step) * ((w - self.window) // self.grid_step)),
            "vectors": vectors,
        }
