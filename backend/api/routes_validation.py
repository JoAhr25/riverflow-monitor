from typing import Any

from fastapi import APIRouter, HTTPException

from models.schemas import ValidationTestRequest
from services.registry import get_registry

router = APIRouter(prefix="/api/validation", tags=["validation"])


def _accuracy_metrics(ref: float | None, meas: float | None) -> dict[str, Any]:
    if ref is None or meas is None or ref == 0:
        return {"error_pct": None, "accuracy_pct": None}
    error_pct = abs(meas - ref) / abs(ref) * 100.0
    return {"error_pct": round(error_pct, 2), "accuracy_pct": round(max(0.0, 100.0 - error_pct), 2)}


@router.get("")
def list_tests() -> dict[str, Any]:
    reg = get_registry()
    tests = reg.db.list_validation_tests()
    enriched = []
    for t in tests:
        e = {**t}
        e["flow_metrics"] = _accuracy_metrics(t.get("reference_flow_rate"), t.get("measured_flow_rate"))
        e["water_level_metrics"] = _accuracy_metrics(t.get("reference_water_level"), t.get("measured_water_level"))
        e["debris_metrics"] = _accuracy_metrics(t.get("reference_debris_count"), t.get("measured_debris_count"))
        enriched.append(e)
    return {"count": len(enriched), "tests": enriched}


@router.post("")
def create_test(request: ValidationTestRequest) -> dict[str, Any]:
    reg = get_registry()
    from datetime import datetime

    row = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "test_name": request.test_name,
        "reference_flow_rate": request.reference_flow_rate,
        "measured_flow_rate": request.measured_flow_rate,
        "reference_water_level": request.reference_water_level,
        "measured_water_level": request.measured_water_level,
        "reference_debris_count": request.reference_debris_count,
        "measured_debris_count": request.measured_debris_count,
        "notes": request.notes,
    }
    created = reg.db.insert_validation_test(row)
    return {"created": created}


@router.post("/capture-latest")
def capture_latest() -> dict[str, Any]:
    reg = get_registry()
    snap = reg.state.get_snapshot()
    latest = snap["latest_measurement"]
    if latest is None:
        db_latest = reg.db.latest_measurement()
        if db_latest is None:
            raise HTTPException(status_code=404, detail="No measurement available to capture. Run an analysis first.")
        latest = _db_to_payload(db_latest)
    flow = latest.get("flow") or {}
    water = latest.get("water_level") or {}
    debris = latest.get("debris") or {}
    return {
        "timestamp": latest.get("timestamp"),
        "measured_flow_rate": None,
        "measured_surface_velocity_m_s": flow.get("value") if flow.get("calibrated") else None,
        "measured_image_motion_px": flow.get("image_motion"),
        "measured_water_level_m": water.get("value"),
        "measured_debris_count": debris.get("count"),
        "calibrated": flow.get("calibrated"),
        "note": (
            "Captured from the latest live measurement. Surface velocity in m/s is only present when "
            "calibration is configured; flow rate (m3/s) requires calibrated velocity and cross-section."
        ),
    }


def _db_to_payload(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "timestamp": row.get("timestamp"),
        "flow": {
            "value": row.get("surface_velocity"),
            "calibrated": bool(row.get("calibrated")),
            "image_motion": row.get("image_motion"),
        },
        "water_level": {"value": row.get("water_level")} if row.get("water_level") is not None else None,
        "debris": {"count": row.get("debris_count")},
    }


@router.get("/results")
def results_summary() -> dict[str, Any]:
    reg = get_registry()
    tests = reg.db.list_validation_tests()

    def collect(ref_key: str, meas_key: str) -> list[tuple[float, float]]:
        pairs = []
        for t in tests:
            ref, meas = t.get(ref_key), t.get(meas_key)
            if ref is not None and meas is not None:
                pairs.append((float(ref), float(meas)))
        return pairs

    def summary(pairs: list[tuple[float, float]]) -> dict[str, Any]:
        if not pairs:
            return {"n": 0, "mean_error_pct": None, "mean_accuracy_pct": None, "max_error_pct": None}
        errors = [abs(m - r) / abs(r) * 100.0 for r, m in pairs if r != 0]
        if not errors:
            return {"n": len(pairs), "mean_error_pct": None, "mean_accuracy_pct": None, "max_error_pct": None}
        return {
            "n": len(pairs),
            "mean_error_pct": round(sum(errors) / len(errors), 2),
            "mean_accuracy_pct": round(100.0 - sum(errors) / len(errors), 2),
            "max_error_pct": round(max(errors), 2),
        }

    return {
        "n_tests": len(tests),
        "water_level": summary(collect("reference_water_level", "measured_water_level")),
        "flow_rate": summary(collect("reference_flow_rate", "measured_flow_rate")),
        "debris_count": summary(collect("reference_debris_count", "measured_debris_count")),
        "reliability": {
            "measurements_stored": reg.db.count_measurements(),
            "note": "System reliability statistics accumulate as more validation tests and long-duration runs are stored.",
        },
    }


@router.delete("/{test_id}")
def delete_test(test_id: int) -> dict[str, Any]:
    reg = get_registry()
    deleted = reg.db.delete_validation_test(test_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Test {test_id} not found.")
    return {"deleted": test_id}
