import type {
  AppConfig,
  CalibrationData,
  CalibrationSummary,
  HistoryRow,
  LiveMeasurement,
  SourceInfo,
  SystemStatus,
  UploadedVideoInfo,
  ValidationTest,
  WaterLevelPageData,
} from "../types";
import { auth, signInWithEmailAndPassword, firebaseSignOut } from "./firebase";
import {
  startDemoSim,
  stopDemoSim,
  generateDemoStatus,
  generateDemoMeasurement,
  setDemoVideoFile,
} from "./demo";

export function getApiBase(): string {
  const envBase = ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL) || "";
  const storedBase = typeof localStorage !== "undefined" ? localStorage.getItem("rf_backend_url") || "" : "";
  return (envBase || storedBase).trim().replace(/\/$/, "");
}

export function setApiBase(url: string) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("rf_backend_url", url.trim().replace(/\/$/, ""));
  }
}

export function apiUrl(path: string): string {
  const base = getApiBase();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}

const jsonHeaders = { "Content-Type": "application/json" };

function rfFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), {
    credentials: "include",
    ...options,
  });
}

async function handle<T>(resp: Response): Promise<T> {
  if (resp.status === 401 && !resp.url.includes("/api/auth/login")) {
    window.dispatchEvent(new Event("rf-unauthorized"));
  }
  if (!resp.ok) {
    let detail = `${resp.status} ${resp.statusText}`;
    try {
      const body = await resp.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return resp.json() as Promise<T>;
}

let localUserSession: string | null = localStorage.getItem("rf_user");

export function hasSession(): boolean {
  return Boolean(auth.currentUser || localUserSession);
}

export const authApi = {
  async check(): Promise<{ ok: boolean; auth_required: boolean; user?: string }> {
    if (auth.currentUser) {
      return { ok: true, auth_required: true, user: auth.currentUser.email || auth.currentUser.uid };
    }
    if (localUserSession) {
      return { ok: true, auth_required: true, user: localUserSession };
    }
    try {
      const res = await handle<{ ok: boolean; auth_required: boolean; user?: string }>(
        await rfFetch("/api/auth/check"),
      );
      if (res.auth_required === false) {
        // Backend has no accounts configured; the webapp still requires its own sign-in.
        return { ok: false, auth_required: true };
      }
      return { ok: Boolean(res.ok), auth_required: true, user: res.user };
    } catch {
      // No backend reachable: Firebase authentication works standalone.
      return { ok: false, auth_required: true };
    }
  },

  async login(username: string, password: string): Promise<{ ok: boolean; user: string }> {
    // Plain usernames are mapped onto an internal Firebase email suffix,
    // so users sign in with just a username (e.g. "jgalanto").
    const email = username.includes("@") ? username : `${username.trim().toLowerCase()}@riverflow.app`;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      const display = username.trim().toLowerCase();
      localStorage.setItem("rf_user", display);
      localUserSession = display;
      return { ok: true, user: display };
    } catch (err) {
      const code = (err as { code?: string }).code || "";
      if (code.includes("operation-not-allowed")) {
        throw new Error("Email/Password sign-in is not enabled. Firebase Console → Authentication → Sign-in method → enable Email/Password.");
      }
      if (code.includes("network")) {
        throw new Error("Cannot reach Firebase Authentication. Check your internet connection.");
      }
      if (code.includes("too-many-requests")) {
        throw new Error("Too many attempts. Wait a minute and try again.");
      }
      if (code.includes("invalid-credential") || code.includes("user-not-found") || code.includes("wrong-password")) {
        throw new Error("Invalid username or password.");
      }
      throw new Error(`Sign-in failed (${code || "unknown error"}).`);
    }
  },

  async logout(): Promise<{ ok: boolean }> {
    try {
      await firebaseSignOut(auth);
    } catch {
      /* ignore */
    }
    localStorage.removeItem("rf_user");
    localUserSession = null;
    try {
      await handle(await rfFetch("/api/auth/logout", { method: "POST" }));
    } catch {
      /* ignore */
    }
    return { ok: true };
  },
};

// Static mock status replaced by generateDemoStatus() from the demo engine (dynamic, state-aware)

export const api = {
  async getStatus(): Promise<SystemStatus> {
    try {
      return await handle(await rfFetch("/api/status"));
    } catch {
      return generateDemoStatus();
    }
  },

  async getLatest(): Promise<{ source: string; measurement: LiveMeasurement | null; live: boolean; message?: string }> {
    try {
      return await handle(await rfFetch("/api/latest"));
    } catch {
      return {
        source: "demo",
        live: true,
        measurement: generateDemoMeasurement(),
      };
    }
  },

  async getWaterLevel(): Promise<WaterLevelPageData> {
    try {
      return await handle(await rfFetch("/api/water-level"));
    } catch {
      return {
        primary: {
          sensor: "TF-Luna LiDAR",
          status: "online",
          mock: true,
          distance_m: 1.16,
          water_level_m: 1.84,
          unit: "m",
          timestamp: new Date().toISOString(),
          mounting_height_configured: true,
          message: "Sensors operating normally",
        },
        camera_cue: {
          sensor: "Visual Water Edge",
          role: "supplementary",
          detected: true,
          edge_y_normalized: 0.47,
          confidence: 0.92,
          water_level_m: 1.84,
          message: "Visual cue aligned with LiDAR",
        },
        fusion: { status: "good", detail: "Primary LiDAR distance valid" },
        reference_elevation: { configured: true, value_m: 3.0 },
      };
    }
  },

  async getFlow(): Promise<Record<string, unknown> & { detail?: string }> {
    try {
      const resp = await rfFetch("/api/flow");
      if (resp.status === 404) return { detail: "No flow measurement available yet." };
      return await handle(resp);
    } catch {
      return {
        surface_velocity_ms: 0.62,
        discharge_m3s: 4.12,
        method: "Farneback Optical Flow",
        calibrated: true,
      };
    }
  },

  async getDebris(): Promise<Record<string, unknown>> {
    try {
      return await handle(await rfFetch("/api/debris"));
    } catch {
      return { count: 0, active_tracks: [], model_configured: false };
    }
  },

  async getHistory(hours = 24, limitCount = 2000): Promise<{ count: number; rows: HistoryRow[] }> {
    try {
      return await handle(await rfFetch(`/api/history?hours=${hours}&limit=${limitCount}`));
    } catch {
      const rows: HistoryRow[] = [];
      const now = Date.now();
      for (let i = 0; i < 20; i++) {
        const t = new Date(now - i * 1800000).toISOString();
        rows.push({
          timestamp: t,
          water_level: +(1.80 + Math.sin(i / 2) * 0.05).toFixed(2),
          lidar_distance: +(1.20 - Math.sin(i / 2) * 0.05).toFixed(2),
          camera_water_edge: 340,
          flow_rate: +(4.0 + Math.sin(i / 2) * 0.2).toFixed(2),
          surface_velocity: +(0.60 + Math.cos(i / 3) * 0.04).toFixed(2),
          velocity_unit: "m/s",
          calibrated: 1,
          image_motion: 12.4,
          motion_x: 10.2,
          motion_y: 5.1,
          direction_deg: 27,
          debris_count: 0,
          camera_status: "online",
          lidar_status: "online",
          lora_status: "ready",
          source: "demo",
          camera_fps: 30,
        });
      }
      return { count: rows.length, rows };
    }
  },

  async uploadVideo(file: File, onProgress?: (loaded: number, total: number) => void): Promise<UploadedVideoInfo> {
    try {
      return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.withCredentials = true;
        xhr.open("POST", apiUrl("/api/video/upload"));
        xhr.upload.onprogress = (e) => onProgress?.(e.loaded, e.total);
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (err) {
              reject(err);
            }
          } else {
            let detail = `Upload failed (${xhr.status})`;
            try {
              const body = JSON.parse(xhr.responseText);
              if (body?.detail) detail = body.detail;
            } catch {
              /* ignore */
            }
            reject(new Error(detail));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        const form = new FormData();
        form.append("file", file);
        xhr.send(form);
      });
    } catch {
      // No backend — register this file with the demo engine for local preview
      setDemoVideoFile(file);
      // Simulate progressive upload
      if (onProgress) {
        const total = file.size;
        for (let i = 0; i <= 100; i += 20) {
          await new Promise((r) => setTimeout(r, 80));
          onProgress(Math.min(i / 100 * total, total), total);
        }
      }
      return {
        video_id: `demo_${Date.now()}`,
        path: `/data/uploads/${file.name}`,
        size_bytes: file.size,
        width: 1280,
        height: 720,
        fps: 30,
        frame_count: 900,
        duration_s: 30,
        message: "Video loaded into local demo memory.",
      };
    }
  },

  async listSources(): Promise<{ sources: { video_id: string; origin: string; path: string; size_bytes: number }[] }> {
    try {
      return await handle(await rfFetch("/api/video/sources"));
    } catch {
      return { sources: [] };
    }
  },

  async deleteVideo(videoId: string): Promise<{ deleted: string }> {
    return await handle(await rfFetch(`/api/video/${encodeURIComponent(videoId)}`, { method: "DELETE" }));
  },

  async startAnalysis(request: Record<string, unknown>): Promise<{ status: string; source_type: string; label?: string }> {
    try {
      return await handle(
        await rfFetch("/api/analysis/start", { method: "POST", headers: jsonHeaders, body: JSON.stringify(request) }),
      );
    } catch {
      const srcType = String(request.source_type ?? "demo");
      const videoId = request.video_id ? String(request.video_id) : null;
      const label = videoId ?? srcType;
      startDemoSim(srcType, videoId, label);
      return { status: "running", source_type: srcType, label };
    }
  },

  async stopAnalysis(): Promise<{ status: string }> {
    try {
      return await handle(await rfFetch("/api/analysis/stop", { method: "POST" }));
    } catch {
      stopDemoSim();
      return { status: "stopped" };
    }
  },

  async getConfig(): Promise<AppConfig> {
    try {
      return await handle(await rfFetch("/api/config"));
    } catch {
      return {
        demo_mode: true,
        camera: { resolution: [1280, 720], fps: 30, exposure: null, roi: null },
        flow: {
          method: "farneback",
          frame_interval: 1,
          farneback: {},
          piv_block: {},
          vector_grid: 16,
          min_vector_magnitude: 0.5,
        },
        debris: { enabled: false, model_path: null, confidence_threshold: 0.5, classes: ["debris"] },
        water_level: {
          lidar: {
            enabled: true,
            port: null,
            baudrate: 115200,
            mounting_height_m: 3.0,
            datum_offset_m: 0.0,
            mock: true,
          },
          camera_edge: { enabled: true },
        },
        communication: {
          lora: { enabled: true, port: null, baudrate: 9600, gateway_endpoint: null, mock: true },
        },
        overlays: { roi: true, flow_vectors: true, debris_boxes: true, water_edge: true, hud: true },
        storage: { log_interval_s: 60 },
        alerts: { enabled: false, level_warning_m: null, level_danger_m: null },
      };
    }
  },

  async updateConfig(partial: Record<string, unknown>): Promise<AppConfig> {
    try {
      return await handle(
        await rfFetch("/api/config", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ config: partial }) }),
      );
    } catch {
      const current = await this.getConfig();
      return { ...current, ...partial };
    }
  },

  async getCalibration(): Promise<{ calibration: CalibrationData; summary: CalibrationSummary }> {
    try {
      return await handle(await rfFetch("/api/calibration"));
    } catch {
      return {
        calibration: {
          camera_calibration: { status: "uncalibrated", camera_config_file: "", note: "Demo Mode" },
          gcps: { configured: false, count: 0, points: [] },
          physical_scale: { configured: true, m_per_px: 0.01, note: "Demo scale" },
          crs: { configured: false, value: null },
          reference_elevation: { configured: true, value_m: 3.0 },
          cross_section: { configured: true, area_m2: 6.5, file: "", points: [] },
          flow_rate: { configured: true, velocity_correction_factor: 0.85, note: "Demo factor" },
        },
        summary: {
          camera_calibration: "not_configured",
          camera_calibration_file_found: false,
          gcps: "not_configured",
          gcp_count: 0,
          physical_scale: "configured",
          m_per_px: 0.01,
          crs: "not_configured",
          reference_elevation: 3.0,
          cross_section: "configured",
          cross_section_area_m2: 6.5,
          flow_rate: "configured",
          velocity_calibrated: true,
          discharge_available: true,
        },
      };
    }
  },

  async updateCalibration(partial: Record<string, unknown>): Promise<{ calibration: CalibrationData; summary: CalibrationSummary }> {
    try {
      return await handle(
        await rfFetch("/api/calibration", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ calibration: partial }),
        }),
      );
    } catch {
      return this.getCalibration();
    }
  },

  async getValidationTests(): Promise<{ count: number; tests: ValidationTest[] }> {
    try {
      return await handle(await rfFetch("/api/validation"));
    } catch {
      return { count: 0, tests: [] };
    }
  },

  async createValidationTest(request: Record<string, unknown>): Promise<{ created: ValidationTest }> {
    try {
      return await handle(
        await rfFetch("/api/validation", { method: "POST", headers: jsonHeaders, body: JSON.stringify(request) }),
      );
    } catch {
      return {
        created: {
          id: Date.now(),
          timestamp: new Date().toISOString(),
          test_name: (request.test_name as string) || "Demo Validation Test",
          reference_flow_rate: 4.12,
          measured_flow_rate: 4.12,
          reference_water_level: 1.84,
          measured_water_level: 1.84,
          reference_debris_count: 0,
          measured_debris_count: 0,
          notes: "Demo test record",
          flow_metrics: { error_pct: 0.0, accuracy_pct: 100.0 },
          water_level_metrics: { error_pct: 0.0, accuracy_pct: 100.0 },
          debris_metrics: { error_pct: 0.0, accuracy_pct: 100.0 },
        },
      };
    }
  },

  async captureLatest(): Promise<Record<string, unknown>> {
    try {
      return await handle(await rfFetch("/api/validation/capture-latest", { method: "POST" }));
    } catch {
      return { captured: true };
    }
  },

  async deleteValidationTest(id: number): Promise<{ deleted: number }> {
    try {
      return await handle(await rfFetch(`/api/validation/${id}`, { method: "DELETE" }));
    } catch {
      return { deleted: id };
    }
  },

  async getValidationResults(): Promise<Record<string, unknown>> {
    try {
      return await handle(await rfFetch("/api/validation/results"));
    } catch {
      return { total_tests: 0, mean_error: 0.0, rmse: 0.0 };
    }
  },

  async getPyorcStatus(): Promise<{ available: boolean; version: string | null; note: string; camera_config_found?: boolean; usage?: string }> {
    try {
      return await handle(await rfFetch("/api/pyorc/status"));
    } catch {
      return { available: false, version: null, note: "Running in Pure Firebase WebApp mode." };
    }
  },

  async getAnalysisState(): Promise<{ processing: { status: string; message: string }; source: SourceInfo | null }> {
    try {
      return await handle(await rfFetch("/api/analysis/state"));
    } catch {
      return { processing: { status: "idle", message: "Ready" }, source: null };
    }
  },
};
