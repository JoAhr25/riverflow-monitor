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

const jsonHeaders = { "Content-Type": "application/json" };

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

export const authApi = {
  async check(): Promise<{ ok: boolean; auth_required: boolean; user?: string }> {
    return handle(await fetch("/api/auth/check"));
  },
  async login(username: string, password: string): Promise<{ ok: boolean; user: string }> {
    return handle(
      await fetch("/api/auth/login", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ username, password }),
      }),
    );
  },
  async logout(): Promise<{ ok: boolean }> {
    return handle(await fetch("/api/auth/logout", { method: "POST" }));
  },
};

export const api = {
  async getStatus(): Promise<SystemStatus> {
    return handle(await fetch("/api/status"));
  },

  async getLatest(): Promise<{ source: string; measurement: LiveMeasurement | null; live: boolean; message?: string }> {
    return handle(await fetch("/api/latest"));
  },

  async getWaterLevel(): Promise<WaterLevelPageData> {
    return handle(await fetch("/api/water-level"));
  },

  async getFlow(): Promise<Record<string, unknown> & { detail?: string }> {
    const resp = await fetch("/api/flow");
    if (resp.status === 404) return { detail: "No flow measurement available yet." };
    return handle(resp);
  },

  async getDebris(): Promise<Record<string, unknown>> {
    return handle(await fetch("/api/debris"));
  },

  async getHistory(hours = 24, limit = 2000): Promise<{ count: number; rows: HistoryRow[] }> {
    return handle(await fetch(`/api/history?hours=${hours}&limit=${limit}`));
  },

  async uploadVideo(file: File, onProgress?: (loaded: number, total: number) => void): Promise<UploadedVideoInfo> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/video/upload");
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
  },

  async listSources(): Promise<{ sources: { video_id: string; origin: string; path: string; size_bytes: number }[] }> {
    return handle(await fetch("/api/video/sources"));
  },

  async startAnalysis(request: Record<string, unknown>): Promise<{ status: string; source_type: string; label?: string }> {
    return handle(
      await fetch("/api/analysis/start", { method: "POST", headers: jsonHeaders, body: JSON.stringify(request) }),
    );
  },

  async stopAnalysis(): Promise<{ status: string }> {
    return handle(await fetch("/api/analysis/stop", { method: "POST" }));
  },

  async getConfig(): Promise<AppConfig> {
    return handle(await fetch("/api/config"));
  },

  async updateConfig(partial: Record<string, unknown>): Promise<AppConfig> {
    return handle(
      await fetch("/api/config", { method: "POST", headers: jsonHeaders, body: JSON.stringify({ config: partial }) }),
    );
  },

  async getCalibration(): Promise<{ calibration: CalibrationData; summary: CalibrationSummary }> {
    return handle(await fetch("/api/calibration"));
  },

  async updateCalibration(partial: Record<string, unknown>): Promise<{ calibration: CalibrationData; summary: CalibrationSummary }> {
    return handle(
      await fetch("/api/calibration", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ calibration: partial }),
      }),
    );
  },

  async getValidationTests(): Promise<{ count: number; tests: ValidationTest[] }> {
    return handle(await fetch("/api/validation"));
  },

  async createValidationTest(request: Record<string, unknown>): Promise<{ created: ValidationTest }> {
    return handle(
      await fetch("/api/validation", { method: "POST", headers: jsonHeaders, body: JSON.stringify(request) }),
    );
  },

  async captureLatest(): Promise<Record<string, unknown>> {
    return handle(await fetch("/api/validation/capture-latest", { method: "POST" }));
  },

  async deleteValidationTest(id: number): Promise<{ deleted: number }> {
    return handle(await fetch(`/api/validation/${id}`, { method: "DELETE" }));
  },

  async getValidationResults(): Promise<Record<string, unknown>> {
    return handle(await fetch("/api/validation/results"));
  },

  async getPyorcStatus(): Promise<{ available: boolean; version: string | null; note: string; camera_config_found?: boolean; usage?: string }> {
    return handle(await fetch("/api/pyorc/status"));
  },

  async getAnalysisState(): Promise<{ processing: { status: string; message: string }; source: SourceInfo | null }> {
    return handle(await fetch("/api/analysis/state"));
  },
};
