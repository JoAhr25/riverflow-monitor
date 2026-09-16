from typing import Any

from fastapi import APIRouter, HTTPException

from services.registry import get_registry, system_status

router = APIRouter(prefix="/api", tags=["status"])


@router.get("/status")
def get_status() -> dict[str, Any]:
    return system_status()


@router.get("/latest")
def get_latest() -> dict[str, Any]:
    reg = get_registry()
    snap = reg.state.get_snapshot()
    latest = snap["latest_measurement"]
    if latest is None:
        db_latest = reg.db.latest_measurement()
        if db_latest is not None:
            return {"source": "database", "measurement": _db_to_payload(db_latest), "live": False}
        return {
            "source": "none",
            "measurement": None,
            "live": False,
            "message": "No measurements yet. Upload a video or connect a camera and start processing.",
        }
    return {"source": "live", "measurement": latest, "live": True}


def _db_to_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "timestamp": row.get("timestamp"),
        "water_level": {"value": row.get("water_level"), "unit": "m"} if row.get("water_level") is not None else None,
        "flow": {
            "value": row.get("surface_velocity"),
            "unit": row.get("velocity_unit"),
            "calibrated": bool(row.get("calibrated")),
            "image_motion": row.get("image_motion"),
            "image_motion_unit": "px",
            "motion_x": row.get("motion_x"),
            "motion_y": row.get("motion_y"),
            "direction_deg": row.get("direction_deg"),
        },
        "debris": {"count": row.get("debris_count")},
        "camera": {"fps": row.get("camera_fps")},
    }


@router.get("/water-level")
def get_water_level() -> dict[str, Any]:
    reg = get_registry()
    lidar = dict(reg.state.lidar)
    edge = dict(reg.state.water_edge)
    calibration = reg.calibration.get()

    primary = {
        "sensor": "tf_luna_lidar",
        "status": lidar.get("status", "offline"),
        "mock": bool(lidar.get("mock")),
        "distance_m": lidar.get("distance_m"),
        "water_level_m": lidar.get("water_level_m"),
        "unit": "m",
        "timestamp": lidar.get("timestamp"),
        "mounting_height_configured": isinstance(
            reg.config.get().get("water_level", {}).get("lidar", {}).get("mounting_height_m"), (int, float)
        ),
        "message": lidar.get("message", ""),
    }

    camera_cue = {
        "sensor": "camera_water_edge",
        "role": "supplementary visual cue (LiDAR is the primary measurement)",
        "detected": bool(edge.get("detected")),
        "edge_y_normalized": edge.get("edge_y_normalized"),
        "confidence": edge.get("confidence", 0.0),
        "water_level_m": None,
        "message": (
            "Camera water-edge level estimate requires calibration that maps the edge position to elevation."
            if edge.get("detected")
            else "No water edge currently detected."
        ),
    }

    lidar_ok = lidar.get("status") in ("online", "mock")
    camera_ok = bool(edge.get("detected"))
    if lidar_ok and camera_ok:
        fusion = {"status": "valid" if not lidar.get("mock") else "mock", "detail": "LiDAR reading valid; camera edge detected as independent visual cue."}
    elif lidar_ok:
        fusion = {"status": "limited", "detail": "LiDAR reading valid; camera water edge not detected."}
    elif camera_ok:
        fusion = {"status": "limited", "detail": "Only the camera cue is available (LiDAR offline) - water level in meters unavailable."}
    else:
        fusion = {"status": "offline", "detail": "No water-level source available."}

    return {
        "primary": primary,
        "camera_cue": camera_cue,
        "fusion": fusion,
        "reference_elevation": calibration["reference_elevation"],
    }


@router.get("/flow")
def get_flow() -> dict[str, Any]:
    reg = get_registry()
    snap = reg.state.get_snapshot()
    latest = snap["latest_measurement"]
    flow = (latest or {}).get("flow")
    if flow is None:
        raise HTTPException(status_code=404, detail="No flow measurement available yet. Start processing first.")
    return {
        **flow,
        "calibration": reg.calibration.status_summary(),
        "method_info": {
            "frame_interval": flow.get("frame_interval"),
            "source_fps": flow.get("source_fps"),
        },
    }


@router.get("/debris")
def get_debris() -> dict[str, Any]:
    reg = get_registry()
    snap = reg.state.get_snapshot()
    latest = snap["latest_measurement"]
    debris = (latest or {}).get("debris") or {"count": 0, "tracked_total": 0, "detections": []}
    return {"detector": reg.detector.info(), **debris, "tracker": snap["tracker"]}


@router.get("/history")
def get_history(hours: float = 24.0, limit: int = 2000) -> dict[str, Any]:
    reg = get_registry()
    from datetime import datetime, timedelta

    try:
        since = (datetime.now() - timedelta(hours=min(max(hours, 0.01), 24 * 30))).isoformat(timespec="seconds")
    except ValueError:
        since = None
    rows = reg.db.get_history(since_iso=since, limit=min(max(limit, 1), 10000))
    return {"count": len(rows), "rows": rows}
