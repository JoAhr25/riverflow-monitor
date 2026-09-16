# RiverFlow Monitor — Web Application

![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/frontend-React_19-149ECA?logo=react&logoColor=white)
![OpenCV](https://img.shields.io/badge/processing-OpenCV-5C3EE8?logo=opencv&logoColor=white)
![Docker](https://img.shields.io/badge/deploy-Docker-2496ED?logo=docker&logoColor=white)

**Real-Time Non-Contact River Monitoring System**

Visualization and monitoring interface for the river monitoring research project.
The final system is a live camera-based monitoring platform; PyORC is used
separately as a testing/calibration/validation tool for the LSPIV component
(see *PyORC role* below).

```
River
  ↓
Raspberry Pi NoIR Camera Module 3
  ↓
Raspberry Pi 3 — Live Camera Processing
  ├── Water Edge Detection (supplementary cue)
  ├── Surface Motion / LSPIV Flow Processing
  └── AI Debris Detection
  ↓
Measurements (water level · flow · debris)
  ├── Local timestamped logging (SQLite)
  └── LoRa → Gateway → Cloud/Web Dashboard
```

TF-Luna ToF LiDAR is the **primary** water-level sensor. The camera water-edge
detector is an independent visual cue only.

---

## Scientific integrity rules enforced by this system

- Image-space motion (px) is **never** silently displayed as m/s. Without a
  configured physical scale the dashboard shows pixels and a clear
  "uncalibrated" status.
- Discharge (m³/s) is never computed without calibrated velocity,
  cross-section area **and** a justified velocity correction factor.
- Debris detection returns **no detections** until a real model is configured.
- Sensors report honest states (`offline`, `not_connected`) — nothing is
  simulated unless DEMO MODE is explicitly enabled, and mock values are always
  flagged.
- Calibration fields start as "not configured" and must be filled from real
  field measurements.

---

## Architecture

```
riverflow-monitor/
├── Dockerfile                    single-container deployment (frontend+backend)
├── frontend/                     React + Vite + TypeScript + Tailwind + Recharts
│   └── src/
│       ├── components/           Layout, cards, charts, camera feed, compass…
│       ├── pages/                Dashboard, Live Camera, Flow Analysis, Water
│       │                         Level, Debris, Historical Data, Testing &
│       │                         Validation, Calibration, System Status, Settings
│       ├── services/             REST client + WebSocket live-feed context
│       └── types/                shared API payload types
└── backend/                      Python + FastAPI + OpenCV
    ├── main.py                   app entry point (uvicorn), WebSocket /ws/live
    ├── paths.py                  data/upload directory resolution
    ├── api/                      REST routers (measurements, video/analysis,
    │                             config, calibration, validation)
    ├── services/                 camera manager (processing loop), overlay
    │                             renderer, broadcast, config, shared state
    ├── processing/               optical_flow.py (Farneback), lspiv.py (block
    │                             PIV), flow_estimator.py (calibration
    │                             gating), calibration.py, water_edge.py,
    │                             debris_detector.py, tracking.py,
    │                             pyorc_adapter.py (optional), camera.py
    ├── sensors/tf_luna.py        TF-Luna serial service (mock under demo mode)
    ├── communication/lora.py     LoRa service (modular, honest status)
    ├── database/database.py      SQLite storage (measurements + validation tests)
    ├── models/                   request schemas
    └── tests/                    pytest suite + live smoke test
```

This repository contains only the web application. The research workflow
(notebooks, PyORC analysis, docs) lives in the separate `river-video-pyorc`
repository. Videos placed in `data/raw/` at this repository's root are
listed as available development-video sources, same as before.

The `FlowProcessor` abstraction (`processing/optical_flow.py`,
`processing/lspiv.py`) lets the backend swap Farneback optical flow, block-PIV
LSPIV or a future PyORC-backed processor without touching the frontend.
The `DebrisDetector` is a model-loading architecture (YOLO via `ultralytics`)
with a centroid tracker for unique-object counting.

---

## Installation

### Backend

Use the project's main Python environment (or any Python ≥ 3.11):

```cmd
cd backend
python -m pip install -r requirements.txt
```

Optional extras (only when the hardware/model is available):
`pyserial` (TF-Luna + LoRa serial), `ultralytics` (YOLO debris model),
`pyopenrivercam` (PyORC adapter inside this env).

### Frontend

Requires Node.js ≥ 20:

```cmd
cd frontend
npm install
```

---

## Running locally

Terminal 1 — backend (FastAPI + WebSocket on port 8000):

```cmd
python backend\main.py
```

Terminal 2 — frontend (Vite dev server on port 5173, proxies `/api` and `/ws`
to the backend):

```cmd
cd frontend
npm run dev
```

Open **http://localhost:5173**

Interactive API docs: http://127.0.0.1:8000/docs

### Development video mode (Phase 1)

1. Open **Live Camera** → *Dev Video* tab.
2. Upload `IMG_9373 (1).MOV` (or any video). Files already present in
   `data/raw/` are listed without re-uploading.
3. Optionally set the water ROI and playback speed, then **Start Processing**.
4. The dashboard shows the live MJPEG feed with real overlays (ROI, flow
   vectors, water edge, debris boxes, HUD), image-space motion values, and
   live-updating graphs. Measurements are stored in SQLite every
   `storage.log_interval_s` seconds.

Known result from the notebook for comparison: average image movement of the
own video is ~6.9 px per 30-frame interval (X ≈ +2.75, Y ≈ −0.78) — the
webapp's per-interval numbers are expected to differ because the default
`frame_interval` is 5, not 30.

### Live camera mode (Raspberry Pi / webcam)

**Live Camera** → *Live Camera* tab → device index (0 default). On a
Raspberry Pi this opens the Camera Module through OpenCV/V4L2
(`picamera2`/libcamera backend can be added in `processing/camera.py`).
Resolution/FPS from Settings are applied on open.

### Remote stream mode

**Live Camera** → *Stream** tab → RTSP/HTTP URL, opened through OpenCV FFMPEG.

### Streaming design choice

The prototype uses **MJPEG over HTTP** (`GET /api/video/stream`) — the
simplest reliable option for a local-network monitoring dashboard. The frame
pipeline is source-agnostic, so HLS/WebRTC can be added later by serving the
same annotated frames through another transport.

---

## PyORC testing mode (separate from live monitoring)

PyORC stays in the research workflow (separate `river-video-pyorc` repository,
`pyorc_env`, pyorc 0.5.3 — the version verified in that repository's
notebooks). The webapp **never** requires PyORC:

- `processing/pyorc_adapter.py` reports honest availability. In the default
  webapp environment it answers "not installed" and points to `pyorc_env`.
- The **Testing & Validation** page shows the adapter status and the presence
  of `data/config/camera_config.json`.
- With pyorc installed and a real camera config present,
  `PyORCAdapter.run_reference_piv(video_path, camera_config_path)` runs
  projection + PIV for reference flow computation. Version-sensitive APIs
  must be inspected before use (per the repository's own troubleshooting
  notes).

The Ngwerere example is a learning dataset only and is never treated as
project data.

---

## Calibration

The **Calibration** page shows the true state of: camera calibration (file
check), GCPs, physical scale (m/px), CRS, reference elevation, cross-section
area and the velocity correction factor. Setting a physical scale immediately
switches flow output from `px` (uncalibrated) to `m/s` (labeled *uniform scale
approximation*). Everything starts unconfigured.

---

## Database

SQLite at `backend/data/appdata/riverflow.db`:

- `measurements` — timestamp, water_level, lidar_distance, camera_water_edge,
  flow_rate, surface_velocity, velocity_unit, calibrated, image_motion,
  motion_x/y, direction_deg, debris_count, camera/lidar/lora status, source,
  camera_fps.
- `validation_tests` — reference vs measured values for tank/field experiments
  with computed error/accuracy.

Query via `GET /api/history?hours=24`, export CSV from the Historical Data
page. The API is source-agnostic: local processing and (future) LoRa-gateway
ingest write the same rows.

## WebSocket

`/ws/live` pushes every processed measurement:

```json
{
  "timestamp": "…",
  "water_level": { "value": 1.24, "unit": "m" },
  "flow": { "value": null, "unit": null, "calibrated": false,
            "image_motion": 6.89, "image_motion_unit": "px" },
  "debris": { "count": 3 },
  "camera": { "fps": 30 }
}
```

The frontend keeps a live buffer (max 900 points) shared by all charts and
reconnects automatically.

---

## LoRa / cloud (future integration)

Final architecture: Pi → Pi Zero/LoRa node → LoRa → gateway → internet → web
backend → dashboard. The browser never touches LoRa hardware. During
development the LoRa service honestly reports `not connected`.
`communication/lora.py` provides `build_payload()` / `send()` and a mock link
that activates only under DEMO MODE (flagged in the UI).

---

## Testing

Backend unit/integration tests (synthetic moving-pattern video — no fake
data, real optical flow on real pixels):

```cmd
cd backend
python -m pytest tests
```

Live smoke test (requires the backend running):

```cmd
python tests\smoke_live.py
```

Frontend type-check/build:

```cmd
cd frontend
npm run build
```

---

## Deployment (public access)

Build the frontend once — the backend then serves dashboard + API + WebSocket
on a single port:

```cmd
cd frontend
npm run build
python backend\main.py --host 0.0.0.0 --port 8000
```

`RIVERFLOW_FRONTEND_DIST` overrides the dist path (defaults to
`frontend/dist`).

### Option A — quick share via tunnel (no server needed)

Run the backend as above, then expose it with a tunnel:

```cmd
cloudflared tunnel --url http://127.0.0.1:8000
```

(or `ngrok http 8000`). The printed `https://…` URL is reachable by anyone
while your machine and the tunnel stay running. WebSockets and MJPEG work
through the tunnel.

### Option B — cloud server / VPS (always on)

```bash
# on the server, with the repository copied over and Docker installed

docker build -t riverflow-monitor .
docker run -d -p 8000:8000 --restart unless-stopped \
  -v riverflow-data:/app/data/appdata riverflow-monitor
```

The dashboard is then available at `http://<server-ip>:8000` (put Caddy/nginx
with HTTPS in front for a proper domain). The same image deploys to
Render / Railway / Fly.io.

Note: a public instance lets anyone upload videos and control processing —
enable authentication (below) before sharing widely. Long term, the intended
remote architecture is Pi → LoRa → gateway → cloud backend → dashboard.

---

## Authentication (public deployments)

The dashboard supports login-protected mode, **disabled by default** so local
development is unchanged. Enable it with environment variables:

| Variable | Meaning |
|---|---|
| `RIVERFLOW_AUTH_USER` | login username (empty = auth disabled) |
| `RIVERFLOW_AUTH_PASSWORD` | login password |
| `RIVERFLOW_AUTH_SECRET` | HMAC signing secret (optional; random per restart when unset, which logs out all sessions on restart) |

When enabled, all API endpoints, the WebSocket and the video stream require a
valid session cookie (30-day expiry, HttpOnly). The login page appears
automatically; a logout button shows in the top bar.

On **Render**: Service → **Environment** → add `RIVERFLOW_AUTH_USER` and
`RIVERFLOW_AUTH_PASSWORD` → Save (triggers redeploy). Use a long password.

On **Docker**: `docker run -e RIVERFLOW_AUTH_USER=admin -e RIVERFLOW_AUTH_PASSWORD=… …`

---

## Current limitations

- Velocity stays image-space until real calibration data exists (by design).
- Discharge output is not implemented in the live loop yet (gating exists).
- Debris detection requires a trained YOLO model — currently reported as
  "Model not configured".
- Uniform m/px scale does not correct perspective; research-grade LSPIV
  belongs to the PyORC workflow.
- Camera water-edge detection is experimental and supplementary.
- LoRa/cloud ingest is architecture-only; no gateway is connected yet.
