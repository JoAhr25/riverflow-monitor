import copy
import json
import threading
from typing import Any

from paths import DATA_DIR

CONFIG_FILE = DATA_DIR / "config.json"

DEFAULT_CONFIG: dict[str, Any] = {
    "demo_mode": False,
    "camera": {
        "resolution": [1280, 720],
        "fps": 30,
        "exposure": None,
        "roi": None,
    },
    "flow": {
        "method": "farneback",
        "frame_interval": 5,
        "farneback": {
            "pyramid_scale": 0.5,
            "levels": 3,
            "winsize": 15,
            "iterations": 3,
            "poly_n": 5,
            "poly_sigma": 1.2,
        },
        "piv_block": {
            "window": 32,
            "search_radius": 16,
            "grid_step": 32,
        },
        "vector_grid": 32,
        "min_vector_magnitude": 1.0,
    },
    "debris": {
        "enabled": True,
        "model_path": None,
        "confidence_threshold": 0.5,
        "classes": ["debris"],
    },
    "water_level": {
        "lidar": {
            "enabled": True,
            "port": None,
            "baudrate": 115200,
            "mounting_height_m": None,
            "datum_offset_m": 0.0,
            "mock": False,
        },
        "camera_edge": {"enabled": True},
    },
    "communication": {
        "lora": {
            "enabled": False,
            "port": None,
            "baudrate": 9600,
            "gateway_endpoint": None,
            "mock": False,
        }
    },
    "overlays": {
        "roi": True,
        "flow_vectors": True,
        "debris_boxes": True,
        "water_edge": True,
        "hud": True,
    },
    "storage": {
        "log_interval_s": 1.0,
    },
    "alerts": {
        "enabled": False,
        "level_warning_m": None,
        "level_danger_m": None,
    },
}


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = copy.deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = copy.deepcopy(value)
    return merged


class ConfigService:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._config = copy.deepcopy(DEFAULT_CONFIG)
        self._load()

    def _load(self) -> None:
        if CONFIG_FILE.exists():
            try:
                stored = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
                with self._lock:
                    self._config = _deep_merge(DEFAULT_CONFIG, stored)
            except (json.JSONDecodeError, OSError):
                pass

    def get(self) -> dict[str, Any]:
        with self._lock:
            return copy.deepcopy(self._config)

    def update(self, partial: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._config = _deep_merge(self._config, partial)
            CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
            tmp = CONFIG_FILE.with_suffix(".json.tmp")
            tmp.write_text(json.dumps(self._config, indent=2), encoding="utf-8")
            tmp.replace(CONFIG_FILE)
            return copy.deepcopy(self._config)

    def reset(self) -> dict[str, Any]:
        with self._lock:
            self._config = copy.deepcopy(DEFAULT_CONFIG)
            if CONFIG_FILE.exists():
                CONFIG_FILE.unlink()
            return copy.deepcopy(self._config)
