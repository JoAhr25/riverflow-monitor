"""RiverFlow Monitor backend entry point.

Run:  python webapp/backend/main.py
"""
import argparse
import asyncio
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import paths
from api import routes_config, routes_measurements, routes_validation, routes_video
from communication.lora import LoRaService
from database.database import Database
from processing.calibration import CalibrationManager
from processing.debris_detector import DebrisDetector
from processing.pyorc_adapter import PyORCAdapter
from sensors.tf_luna import TFLunaService
from services.broadcast import WSManager
from services.camera_manager import CameraManager
from services.config_service import ConfigService
from services.registry import get_registry, registry
from services.state import AppState


@asynccontextmanager
async def lifespan(app: FastAPI):
    paths.ensure_dirs()
    state = AppState()
    config = ConfigService()
    db = Database()
    calibration = CalibrationManager(paths.DATA_DIR)
    detector = DebrisDetector(config.get().get("debris", {}))
    ws = WSManager()
    ws.set_loop(asyncio.get_running_loop())

    cfg = config.get()
    demo_mode = bool(cfg.get("demo_mode", False))
    state.update(demo_mode=demo_mode)

    lidar = TFLunaService(cfg.get("water_level", {}).get("lidar", {}), demo_mode=demo_mode)
    lora = LoRaService(cfg.get("communication", {}).get("lora", {}), demo_mode=demo_mode)
    lidar.start()
    lora.restart(cfg.get("communication", {}).get("lora", {}), demo_mode=demo_mode)
    state.update(lidar=dict(lidar.state), lora=dict(lora.state))

    camera_manager = CameraManager(state, db, config, calibration, detector, lora, ws)

    registry.state = state
    registry.db = db
    registry.config = config
    registry.calibration = calibration
    registry.detector = detector
    registry.camera_manager = camera_manager
    registry.ws = ws
    registry.lidar = lidar
    registry.lora = lora
    registry.pyorc = PyORCAdapter()

    yield

    camera_manager.stop()
    lidar.stop()


app = FastAPI(
    title="RiverFlow Monitor API",
    description="Real-Time Non-Contact River Monitoring System - local backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(routes_measurements.router)
app.include_router(routes_video.router)
app.include_router(routes_video.analysis_router)
app.include_router(routes_config.router)
app.include_router(routes_validation.router)

FRONTEND_DIST = Path(
    os.environ.get("RIVERFLOW_FRONTEND_DIST", str(BACKEND_DIR.parent / "frontend" / "dist"))
)

if (FRONTEND_DIST / "index.html").exists():
    if (FRONTEND_DIST / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        if full_path.startswith(("api/", "docs", "openapi", "ws/")):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (FRONTEND_DIST / full_path).resolve()
        try:
            candidate.relative_to(FRONTEND_DIST.resolve())
        except ValueError:
            raise HTTPException(status_code=404, detail="Not found") from None
        if full_path and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(FRONTEND_DIST / "index.html"))
else:

    @app.get("/")
    def root():
        return {
            "name": "RiverFlow Monitor API",
            "docs": "/docs",
            "status": "/api/status",
            "note": "Frontend not built. Run 'npm run build' in frontend/ to serve the dashboard from this port.",
        }


@app.middleware("http")
async def auth_middleware(request, call_next):
    from services import auth
    from fastapi.responses import JSONResponse

    path = request.url.path
    if auth.enabled() and path.startswith(("/api", "/ws")) and path != "/api/auth/login":
        token = request.cookies.get(auth.COOKIE_NAME, "")
        if not auth.verify_token(token):
            return JSONResponse({"detail": "authentication required"}, status_code=401)
    return await call_next(request)


@app.post("/api/auth/login")
async def auth_login(body: dict):
    from services import auth

    if not auth.enabled():
        raise HTTPException(status_code=400, detail="Authentication is disabled on this server.")
    if not auth.check_credentials(str(body.get("username", "")), str(body.get("password", ""))):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    response = JSONResponse({"ok": True, "user": auth.current_user()})
    response.set_cookie(
        auth.COOKIE_NAME,
        auth.issue_token(),
        httponly=True,
        samesite="lax",
        max_age=auth.EXPIRY_S,
    )
    return response


@app.get("/api/auth/check")
def auth_check():
    from services import auth

    if not auth.enabled():
        return {"ok": True, "auth_required": False}
    return {"ok": True, "auth_required": True, "user": auth.current_user()}


@app.post("/api/auth/logout")
def auth_logout():
    from services import auth

    response = JSONResponse({"ok": True})
    response.delete_cookie(auth.COOKIE_NAME)
    return response


@app.websocket("/ws/live")
async def ws_live(ws: WebSocket):
    from services import auth

    if auth.enabled():
        token = ws.cookies.get(auth.COOKIE_NAME, "")
        if not auth.verify_token(token):
            await ws.close(code=1008)
            return
    reg = get_registry()
    await reg.ws.connect(ws)
    try:
        snap = reg.state.get_snapshot()
        await reg.ws.send_to(
            ws,
            {
                "type": "snapshot",
                "timestamp": snap["timestamp"],
                "measurement": snap["latest_measurement"],
                "status": {
                    "demo_mode": snap["demo_mode"],
                    "processing": snap["processing"],
                    "camera": snap["camera"],
                    "lidar": snap["lidar"],
                    "lora": snap["lora"],
                    "debris_detector": snap["debris_detector"],
                },
            },
        )
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        reg.ws.disconnect(ws)


def main() -> None:
    parser = argparse.ArgumentParser(description="RiverFlow Monitor backend")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    import uvicorn

    print(f"RiverFlow Monitor backend starting on http://{args.host}:{args.port}")
    print(f"Data directory: {paths.DATA_DIR}")
    print(f"Uploads directory: {paths.UPLOAD_DIR}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
