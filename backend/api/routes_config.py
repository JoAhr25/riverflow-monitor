from typing import Any

from fastapi import APIRouter

from models.schemas import CalibrationUpdateRequest, ConfigUpdateRequest
from services.registry import get_registry

router = APIRouter(prefix="/api", tags=["configuration"])


@router.get("/config")
def get_config() -> dict[str, Any]:
    reg = get_registry()
    return reg.config.get()


@router.post("/config")
def update_config(request: ConfigUpdateRequest) -> dict[str, Any]:
    reg = get_registry()
    updated = reg.config.update(request.config)
    cfg = updated

    reg.detector.configure(cfg.get("debris", {}))
    lidar_cfg = cfg.get("water_level", {}).get("lidar", {})
    reg.lidar.restart(lidar_cfg, demo_mode=cfg.get("demo_mode", False))
    reg.lora.restart(cfg.get("communication", {}).get("lora", {}), demo_mode=cfg.get("demo_mode", False))
    reg.state.update(
        demo_mode=bool(cfg.get("demo_mode", False)),
        lidar=dict(reg.lidar.state),
        lora=dict(reg.lora.state),
    )
    return updated


@router.get("/calibration")
def get_calibration() -> dict[str, Any]:
    reg = get_registry()
    return {"calibration": reg.calibration.get(), "summary": reg.calibration.status_summary()}


@router.post("/calibration")
def update_calibration(request: CalibrationUpdateRequest) -> dict[str, Any]:
    reg = get_registry()
    reg.calibration.update(request.calibration)
    return {"calibration": reg.calibration.get(), "summary": reg.calibration.status_summary()}


@router.get("/pyorc/status")
def pyorc_status() -> dict[str, Any]:
    reg = get_registry()
    status = reg.pyorc.status()
    status["camera_config_found"] = reg.pyorc.camera_config_found()
    status["usage"] = (
        "PyORC is the LSPIV testing/calibration/validation reference tool, used in the pyorc_env "
        "environment (pyorc 0.5.3 verified in this repository), not the live monitoring engine."
    )
    return status
