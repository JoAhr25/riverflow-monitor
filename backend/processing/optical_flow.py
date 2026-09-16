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
        self.max_work_width = int(p.get("max_work_width", 480))
        self._prev_gray: np.ndarray | None = None

    def reset(self) -> None:
        self._prev_gray = None

    def process_frame(self, gray_frame: np.ndarray) -> dict[str, Any] | None:
        # Farneback is the pipeline bottleneck on full-resolution ROIs.
        # Compute on a downscaled copy and scale displacements back to the
        # original ROI pixel space so all reported values keep their units.
        scale = 1.0
        gray = gray_frame
        if 0 < self.max_work_width < gray.shape[1]:
            scale = self.max_work_width / gray.shape[1]
            gray = cv2.resize(
                gray,
                (max(2, int(round(gray.shape[1] * scale))), max(2, int(round(gray.shape[0] * scale)))),
                interpolation=cv2.INTER_AREA,
            )
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

        inv = 1.0 / scale
        fx: np.ndarray = flow[..., 0] * inv
        fy: np.ndarray = flow[..., 1] * inv
        magnitude = np.sqrt(fx**2 + fy**2)
        motion_x = float(np.mean(fx))
        motion_y = float(np.mean(fy))
        mean_magnitude = float(np.mean(magnitude))
        direction = float(np.degrees(np.arctan2(-motion_y, motion_x)))

        vectors: list[list[float]] = []
        # Keep the overlay grid readable and resolution-independent: the
        # configured grid size acts as the MINIMUM spacing (in original
        # pixels) and the grid is capped at ~40 columns / ~24 rows, so a
        # 1920px ROI shows the same arrow density as a 640px one.
        step_orig = max(
            self.vector_grid,
            int(np.ceil(gray_frame.shape[1] / 40)),
            int(np.ceil(gray_frame.shape[0] / 24)),
        )
        step = max(2, int(round(step_orig * scale)))
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
                    vectors.append([float(x * inv), float(y * inv), u, v])

        return {
            "motion_x": motion_x,
            "motion_y": motion_y,
            "magnitude": mean_magnitude,
            "direction": direction,
            "coverage": (valid / total) if total else 0.0,
            "vectors": vectors,
        }
