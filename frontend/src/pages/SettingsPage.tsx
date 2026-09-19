import { useEffect, useState } from "react";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import { Button, Field, Toggle, inputClass } from "../components/Field";
import { api, getApiBase, setApiBase } from "../services/api";
import { useLive } from "../services/live";
import type { AppConfig } from "../types";

export default function SettingsPage() {
  const { refreshStatus } = useLive();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendUrl, setBackendUrl] = useState(getApiBase());

  useEffect(() => {
    api.getConfig().then(setConfig).catch((err) => setError((err as Error).message));
  }, []);

  if (!config) {
    return (
      <div className="space-y-5">
        <PageHeader title="Settings" />
        {error ? <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{error}</div> : <EmptyState message="Loading configuration…" />}
      </div>
    );
  }

  const set = (mutate: (draft: AppConfig) => void) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as AppConfig;
      mutate(next);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await api.updateConfig(config as unknown as Record<string, unknown>);
      setConfig(saved);
      setMessage("Settings saved. Sensor services were restarted with the new configuration.");
      refreshStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Camera, flow processing, debris AI, water level and communication settings. Changes are persisted server-side (config.json)."
        actions={
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save All Settings"}
          </Button>
        }
      />

      {message && <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{message}</div>}
      {error && <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}

      <Card title="Demo Mode" subtitle="Mock sensors for development only">
        <div className="flex items-center justify-between gap-4">
          <Toggle
            checked={config.demo_mode}
            onChange={(v) => set((d) => { d.demo_mode = v; })}
            label="Enable demo mode"
          />
          <p className="max-w-md text-right text-xs text-slate-500 dark:text-slate-400">
            Demo mode allows clearly-labeled mock LiDAR/LoRa values when the corresponding mock switches are enabled.
            All mock values are flagged and displayed as DEMO MODE — never mixed silently with real measurements.
          </p>
        </div>
      </Card>

      <Card title="Water-Level Alerts" subtitle="Threshold-based warning and danger states, evaluated on every measurement">
        <div className="flex items-center justify-between gap-4">
          <Toggle
            checked={config.alerts.enabled}
            onChange={(v) => set((d) => { d.alerts.enabled = v; })}
            label="Enable water-level alerts"
          />
          <p className="max-w-md text-right text-xs text-slate-500 dark:text-slate-400">
            When enabled, a banner appears as soon as the water level crosses a threshold, and a browser
            notification fires (if you allowed notifications) when the state changes.
          </p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Warning threshold (m)" hint="Banner appears at or above this level">
            <input
              value={config.alerts.level_warning_m ?? ""}
              onChange={(e) => set((d) => { d.alerts.level_warning_m = e.target.value.trim() === "" ? null : Number(e.target.value); })}
              placeholder="e.g. 1.5"
              className={inputClass}
            />
          </Field>
          <Field label="Danger threshold (m)" hint="Should be higher than the warning threshold">
            <input
              value={config.alerts.level_danger_m ?? ""}
              onChange={(e) => set((d) => { d.alerts.level_danger_m = e.target.value.trim() === "" ? null : Number(e.target.value); })}
              placeholder="e.g. 2.0"
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <Card title="Remote Backend" subtitle="Connect this webapp to a Python backend running anywhere">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Backend base URL" hint="e.g. a Cloudflare Tunnel URL exposing http://127.0.0.1:8000 on your laptop or Mini PC. Empty = same origin (demo mode when no backend exists).">
            <input
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder="https://your-tunnel.trycloudflare.com"
              className={inputClass}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setApiBase(backendUrl);
                window.location.reload();
              }}
            >
              Connect
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setApiBase("");
                setBackendUrl("");
                window.location.reload();
              }}
            >
              Reset
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          The URL is stored in this browser only (localStorage). REST, WebSocket and the live video stream all
          route through it, so the hosted webapp behaves exactly like the local one while that backend is reachable.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Camera" subtitle="Applies to live camera sources">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Resolution width (px)">
              <input type="number" value={config.camera.resolution[0]} onChange={(e) => set((d) => { d.camera.resolution[0] = Number(e.target.value) || 1280; })} className={inputClass} />
            </Field>
            <Field label="Resolution height (px)">
              <input type="number" value={config.camera.resolution[1]} onChange={(e) => set((d) => { d.camera.resolution[1] = Number(e.target.value) || 720; })} className={inputClass} />
            </Field>
            <Field label="FPS">
              <input type="number" value={config.camera.fps} onChange={(e) => set((d) => { d.camera.fps = Number(e.target.value) || 30; })} className={inputClass} />
            </Field>
            <Field label="Exposure" hint="Leave empty for auto exposure">
              <input value={config.camera.exposure ?? ""} onChange={(e) => set((d) => { d.camera.exposure = e.target.value.trim() === "" ? null : Number(e.target.value); })} className={inputClass} />
            </Field>
          </div>
          <div className="mt-3">
            <Field
              label="Water ROI (normalized x, y, w, h)"
              hint="Comma-separated values in 0–1 range, e.g. 0.1, 0.45, 0.8, 0.4. Empty = full frame. The ROI constrains optical flow, water-edge detection and vector overlays."
            >
              <input
                value={config.camera.roi ? config.camera.roi.join(", ") : ""}
                onChange={(e) => {
                  const parts = e.target.value.split(",").map((p) => parseFloat(p.trim()));
                  set((d) => { d.camera.roi = e.target.value.trim() === "" ? null : (parts.length === 4 && parts.every((p) => !Number.isNaN(p)) ? parts : d.camera.roi); });
                }}
                placeholder="0.1, 0.45, 0.8, 0.4"
                className={inputClass}
              />
            </Field>
          </div>
        </Card>

        <Card title="Flow Processing" subtitle="Optical flow / LSPIV parameters">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Method">
              <select value={config.flow.method} onChange={(e) => set((d) => { d.flow.method = e.target.value; })} className={inputClass}>
                <option value="farneback">Farneback optical flow</option>
                <option value="piv_block">Block PIV (LSPIV-style)</option>
              </select>
            </Field>
            <Field label="Frame interval" hint="Frames between flow computations">
              <input type="number" min={1} value={config.flow.frame_interval} onChange={(e) => set((d) => { d.flow.frame_interval = Math.max(1, Number(e.target.value) || 5); })} className={inputClass} />
            </Field>
            <Field label="Vector grid (px)">
              <input type="number" value={config.flow.vector_grid} onChange={(e) => set((d) => { d.flow.vector_grid = Number(e.target.value) || 32; })} className={inputClass} />
            </Field>
            <Field label="Min vector magnitude (px)">
              <input type="number" step="0.5" value={config.flow.min_vector_magnitude} onChange={(e) => set((d) => { d.flow.min_vector_magnitude = Number(e.target.value) || 1; })} className={inputClass} />
            </Field>
            {(
              [
                ["pyramid_scale", "Pyramid scale"],
                ["levels", "Pyramid levels"],
                ["winsize", "Window size"],
                ["iterations", "Iterations"],
                ["poly_n", "Poly N"],
                ["poly_sigma", "Poly sigma"],
              ] as [keyof AppConfig["flow"]["farneback"], string][]
            ).map(([key, label]) => (
              <Field key={String(key)} label={label}>
                <input
                  type="number"
                  step="0.1"
                  value={config.flow.farneback[key]}
                  onChange={(e) => set((d) => { d.flow.farneback[key] = Number(e.target.value); })}
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            LSPIV research-grade processing (orthorectification, transects, discharge) runs separately through the
            PyORC adapter in the pyorc_env environment.
          </p>
        </Card>

        <Card title="Debris AI" subtitle="YOLO-model configuration">
          <div className="space-y-3">
            <Toggle checked={config.debris.enabled} onChange={(v) => set((d) => { d.debris.enabled = v; })} label="Enable debris detection" />
            <Field label="Model path" hint="Path to a trained YOLO model (.pt). Requires the ultralytics package.">
              <input value={config.debris.model_path ?? ""} onChange={(e) => set((d) => { d.debris.model_path = e.target.value.trim() === "" ? null : e.target.value.trim(); })} placeholder="e.g. models/debris_yolov8n.pt" className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Confidence threshold">
                <input type="number" step="0.05" min="0.05" max="0.95" value={config.debris.confidence_threshold} onChange={(e) => set((d) => { d.debris.confidence_threshold = Number(e.target.value) || 0.5; })} className={inputClass} />
              </Field>
              <Field label="Detection classes" hint="Comma-separated class names from the model">
                <input
                  value={config.debris.classes.join(", ")}
                  onChange={(e) => set((d) => { d.debris.classes = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); })}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card title="Water Level" subtitle="TF-Luna LiDAR + camera edge cue">
          <div className="space-y-3">
            <Toggle checked={config.water_level.lidar.enabled} onChange={(v) => set((d) => { d.water_level.lidar.enabled = v; })} label="LiDAR enabled" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Serial port" hint="e.g. COM3 (Windows) /dev/ttyUSB0 (Pi)">
                <input value={config.water_level.lidar.port ?? ""} onChange={(e) => set((d) => { d.water_level.lidar.port = e.target.value.trim() === "" ? null : e.target.value.trim(); })} className={inputClass} />
              </Field>
              <Field label="Baud rate">
                <input type="number" value={config.water_level.lidar.baudrate} onChange={(e) => set((d) => { d.water_level.lidar.baudrate = Number(e.target.value) || 115200; })} className={inputClass} />
              </Field>
              <Field label="Mounting height (m)" hint="Sensor height above datum — required for water level">
                <input value={config.water_level.lidar.mounting_height_m ?? ""} onChange={(e) => set((d) => { d.water_level.lidar.mounting_height_m = e.target.value.trim() === "" ? null : Number(e.target.value); })} className={inputClass} />
              </Field>
              <Field label="Datum offset (m)">
                <input type="number" step="0.01" value={config.water_level.lidar.datum_offset_m} onChange={(e) => set((d) => { d.water_level.lidar.datum_offset_m = Number(e.target.value) || 0; })} className={inputClass} />
              </Field>
            </div>
            <Toggle checked={config.water_level.lidar.mock} onChange={(v) => set((d) => { d.water_level.lidar.mock = v; })} label="Mock LiDAR (demo mode only)" />
            <Toggle checked={config.water_level.camera_edge.enabled} onChange={(v) => set((d) => { d.water_level.camera_edge.enabled = v; })} label="Camera water-edge detection" />
          </div>
        </Card>

        <Card title="Communication" subtitle="LoRa / gateway / cloud (final system architecture)">
          <div className="space-y-3">
            <Toggle checked={config.communication.lora.enabled} onChange={(v) => set((d) => { d.communication.lora.enabled = v; })} label="LoRa enabled" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="LoRa serial port" hint="Modem/AT bridge on the Pi Zero LoRa node">
                <input value={config.communication.lora.port ?? ""} onChange={(e) => set((d) => { d.communication.lora.port = e.target.value.trim() === "" ? null : e.target.value.trim(); })} className={inputClass} />
              </Field>
              <Field label="Baud rate">
                <input type="number" value={config.communication.lora.baudrate} onChange={(e) => set((d) => { d.communication.lora.baudrate = Number(e.target.value) || 9600; })} className={inputClass} />
              </Field>
            </div>
            <Field label="Gateway endpoint" hint="Future cloud ingest API receiving packets from the LoRa gateway">
              <input value={config.communication.lora.gateway_endpoint ?? ""} onChange={(e) => set((d) => { d.communication.lora.gateway_endpoint = e.target.value.trim() === "" ? null : e.target.value.trim(); })} placeholder="https://gateway.example.com/ingest" className={inputClass} />
            </Field>
            <Toggle checked={config.communication.lora.mock} onChange={(v) => set((d) => { d.communication.lora.mock = v; })} label="Mock LoRa link (demo mode only)" />
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Architecture: Raspberry Pi → Pi Zero / LoRa node → LoRa → gateway → internet → web backend → dashboard.
              The browser never talks to LoRa hardware directly; the same REST/WebSocket API serves local and remote modes.
            </p>
          </div>
        </Card>

        <Card title="Storage & Overlays">
          <div className="space-y-3">
            <Field label="Database log interval (s)" hint="Minimum time between stored measurements during processing">
              <input type="number" step="0.5" min="0.5" value={config.storage.log_interval_s} onChange={(e) => set((d) => { d.storage.log_interval_s = Number(e.target.value) || 1; })} className={inputClass} />
            </Field>
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
              {(
                [
                  ["roi", "ROI"],
                  ["flow_vectors", "Flow vectors"],
                  ["debris_boxes", "Debris boxes"],
                  ["water_edge", "Water edge"],
                  ["hud", "HUD"],
                ] as [keyof AppConfig["overlays"], string][]
              ).map(([key, label]) => (
                <Toggle key={key} checked={config.overlays[key]} onChange={(v) => set((d) => { d.overlays[key] = v; })} label={label} />
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save All Settings"}
        </Button>
      </div>
    </div>
  );
}
