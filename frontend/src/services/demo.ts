/**
 * Client-side demo simulation engine.
 * Simulates what the Python backend would produce during video processing.
 * Used when deployed to Pure Firebase Hosting without a backend.
 */

/** Module-level video blob URL (not persisted across page reloads) */
let _demoBlobUrl: string | null = null;

export function setDemoVideoFile(file: File): string {
  if (_demoBlobUrl) URL.revokeObjectURL(_demoBlobUrl);
  _demoBlobUrl = URL.createObjectURL(file);
  return _demoBlobUrl;
}

export function getDemoVideoUrl(): string | null {
  return _demoBlobUrl;
}

export function dispatchDemoStateChange() {
  window.dispatchEvent(new CustomEvent("rf-demo-state-change"));
}

import type { LiveMeasurement, SystemStatus } from "../types";

export interface DemoSimState {
  running: boolean;
  source_type: string;
  video_id: string | null;
  label: string;
  startedAt: number;
  videoName: string | null;
}

const KEY = "rf_demo_sim";

function saveState(state: DemoSimState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function loadState(): DemoSimState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DemoSimState;
  } catch {
    /* ignore */
  }
  return {
    running: false,
    source_type: "demo",
    video_id: null,
    label: "Demo Stream",
    startedAt: Date.now(),
    videoName: null,
  };
}

export function startDemoSim(source_type: string, video_id: string | null, label: string, videoName?: string) {
  const state: DemoSimState = {
    running: true,
    source_type,
    video_id,
    label,
    startedAt: Date.now(),
    videoName: videoName ?? label,
  };
  saveState(state);
  dispatchDemoStateChange();
  return state;
}

export function stopDemoSim() {
  const state: DemoSimState = {
    running: false,
    source_type: "demo",
    video_id: null,
    label: "Idle",
    startedAt: Date.now(),
    videoName: null,
  };
  saveState(state);
  dispatchDemoStateChange();
  return state;
}

export function getDemoSimState(): DemoSimState {
  return loadState();
}

function wave(t: number, period: number, amp: number, base: number): number {
  return +(base + Math.sin((t / period) * 2 * Math.PI) * amp).toFixed(3);
}

export function generateDemoMeasurement(): LiveMeasurement {
  const state = loadState();
  const t = (Date.now() - state.startedAt) / 1000;
  const now = new Date().toISOString();

  const waterLevel = wave(t, 120, 0.06, 1.84);
  const velocity = wave(t, 60, 0.08, 0.62);
  const imageMotion = wave(t, 60, 2.0, 12.4);
  const directionDeg = 25 + Math.sin(t / 30) * 10;
  const debrisCount = Math.random() < 0.05 ? 1 : 0;

  return {
    timestamp: now,
    water_level: {
      value: waterLevel,
      unit: "m",
      status: "ok",
      mock: true,
      distance_m: +(3.0 - waterLevel).toFixed(3),
      source: "lidar",
    },
    flow: {
      value: velocity,
      unit: "m/s",
      calibrated: true,
      image_motion: imageMotion,
      image_motion_unit: "px/s",
      motion_x: +(imageMotion * Math.cos((directionDeg * Math.PI) / 180)).toFixed(2),
      motion_y: +(imageMotion * Math.sin((directionDeg * Math.PI) / 180)).toFixed(2),
      direction_deg: +directionDeg.toFixed(1),
      coverage: 0.85,
      method: "farneback",
      frame_interval: 1,
      source_fps: 30,
      status: state.running ? "ok" : "idle",
    },
    debris: {
      count: debrisCount,
      tracked_total: debrisCount,
      active_tracks: debrisCount,
      detections: [],
    },
    water_edge: {
      detected: true,
      edge_y: 340,
      edge_y_normalized: 0.47,
      confidence: 0.92,
    },
    camera: {
      fps: 29 + Math.random(),
      source_fps: 30,
      frames: Math.floor(t * 30),
      source_type: state.source_type,
      source_label: state.label,
      mode_label: state.running ? "Processing" : "Idle",
      status: state.running ? "live" : "idle",
    },
    lidar_status: "online",
    lora: { status: "ready", mock: true },
    demo_mode: true,
  };
}

export function generateDemoStatus(state?: DemoSimState): SystemStatus {
  const s = state ?? getDemoSimState();
  return {
    system_online: true,
    demo_mode: true,
    uptime_s: Math.floor((Date.now() - s.startedAt) / 1000),
    timestamp: new Date().toISOString(),
    auth_required: false,
    components: {
      camera: { status: "ok", detail: s.running ? `Processing ${s.label}` : "Idle", mock: true },
      lidar: { status: "ok", detail: "LiDAR mock — 1.16 m", mock: true },
      flow_processing: { status: s.running ? "ok" : "idle", detail: s.running ? "Farneback Optical Flow active" : "Idle", mock: true },
      debris_ai: { status: "ok", detail: "Model not configured — no detections", mock: true },
      storage: { status: "ok", detail: "Firebase Hosting (static)" },
      lora: { status: "ok", detail: "LoRa mock ready", mock: true },
      cloud: { status: "ok", detail: "Firebase Cloud Online" },
    },
    source: s.running
      ? {
          type: s.source_type,
          label: s.label,
          mode_label: "Video Processing (Demo)",
          width: 1280,
          height: 720,
          fps: 30,
          frame_count: 900,
          duration_s: 30,
        }
      : null,
    processing: {
      status: s.running ? "running" : "idle",
      message: s.running ? `Processing ${s.label} — Demo/Simulation Mode` : "Idle. Upload a video to start.",
    },
    websocket_clients: 0,
    pyorc: { available: false, version: null, note: "Firebase WebApp mode — Python backend not connected." },
  };
}
