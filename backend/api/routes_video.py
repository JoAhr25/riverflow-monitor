import re
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from paths import UPLOAD_DIR
from processing.camera import probe_video_file
from api.routes_measurements import _db_to_payload
from models.schemas import AnalysisStartRequest
from services.registry import get_registry

router = APIRouter(prefix="/api/video", tags=["video"])


def _safe_name(name: str) -> str:
    base = Path(name).name or "video"
    base = re.sub(r"[^A-Za-z0-9._ ()-]", "_", base)
    return base


@router.post("/upload")
async def upload_video(file: UploadFile = File(...)) -> dict[str, Any]:
    reg = get_registry()
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename.")
    safe = _safe_name(file.filename)
    if Path(safe).suffix.lower() not in {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}:
        raise HTTPException(status_code=400, detail=f"Unsupported video type: {Path(safe).suffix}")
    if reg.camera_manager.is_running():
        raise HTTPException(status_code=409, detail="Stop the running analysis before uploading a new video.")

    dest = UPLOAD_DIR / safe
    size = 0
    with open(dest, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
            size += len(chunk)
    if size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        meta = probe_video_file(str(dest))
    except Exception as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Uploaded file is not a readable video: {exc}") from exc

    return {
        "video_id": safe,
        "path": str(dest),
        "size_bytes": size,
        **meta,
        "message": "Upload successful. Start the analysis when ready.",
    }


@router.get("/sources")
def list_sources() -> dict[str, Any]:
    reg = get_registry()
    return {"sources": reg.camera_manager.list_sources()}


@router.get("/frame")
def current_frame() -> StreamingResponse:
    reg = get_registry()
    jpeg = reg.state.get_jpeg()
    if jpeg is None:
        snap = reg.state.get_snapshot()
        src = snap.get("source") or {}
        label = src.get("mode_label") or "No source"
        from services.overlay import placeholder_frame

        jpeg = placeholder_frame("NO SIGNAL", f"Processing inactive - {label}")
    return StreamingResponse(iter([jpeg]), media_type="image/jpeg")


@router.get("/stream")
def video_stream(max_seconds: float | None = None) -> StreamingResponse:
    reg = get_registry()

    def generate():
        boundary = "--frame\r\n"
        idle_sent_until = 0.0
        started = time.time()
        while True:
            if max_seconds is not None and time.time() - started > max_seconds:
                break
            jpeg = reg.state.get_jpeg()
            if jpeg is None:
                if time.time() > idle_sent_until + 2.0:
                    snap = reg.state.get_snapshot()
                    src = snap.get("source") or {}
                    label = src.get("mode_label") or "No source"
                    from services.overlay import placeholder_frame

                    ph = placeholder_frame("NO SIGNAL", f"Processing inactive - {label}")
                    yield (f"{boundary}Content-Type: image/jpeg\r\nContent-Length: {len(ph)}\r\n\r\n").encode() + ph + b"\r\n"
                    idle_sent_until = time.time()
                time.sleep(0.2)
                continue
            yield (f"{boundary}Content-Type: image/jpeg\r\nContent-Length: {len(jpeg)}\r\n\r\n").encode() + jpeg + b"\r\n"
            time.sleep(1.0 / 20.0)

    return StreamingResponse(generate(), media_type="multipart/x-mixed-replace; boundary=frame")


analysis_router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@analysis_router.post("/start")
def start_analysis(request: AnalysisStartRequest) -> dict[str, Any]:
    reg = get_registry()
    try:
        result = reg.camera_manager.start(request.model_dump())
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result


@analysis_router.post("/stop")
def stop_analysis() -> dict[str, Any]:
    reg = get_registry()
    return reg.camera_manager.stop()


@analysis_router.get("/state")
def analysis_state() -> dict[str, Any]:
    reg = get_registry()
    snap = reg.state.get_snapshot()
    return {
        "processing": snap["processing"],
        "source": snap["source"],
        "camera": snap["camera"],
        "latest_measurement": _db_to_payload(snap["latest_measurement"]) if snap["latest_measurement"] else None,
    }
