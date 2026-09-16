"""Calibration store for the monitoring system.

Physical quantities (m/s, m3/s) can only be derived from image-space pixel
measurements after real calibration data exists. This module stores calibration
state and answers whether each conversion is currently allowed.

Nothing here invents calibration values: every field starts as not configured
and must be entered by the researcher from real measurements.
"""
import json
import threading
from typing import Any

from paths import REPO_DATA_CONFIG

CALIBRATION_FILE = None  # set by CalibrationManager constructor


class CalibrationManager:
    def __init__(self, data_dir) -> None:
        self._path = data_dir / "calibration.json"
        self._lock = threading.RLock()
        self._data = self._default()
        self._load()

    @staticmethod
    def _default() -> dict[str, Any]:
        return {
            "camera_calibration": {
                "status": "not_configured",
                "camera_config_file": "data/config/camera_config.json",
                "note": "",
            },
            "gcps": {"configured": False, "count": 0, "points": []},
            "physical_scale": {"configured": False, "m_per_px": None, "note": ""},
            "crs": {"configured": False, "value": None},
            "reference_elevation": {"configured": False, "value_m": None},
            "cross_section": {"configured": False, "area_m2": None, "file": "data/cross_section/cross_section.csv", "points": []},
            "flow_rate": {"configured": False, "velocity_correction_factor": None, "note": ""},
        }

    def _load(self) -> None:
        if self._path.exists():
            try:
                stored = json.loads(self._path.read_text(encoding="utf-8"))
                merged = self._default()
                for key, value in stored.items():
                    if key in merged and isinstance(value, dict):
                        merged[key].update(value)
                    else:
                        merged[key] = value
                self._data = merged
            except (json.JSONDecodeError, OSError):
                pass

    def get(self) -> dict[str, Any]:
        with self._lock:
            data = json.loads(json.dumps(self._data))
        camera_file = REPO_DATA_CONFIG / "camera_config.json"
        data["camera_calibration"]["file_found"] = camera_file.exists()
        return data

    def update(self, partial: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            for key, value in partial.items():
                if key in self._data and isinstance(value, dict) and isinstance(self._data[key], dict):
                    self._data[key].update(value)
                else:
                    self._data[key] = value
            self._recompute_flags()
            self._path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self._path.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(self._data, indent=2), encoding="utf-8")
            tmp.replace(self._path)
        return self.get()

    def _recompute_flags(self) -> None:
        ps = self._data["physical_scale"]
        ps["configured"] = isinstance(ps.get("m_per_px"), (int, float)) and ps["m_per_px"] > 0
        gcps = self._data["gcps"]
        gcps["configured"] = isinstance(gcps.get("count"), int) and gcps["count"] >= 4 and len(gcps.get("points", [])) >= 4
        crs = self._data["crs"]
        crs["configured"] = bool(crs.get("value"))
        ref = self._data["reference_elevation"]
        ref["configured"] = isinstance(ref.get("value_m"), (int, float))
        cs = self._data["cross_section"]
        cs["configured"] = isinstance(cs.get("area_m2"), (int, float)) and cs["area_m2"] > 0
        fr = self._data["flow_rate"]
        fr["configured"] = isinstance(fr.get("velocity_correction_factor"), (int, float)) and fr["velocity_correction_factor"] > 0

    @property
    def m_per_px(self) -> float | None:
        with self._lock:
            ps = self._data["physical_scale"]
            value = ps.get("m_per_px")
        if isinstance(value, (int, float)) and value > 0:
            return float(value)
        return None

    @property
    def velocity_calibrated(self) -> bool:
        return self.m_per_px is not None

    @property
    def discharge_available(self) -> bool:
        with self._lock:
            return bool(
                self.velocity_calibrated
                and self._data["cross_section"].get("configured")
                and self._data["flow_rate"].get("configured")
            )

    def status_summary(self) -> dict[str, Any]:
        data = self.get()
        return {
            "camera_calibration": data["camera_calibration"]["status"] if data["camera_calibration"]["status"] != "not_configured" else ("configured (file found)" if data["camera_calibration"]["file_found"] else "not_configured"),
            "camera_calibration_file_found": data["camera_calibration"]["file_found"],
            "gcps": "configured" if data["gcps"]["configured"] else "not_configured",
            "gcp_count": data["gcps"]["count"],
            "physical_scale": "configured" if data["physical_scale"]["configured"] else "not_configured",
            "m_per_px": self.m_per_px,
            "crs": data["crs"]["value"] if data["crs"]["configured"] else "not_configured",
            "reference_elevation": data["reference_elevation"]["value_m"] if data["reference_elevation"]["configured"] else "not_configured",
            "cross_section": "configured" if data["cross_section"]["configured"] else "not_configured",
            "cross_section_area_m2": data["cross_section"].get("area_m2") if data["cross_section"]["configured"] else None,
            "flow_rate": "calibrated" if data["flow_rate"]["configured"] else "not_calibrated",
            "velocity_calibrated": self.velocity_calibrated,
            "discharge_available": self.discharge_available,
        }
