"""FlowProcessor abstraction.

Any flow estimation backend (OpenCV Farneback optical flow, block-matching PIV,
PyORC/LSPIV adapter) implements this interface so the live pipeline and the
frontend do not depend on a specific method.

All values returned in image space (pixels) unless a calibration is explicitly
attached by the FlowEstimator (see flow_estimator.py).
"""
from typing import Any, Protocol

import cv2
import numpy as np


class FlowProcessor(Protocol):
    def process_frame(self, gray_frame: np.ndarray) -> dict[str, Any] | None:
        """Process one grayscale frame.

        Returns None when no result is available yet (e.g. first frame),
        otherwise a dict:
        {
            "motion_x": float,        # mean displacement x in px (ROI space)
            "motion_y": float,        # mean displacement y in px (ROI space)
            "magnitude": float,       # mean displacement magnitude in px
            "direction": float,       # image-space direction in degrees, 0=right, 90=up
            "coverage": float,        # fraction of ROI grid cells with valid motion
            "vectors": list[list[float]],  # [x, y, u, v] grid vectors (ROI space)
        }
        """
        ...


class FarnebackFlowProcessor:
    """Dense OpenCV Farneback optical flow within a ROI.

    The processor keeps the previously processed grayscale frame internally and
    computes displacement between consecutive process_frame() calls, so callers
    should invoke it every `frame_interval` frames.
    """

    def __init__(self, params: dict[str, Any] | None = None, vector_grid: int = 32,
                 min_vector_magnitude: float = 1.0) -> None:
        p = params or {}
        self.pyramid_scale = float(p.get("pyramid_scale", 0.5))
        self.levels = int(p.get("levels", 3))
        self.winsize = int(p.get("winsize", 15))
        self.iterations = int(p.get("iterations", 3))
        self.poly_n = int(p.get("poly_n", 5))
        self.poly_sigma = float(p.get("poly_sigma", 1.2))
        self.vector_grid = max(8, int(vector_grid))
        self.min_vector_magnitude = float(min_vector_magnitude)
        self._prev_gray: np.ndarray | None = None

    def reset(self) -> None:
        self._prev_gray = None

    def process_frame(self, gray_frame: np.ndarray) -> dict[str, Any] | None:
        gray = gray_frame
        if self._prev_gray is None or gray.shape != self._prev_gray.shape:
            self._prev_gray = gray.copy()
            return None
        flow = cv2.calcOpticalFlowFarneback(
            self._prev_gray,
            gray,
            None,
            self.pyramid_scale,
            self.levels,
            self.winsize,
            self.iterations,
            self.poly_n,
            self.poly_sigma,
            0,
        )
        self._prev_gray = gray.copy()

        fx: np.ndarray = flow[..., 0]
        fy: np.ndarray = flow[..., 1]
        magnitude = np.sqrt(fx**2 + fy**2)
        motion_x = float(np.mean(fx))
        motion_y = float(np.mean(fy))
        mean_magnitude = float(np.mean(magnitude))
        direction = float(np.degrees(np.arctan2(-motion_y, motion_x)))

        vectors: list[list[float]] = []
        step = self.vector_grid
        valid = 0
        total = 0
        for y in range(step // 2, gray.shape[0], step):
            for x in range(step // 2, gray.shape[1], step):
                u = float(fx[y, x])
                v = float(fy[y, x])
                mag = float(magnitude[y, x])
                total += 1
                if mag >= self.min_vector_magnitude:
                    valid += 1
                    vectors.append([float(x), float(y), u, v])

        return {
            "motion_x": motion_x,
            "motion_y": motion_y,
            "magnitude": mean_magnitude,
            "direction": direction,
            "coverage": (valid / total) if total else 0.0,
            "vectors": vectors,
        }
