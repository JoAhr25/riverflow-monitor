"""FlowEstimator: converts image-space motion into calibrated values.

Scientific rule enforced here:
- Without a physical scale (m/px) the estimator NEVER reports m/s.
- Discharge (m3/s) requires calibrated velocity, cross-section area and a
  justified velocity correction factor.
"""
from typing import Any

from processing.calibration import CalibrationManager
from processing.optical_flow import FarnebackFlowProcessor
from processing.lspiv import BlockPIVProcessor


class FlowEstimator:
    def __init__(self, calibration: CalibrationManager, method: str = "farneback",
                 flow_config: dict[str, Any] | None = None) -> None:
        self.calibration = calibration
        cfg = flow_config or {}
        grid = int(cfg.get("vector_grid", 32))
        min_mag = float(cfg.get("min_vector_magnitude", 1.0))
        if method == "piv_block":
            self.processor: Any = BlockPIVProcessor(cfg.get("piv_block", {}), grid, min_mag)
            self.method = "piv_block"
        else:
            self.processor = FarnebackFlowProcessor(cfg.get("farneback", {}), grid, min_mag)
            self.method = "farneback"
        self.frame_interval = max(1, int(cfg.get("frame_interval", 5)))

    def reset(self) -> None:
        self.processor.reset()

    def process_frame(self, gray_frame) -> dict[str, Any] | None:
        raw = self.processor.process_frame(gray_frame)
        if raw is None:
            return None
        return self.wrap(raw)

    def wrap(self, raw: dict[str, Any], source_fps: float | None = None) -> dict[str, Any]:
        magnitude_px = raw["magnitude"]
        m_per_px = self.calibration.m_per_px
        calibrated = m_per_px is not None and source_fps is not None and source_fps > 0

        result: dict[str, Any] = {
            "value": None,
            "unit": None,
            "calibrated": False,
            "image_motion": round(float(magnitude_px), 4),
            "image_motion_unit": "px",
            "motion_x": round(float(raw["motion_x"]), 4),
            "motion_y": round(float(raw["motion_y"]), 4),
            "direction_deg": round(float(raw["direction"]), 2),
            "coverage": round(float(raw.get("coverage", 0.0)), 4),
            "vectors": raw.get("vectors", []),
            "method": self.method,
            "frame_interval": self.frame_interval,
            "source_fps": source_fps,
            "status": "image-space measurement (uncalibrated)",
        }
        if calibrated:
            px_per_s = magnitude_px * source_fps / self.frame_interval
            result["value"] = round(px_per_s * m_per_px, 4)
            result["unit"] = "m/s"
            result["calibrated"] = True
            result["status"] = "calibrated (uniform scale approximation; perspective not corrected)"
        return result

    def discharge(self, velocity_m_s: float) -> dict[str, Any]:
        cal = self.calibration.get()
        area = cal["cross_section"].get("area_m2") if cal["cross_section"].get("configured") else None
        factor = cal["flow_rate"].get("velocity_correction_factor") if cal["flow_rate"].get("configured") else None
        if velocity_m_s is None or not area or not factor:
            return {"available": False, "reason": "discharge requires calibrated velocity, cross-section area and velocity correction factor"}
        return {"available": True, "flow_rate_m3s": round(velocity_m_s * area * factor, 5)}
