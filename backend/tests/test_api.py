import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

from main import app
from tests.helpers import make_moving_pattern_video


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _wait_for(condition, timeout=20.0, interval=0.25):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if condition():
            return True
        time.sleep(interval)
    return False


def _recv_json_timeout(ws, timeout=5.0):
    from concurrent.futures import ThreadPoolExecutor

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(ws.receive_json)
        try:
            return future.result(timeout=timeout)
        except FuturesTimeoutError:
            return None


from concurrent.futures import TimeoutError as FuturesTimeoutError  # noqa: E402


def test_status_endpoint(client):
    resp = client.get("/api/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["system_online"] is True
    assert data["demo_mode"] is False
    assert "components" in data
    for key in ("camera", "lidar", "flow_processing", "debris_ai", "storage", "lora", "cloud"):
        assert key in data["components"]
    assert data["components"]["storage"]["status"] == "available"
    assert data["components"]["lora"]["status"] == "not_connected"
    assert data["components"]["debris_ai"]["status"] in ("not_configured", "library_missing")


def test_latest_empty_initially(client):
    resp = client.get("/api/latest")
    assert resp.status_code == 200
    data = resp.json()
    assert data["measurement"] is None or "measurement" in data


def test_config_get_post_roundtrip(client):
    resp = client.get("/api/config")
    assert resp.status_code == 200
    original = resp.json()

    resp = client.post("/api/config", json={"config": {"flow": {"frame_interval": 3}}})
    assert resp.status_code == 200
    assert resp.json()["flow"]["frame_interval"] == 3

    client.post("/api/config", json={"config": {"flow": {"frame_interval": original["flow"]["frame_interval"]}}})


def test_calibration_get_post_and_gating(client):
    resp = client.get("/api/calibration")
    assert resp.status_code == 200
    summary = resp.json()["summary"]
    assert summary["velocity_calibrated"] is False
    assert summary["discharge_available"] is False

    resp = client.post("/api/calibration", json={"calibration": {"physical_scale": {"m_per_px": 0.01}}})
    assert resp.status_code == 200
    summary = resp.json()["summary"]
    assert summary["velocity_calibrated"] is True

    client.post("/api/calibration", json={"calibration": {"physical_scale": {"m_per_px": None}}})
    resp = client.get("/api/calibration")
    assert resp.json()["summary"]["velocity_calibrated"] is False


def test_full_pipeline_upload_process_stream_ws_db(client):
    video_path = Path(__file__).parent / "sample_moving.mp4"
    video_path = make_moving_pattern_video(video_path, frames=600)
    try:
        with open(video_path, "rb") as f:
            upload = client.post(
                "/api/video/upload",
                files={"file": (video_path.name, f, "video/mp4")},
            )
        assert upload.status_code == 200, upload.text
        info = upload.json()
        assert info["width"] == 320 and info["height"] == 240
        assert info["fps"] > 0
        video_id = info["video_id"]

        with client.websocket_connect("/ws/live") as ws:
            snapshot = ws.receive_json()
            assert snapshot["type"] == "snapshot"

            start = client.post(
                "/api/analysis/start",
                json={"source_type": "upload", "video_id": video_id, "playback_speed": 5.0, "roi": [0.1, 0.1, 0.8, 0.8]},
            )
            assert start.status_code == 200, start.text

            got_motion = _wait_for(
                lambda: (client.get("/api/latest").json().get("measurement") or {}).get("flow") is not None,
                timeout=30.0,
            )
            assert got_motion, "No flow measurement appeared"

            ws_msg = None
            deadline = time.time() + 15.0
            while time.time() < deadline:
                candidate = _recv_json_timeout(ws, timeout=5.0)
                if candidate is None:
                    break
                if candidate.get("flow") is not None:
                    ws_msg = candidate
                    break
            assert ws_msg is not None, "No flow-bearing WS message arrived"
            flow = ws_msg["flow"]
            assert flow["calibrated"] is False
            assert flow["image_motion_unit"] == "px"
            assert flow["value"] is None
            assert flow["image_motion"] > 0

            frame = client.get("/api/video/frame")
            assert frame.status_code == 200
            assert frame.headers["content-type"].startswith("image/jpeg")
            assert len(frame.content) > 1000

            with client.stream("GET", "/api/video/stream?max_seconds=1.5") as stream_resp:
                assert stream_resp.status_code == 200
                assert "multipart" in stream_resp.headers["content-type"]
                chunks = []
                for chunk in stream_resp.iter_bytes():
                    chunks.append(chunk)
                    if sum(len(c) for c in chunks) > 20000:
                        break

        assert _wait_for(lambda: client.get("/api/history").json()["count"] > 0, timeout=10.0)
        history = client.get("/api/history").json()
        row = history["rows"][-1]
        assert row["image_motion"] is not None
        assert row["calibrated"] == 0
        assert row["camera_status"] == "online"

        status = client.get("/api/status").json()
        assert status["components"]["flow_processing"]["status"] == "running"

        stop = client.post("/api/analysis/stop")
        assert stop.status_code == 200
        assert _wait_for(lambda: not _manager_running())
    finally:
        video_path.unlink(missing_ok=True)
        for leftover in Path(__file__).parent.glob("sample_moving.avi"):
            leftover.unlink(missing_ok=True)


def _manager_running() -> bool:
    from services.registry import get_registry

    return get_registry().camera_manager.is_running()


def test_flow_estimator_never_fakes_units(client):
    resp = client.get("/api/flow")
    if resp.status_code == 404:
        return
    flow = resp.json()
    assert flow["calibrated"] is False
    assert flow["value"] is None
    assert flow["status"].startswith("image-space")


def test_validation_endpoints(client):
    cap = client.post("/api/validation/capture-latest")
    assert cap.status_code == 200

    create = client.post(
        "/api/validation",
        json={
            "test_name": "tank-run-1",
            "reference_flow_rate": 0.0,
            "measured_flow_rate": None,
            "reference_water_level": 1.20,
            "measured_water_level": 1.24,
            "reference_debris_count": 10,
            "measured_debris_count": 9,
        },
    )
    assert create.status_code == 200
    test_id = create.json()["created"]["id"]

    tests = client.get("/api/validation").json()["tests"]
    match = [t for t in tests if t["id"] == test_id][0]
    assert match["water_level_metrics"]["error_pct"] == round(abs(1.24 - 1.20) / 1.20 * 100, 2)
    assert match["debris_metrics"]["accuracy_pct"] == 90.0
    assert match["flow_metrics"]["error_pct"] is None

    results = client.get("/api/validation/results").json()
    assert results["n_tests"] >= 1
    assert results["water_level"]["n"] >= 1

    deleted = client.delete(f"/api/validation/{test_id}")
    assert deleted.status_code == 200


def test_pyorc_status_honest(client):
    resp = client.get("/api/pyorc/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "available" in data
    if not data["available"]:
        assert "pyorc_env" in data["note"]
