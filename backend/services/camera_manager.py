"""Camera processing manager.

Runs the live pipeline on a worker thread for any camera source:
read frame -> ROI -> optical flow / PIV -> water-edge detection -> debris
detection -> tracking -> overlays -> MJPEG frame + measurement payload ->
SQLite logging -> WebSocket broadcast.
"""
import threading
import time
from collections import deque
from datetime import datetime
from typing import Any

import cv2
import numpy as np

from database.database import Database
from paths import REPO_DATA_RAW, UPLOAD_DIR
from processing.calibration import CalibrationManager
from processing.debris_detector import DebrisDetector
from processing.flow_estimator import FlowEstimator
from processing.tracking import CentroidTracker
from processing.water_edge import WaterEdgeDetector
from services.broadcast import WSManager
from services.config_service import ConfigService
from services.overlay import draw_overlays, encode_jpeg
from services.state import AppState
from communication.lora import LoRaService

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}


class CameraManager:
    def __init__(self, state: AppState, db: Database, config: ConfigService,
                 calibration: CalibrationManager, detector: DebrisDetector,
                 lora: LoRaService, ws: WSManager) -> None:
        self.state = state
        self.db = db
        self.config = config
        self.calibration = calibration
        self.detector = detector
        self.lora = lora
        self.ws = ws
        self._thread: threading.Thread | None = None
        self._stop_evt = threading.Event()

    # ---------- source registry ----------

    def list_sources(self) -> list[dict[str, Any]]:
        sources: list[dict[str, Any]] = []
        if UPLOAD_DIR.exists():
            for f in sorted(UPLOAD_DIR.iterdir()):
                if f.suffix.lower() in VIDEO_EXTENSIONS:
                    sources.append({"video_id": f.name, "origin": "upload", "path": str(f), "size_bytes": f.stat().st_size})
        if REPO_DATA_RAW.exists():
            for f in sorted(REPO_DATA_RAW.iterdir()):
                if f.suffix.lower() in VIDEO_EXTENSIONS:
                    sources.append({"video_id": f.name, "origin": "data/raw", "path": str(f), "size_bytes": f.stat().st_size})
        return sources

    # ---------- control ----------

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def stop(self) -> dict[str, Any]:
        self._stop_evt.set()
        if self._thread is not None:
            self._thread.join(timeout=5.0)
            self._thread = None
        self.state.update(
            processing={"status": "idle", "message": "Processing stopped by user."},
            camera={"status": "idle", "fps": None, "frames": 0, "message": "No camera source active."},
        )
        return {"status": "idle"}

    def start(self, request: dict[str, Any]) -> dict[str, Any]:
        if self.is_running():
            self.stop()

        source_type = request.get("source_type", "upload")
        cfg = self.config.get()

        if request.get("roi") is not None:
            cfg["camera"]["roi"] = request["roi"]
            self.config.update({"camera": {"roi": request["roi"]}})
        if request.get("frame_interval") is not None:
            cfg["flow"]["frame_interval"] = int(request["frame_interval"])
            self.config.update({"flow": {"frame_interval": int(request["frame_interval"])}})

        source = self._build_source(source_type, request, cfg)
        if source is None:
            msg = "Unknown or incomplete source specification."
            self.state.update(processing={"status": "error", "message": msg})
            raise ValueError(msg)

        estimator = FlowEstimator(self.calibration, method=cfg["flow"].get("method", "farneback"), flow_config=cfg["flow"])
        edge_detector = WaterEdgeDetector({"enabled": bool(cfg.get("water_level", {}).get("camera_edge", {}).get("enabled", True))})
        tracker = CentroidTracker()

        self._stop_evt.clear()
        self._thread = threading.Thread(
            target=self._run,
            args=(source, estimator, edge_detector, tracker, cfg, request),
            name="camera-processing",
            daemon=True,
        )
        self._thread.start()
        return {
            "status": "starting",
            "source_type": source_type,
            "label": source.label,
        }

    def _build_source(self, source_type: str, request: dict[str, Any], cfg: dict[str, Any]):
        if source_type == "upload":
            from processing.camera import VideoFileSource

            speed = float(request.get("playback_speed", 1.0))
            loop = bool(request.get("loop", False))
            if request.get("video_id"):
                path = UPLOAD_DIR / str(request["video_id"])
                if not path.exists():
                    raise FileNotFoundError(f"Uploaded video not found: {request['video_id']}")
                src = VideoFileSource(str(path), playback_speed=speed)
                src._loop = loop
                return src
            if request.get("repo_path"):
                candidate = (REPO_DATA_RAW / str(request["repo_path"])).resolve()
                try:
                    candidate.relative_to(REPO_DATA_RAW.resolve())
                except ValueError as exc:
                    raise ValueError("repo_path must stay inside data/raw") from exc
                if not candidate.exists():
                    raise FileNotFoundError(f"Video not found in data/raw: {request['repo_path']}")
                src = VideoFileSource(str(candidate), playback_speed=speed)
                src._loop = loop
                return src
            raise ValueError("upload source requires video_id or repo_path")
        if source_type == "camera":
            from processing.camera import LiveCameraSource

            cam_cfg = cfg.get("camera", {})
            return LiveCameraSource(
                device_index=int(request.get("device_index", 0)),
                width=cam_cfg.get("resolution", [None, None])[0],
                height=cam_cfg.get("resolution", [None, None])[1],
                fps=cam_cfg.get("fps"),
            )
        if source_type == "stream":
            from processing.camera import RemoteStreamSource

            url = request.get("stream_url")
            if not url:
                raise ValueError("stream source requires stream_url")
            return RemoteStreamSource(url)
        return None

    # ---------- worker ----------

    def _run(self, source, estimator, edge_detector, tracker, cfg, request) -> None:
        if not source.open():
            self.state.update(
                processing={"status": "error", "message": f"Could not open source: {source.label}"},
            )
            return

        meta = source.meta()
        overlays_cfg = cfg.get("overlays", {})
        log_interval = float(cfg.get("storage", {}).get("log_interval_s", 1.0))
        frame_interval = max(1, int(cfg["flow"].get("frame_interval", 5)))
        source_fps = meta.fps if meta.fps and meta.fps > 1 else None
        # High-res inputs (4K+) are downscaled before processing: JPEG encode
        # and full-frame operations at 4K exceed the real-time budget on most
        # hardware. Measurements are unaffected (optical flow already runs on
        # a <=480px copy). Tunable via camera.process_max_width.
        process_max_width = max(640, int(cfg.get("camera", {}).get("process_max_width", 1920)))

        self.state.update(
            processing={"status": "running", "message": f"Processing {source.label}"},
            source={
                "type": source.source_type,
                "label": source.label,
                "mode_label": {
                    "upload": "Development Video",
                    "camera": "Live Raspberry Pi Camera",
                    "stream": "Remote Stream",
                }.get(source.source_type, source.source_type),
                "width": meta.width,
                "height": meta.height,
                "fps": meta.fps,
                "frame_count": meta.frame_count,
                "duration_s": meta.duration_s,
            },
            camera={"status": "online", "fps": None, "frames": 0, "message": f"Reading from {source.label}"},
        )

        frame_idx = 0
        db_written = 0
        last_db = 0.0
        frame_times: deque[float] = deque(maxlen=45)
        last_flow_result: dict[str, Any] | None = None
        last_edge: dict[str, Any] = {"detected": False, "edge_y": None, "edge_y_normalized": None, "confidence": 0.0}
        last_detections: list[dict[str, Any]] = []

        while not self._stop_evt.is_set():
            ok, frame = source.read()
            if not ok or frame is None:
                if getattr(source, "_loop", False) and source.rewind():
                    continue
                if frame_idx == 0:
                    end_msg = (
                        f"No decodable frames in {source.label} - the codec may be unsupported "
                        "(e.g. HEVC/H.265). Re-encode to H.264 MP4 and try again."
                    )
                else:
                    end_msg = f"Source ended: {source.label}"
                self.state.update(
                    processing={"status": "idle", "message": end_msg},
                    camera={"status": "idle", "fps": None, "frames": frame_idx, "message": end_msg},
                )
                break

            frame_idx += 1
            now = time.time()
            frame_times.append(now)
            if frame.shape[1] > process_max_width:
                scale = process_max_width / frame.shape[1]
                frame = cv2.resize(
                    frame,
                    (process_max_width, max(2, int(round(frame.shape[0] * scale)))),
                    interpolation=cv2.INTER_AREA,
                )
            # Hot-reload overlay flags so the UI toggles apply mid-run
            # without restarting processing (refreshed ~5x per second).
            if frame_idx % 5 == 1:
                overlays_cfg = self.config.get().get("overlays", overlays_cfg)
            h, w = frame.shape[:2]
            roi = self._resolve_roi(cfg.get("camera", {}).get("roi"), w, h)
            roi_configured = roi is not None

            if roi is not None:
                rx, ry, rw, rh = roi
                gray_roi = cv2.cvtColor(frame[ry : ry + rh, rx : rx + rw], cv2.COLOR_BGR2GRAY)
            else:
                gray_roi = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                roi = (0, 0, w, h)

            if frame_idx % frame_interval == 0:
                flow_result = estimator.process_frame(gray_roi)
                if flow_result is not None:
                    last_flow_result = flow_result
                if cfg.get("water_level", {}).get("camera_edge", {}).get("enabled", True):
                    last_edge = edge_detector.detect(gray_roi)
                    last_edge["roi_relative"] = True

            detector_info = self.detector.info()
            self.state.update(debris_detector_info=detector_info)
            if frame_idx % frame_interval == 0 and detector_info.get("status") == "ready":
                detections = self.detector.detect(frame)
                last_detections = tracker.update(detections)
            elif detector_info.get("status") != "ready":
                last_detections = []

            vectors = (last_flow_result or {}).get("vectors", [])
            hud = [
                f"SRC: {self.state.source['mode_label'] if self.state.source else source.label}",
                f"FRAME: {frame_idx}" + (f"/{meta.frame_count}" if meta.frame_count else ""),
                f"FPS: {self._measured_fps(frame_times):.1f}" + (f" (video {meta.fps:.1f})" if meta.fps else ""),
                f"TIME: {datetime.now().strftime('%H:%M:%S')}",
            ]
            if last_flow_result is not None:
                hud.append(f"MOTION: {last_flow_result['image_motion']:.2f} px/s")
                hud.append(f"DIRECTION: {last_flow_result['direction_deg']:.0f} deg")
            hud.append(f"DEBRIS: {len(last_detections)}" + (f" ({tracker.unique_total} tracked)" if tracker.unique_total else ""))

            warn = None
            if last_flow_result is not None and not last_flow_result.get("calibrated"):
                warn = "UNCALIBRATED - px, not m/s"
            detector_active = detector_info.get("status") == "ready"
            if not detector_active:
                hud.append("DEBRIS AI: not configured")

            annotated = draw_overlays(
                frame,
                roi if roi_configured else None,
                vectors,
                last_detections,
                last_edge,
                hud,
                overlays_cfg,
                warn_line=warn,
            )
            jpeg = encode_jpeg(annotated)

            payload = self._build_payload(
                source=source, meta=meta, frame_idx=frame_idx, proc_fps=self._measured_fps(frame_times),
                flow=last_flow_result, edge=last_edge, detections=last_detections, tracker=tracker,
            )
            self.state.set_measurement(payload, jpeg)
            self.ws.publish(payload)

            if now - last_db >= log_interval:
                self._log_measurement(payload)
                last_db = now
                db_written += 1

            if source.paced and source_fps:
                source.pace(source_fps)

        source.release()
        self.state.update(tracker_stats=tracker.stats())

    def _build_payload(self, source, meta, frame_idx, proc_fps, flow, edge, detections, tracker) -> dict[str, Any]:
        lidar = dict(self.state.lidar)
        water_level = None
        if lidar.get("status") in ("online", "mock"):
            water_level = {
                "value": lidar.get("water_level_m"),
                "unit": "m",
                "status": lidar.get("status"),
                "mock": bool(lidar.get("mock")),
                "distance_m": lidar.get("distance_m"),
                "source": "tf_luna" if not lidar.get("mock") else "mock",
            }
        flow_part = None
        if flow is not None:
            flow_part = {k: v for k, v in flow.items() if k != "vectors"}
        src = self.state.source or {}
        return {
            "timestamp": datetime.now().isoformat(timespec="seconds"),
            "water_level": water_level,
            "flow": flow_part,
            "debris": {
                "count": len(detections),
                "tracked_total": tracker.unique_total,
                "active_tracks": tracker.active_count,
                "detections": detections,
            },
            "water_edge": edge,
            "camera": {
                "fps": round(proc_fps, 1) if proc_fps else None,
                "source_fps": meta.fps,
                "frames": frame_idx,
                "source_type": source.source_type,
                "source_label": src.get("label", source.label),
                "mode_label": src.get("mode_label", source.label),
                "status": "online",
            },
            "lidar_status": lidar.get("status"),
            "lora": {"status": self.state.lora.get("status"), "mock": self.state.lora.get("mock")},
            "demo_mode": self.state.demo_mode,
        }

    def _log_measurement(self, payload: dict[str, Any]) -> None:
        flow = payload.get("flow") or {}
        water = payload.get("water_level") or {}
        row = {
            "timestamp": payload.get("timestamp"),
            "water_level": water.get("value"),
            "lidar_distance": water.get("distance_m"),
            "camera_water_edge": (payload.get("water_edge") or {}).get("edge_y_normalized"),
            "flow_rate": None,
            "surface_velocity": flow.get("value") if flow.get("calibrated") else None,
            "velocity_unit": flow.get("unit"),
            "calibrated": 1 if flow.get("calibrated") else 0,
            "image_motion": flow.get("image_motion"),
            "motion_x": flow.get("motion_x"),
            "motion_y": flow.get("motion_y"),
            "direction_deg": flow.get("direction_deg"),
            "debris_count": (payload.get("debris") or {}).get("count", 0),
            "camera_status": (payload.get("camera") or {}).get("status"),
            "lidar_status": payload.get("lidar_status"),
            "lora_status": (payload.get("lora") or {}).get("status"),
            "source": (payload.get("camera") or {}).get("mode_label"),
            "camera_fps": (payload.get("camera") or {}).get("fps"),
        }
        try:
            self.db.insert_measurement(row)
        except Exception:
            pass
        lora_cfg_enabled = self.state.lora.get("status") in ("connected", "mock")
        if lora_cfg_enabled:
            try:
                self.lora.send(payload)
            except Exception:
                pass

    @staticmethod
    def _resolve_roi(roi_norm: Any, w: int, h: int) -> tuple[int, int, int, int] | None:
        if not roi_norm or not isinstance(roi_norm, (list, tuple)) or len(roi_norm) != 4:
            return None
        x, y, rw, rh = [float(v) for v in roi_norm]
        if not (0 <= x < 1 and 0 <= y < 1 and 0 < rw <= 1 and 0 < rh <= 1):
            return None
        px = int(x * w)
        py = int(y * h)
        pw = max(16, int(rw * w))
        ph = max(16, int(rh * h))
        pw = min(pw, w - px)
        ph = min(ph, h - py)
        return (px, py, pw, ph)

    @staticmethod
    def _measured_fps(frame_times: deque[float]) -> float:
        if len(frame_times) < 2:
            return 0.0
        span = frame_times[-1] - frame_times[0]
        if span <= 0:
            return 0.0
        return (len(frame_times) - 1) / span
