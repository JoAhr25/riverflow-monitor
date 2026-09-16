"""Application component registry (populated by main.py at startup)."""
from typing import Any

from services.camera_manager import CameraManager
from services.config_service import ConfigService
from services.state import AppState
from services.broadcast import WSManager
from services import auth
from database.database import Database
from processing.calibration import CalibrationManager
from processing.debris_detector import DebrisDetector
from processing.pyorc_adapter import PyORCAdapter
from sensors.tf_luna import TFLunaService
from communication.lora import LoRaService


class Registry:
    state: AppState
    db: Database
    config: ConfigService
    calibration: CalibrationManager
    detector: DebrisDetector
    camera_manager: CameraManager
    ws: WSManager
    lidar: TFLunaService
    lora: LoRaService
    pyorc: PyORCAdapter


registry = Registry()


def get_registry() -> Registry:
    return registry


def system_status() -> dict[str, Any]:
    reg = get_registry()
    snap = reg.state.get_snapshot()
    detector_info = reg.detector.info()
    db_ok = reg.db.is_writable()
    camera_status = snap["camera"].get("status", "offline")
    processing_status = snap["processing"].get("status", "idle")
    lidar_status = snap["lidar"].get("status", "offline")
    lora_state = snap["lora"]

    return {
        "system_online": True,
        "demo_mode": snap["demo_mode"],
        "uptime_s": snap["uptime_s"],
        "timestamp": snap["timestamp"],
        "auth_required": auth.enabled(),
        "components": {
            "camera": {"status": camera_status, "detail": snap["camera"].get("message", "")},
            "lidar": {"status": lidar_status, "detail": snap["lidar"].get("message", ""), "mock": snap["lidar"].get("mock")},
            "flow_processing": {
                "status": "running" if processing_status == "running" else ("error" if processing_status == "error" else "idle"),
                "detail": snap["processing"].get("message", ""),
            },
            "debris_ai": {"status": detector_info.get("status", "not_configured"), "detail": detector_info.get("detail", "")},
            "storage": {
                "status": "available" if db_ok else "error",
                "detail": f"{reg.db.db_path} ({reg.db.count_measurements()} measurements)",
            },
            "lora": {"status": lora_state.get("status", "not_connected"), "detail": lora_state.get("message", ""), "mock": lora_state.get("mock")},
            "cloud": {
                "status": "not_connected",
                "detail": "Cloud gateway ingest not configured; the dashboard currently runs in local mode (Pi -> FastAPI -> browser).",
            },
        },
        "source": snap["source"],
        "processing": snap["processing"],
        "websocket_clients": reg.ws.client_count,
        "pyorc": reg.pyorc.status(),
    }
