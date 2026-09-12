"""Shared application state (thread-safe)."""
import threading
import time
from typing import Any

import numpy as np


class AppState:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.started_at = time.time()
        self.latest_measurement: dict[str, Any] | None = None
        self.latest_jpeg: bytes | None = None
        self.source: dict[str, Any] | None = None
        self.processing: dict[str, Any] = {"status": "idle", "message": "No processing running."}
        self.camera: dict[str, Any] = {"status": "offline", "fps": None, "frames": 0, "message": "No camera source active."}
        self.lidar: dict[str, Any] = {"status": "offline", "mock": False, "distance_m": None, "water_level_m": None, "timestamp": None, "message": ""}
        self.lora: dict[str, Any] = {"status": "not_connected", "mock": False, "last_packet": None, "message": ""}
        self.water_edge: dict[str, Any] = {"detected": False, "edge_y": None, "edge_y_normalized": None, "confidence": 0.0}
        self.debris_detector_info: dict[str, Any] = {}
        self.tracker_stats: dict[str, Any] = {"unique_total": 0, "active_tracks": 0}
        self.demo_mode: bool = False

    def set_measurement(self, payload: dict[str, Any], jpeg: bytes | None) -> None:
        with self._lock:
            self.latest_measurement = payload
            if jpeg is not None:
                self.latest_jpeg = jpeg

    def get_jpeg(self) -> bytes | None:
        with self._lock:
            return self.latest_jpeg

    def get_snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "latest_measurement": self.latest_measurement,
                "source": self.source,
                "processing": self.processing,
                "camera": self.camera,
                "lidar": self.lidar,
                "lora": self.lora,
                "water_edge": self.water_edge,
                "debris_detector": self.debris_detector_info,
                "tracker": self.tracker_stats,
                "demo_mode": self.demo_mode,
                "uptime_s": round(time.time() - self.started_at, 1),
            }

    def update(self, **fields: Any) -> None:
        with self._lock:
            for key, value in fields.items():
                if hasattr(self, key):
                    setattr(self, key, value)


_state: AppState | None = None
_state_lock = threading.Lock()


def get_state() -> AppState:
    global _state
    with _state_lock:
        if _state is None:
            _state = AppState()
        return _state


def reset_placeholder_frame(width: int = 960, height: int = 540) -> np.ndarray:
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:] = (16, 20, 26)
    return img
