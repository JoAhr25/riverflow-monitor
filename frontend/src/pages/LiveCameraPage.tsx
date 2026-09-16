import { useCallback, useEffect, useRef, useState } from "react";
import CameraFeed from "../components/CameraFeed";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import StatusDot from "../components/StatusDot";
import { Button, Field, Toggle, inputClass } from "../components/Field";
import { api } from "../services/api";
import { useLive } from "../services/live";
import type { UploadedVideoInfo } from "../types";

type Mode = "upload" | "camera" | "stream";

export default function LiveCameraPage() {
  const { status, refreshStatus } = useLive();
  const [mode, setMode] = useState<Mode>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<UploadedVideoInfo | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [sources, setSources] = useState<{ video_id: string; origin: string; path: string; size_bytes: number }[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [streamUrl, setStreamUrl] = useState("");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [loopVideo, setLoopVideo] = useState(false);
  const [overlays, setOverlays] = useState({ roi: true, flow_vectors: true, debris_boxes: true, water_edge: true, hud: true });
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshSources = useCallback(() => {
    api.listSources().then((s) => setSources(s.sources)).catch(() => setSources([]));
  }, []);

  useEffect(() => {
    refreshSources();
    api
      .getConfig()
      .then((c) => setOverlays(c.overlays))
      .catch(() => undefined);
  }, [refreshSources]);

  const running = status?.processing?.status === "running";

  const doUpload = async (file: File) => {
    setError(null);
    setInfo(null);
    setUploadInfo(null);
    setUploadProgress(0);
    try {
      const result = await api.uploadVideo(file, (loaded, total) => setUploadProgress(Math.round((loaded / total) * 100)));
      setUploadInfo(result);
      refreshSources();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploadProgress(null);
    }
  };

  const start = async (request: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await api.startAnalysis({ ...request, playback_speed: playbackSpeed, loop: loopVideo });
      refreshStatus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await api.stopAnalysis();
      refreshStatus();
      setInfo("Processing stopped.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setOverlay = (key: keyof typeof overlays, value: boolean) => {
    const next = { ...overlays, [key]: value };
    setOverlays(next);
    api.updateConfig({ overlays: next }).catch(() => undefined);
  };

  const sourceInfo = status?.source;
  const processing = status?.processing;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Live Camera"
        description="Development video upload, live Raspberry Pi camera, or remote stream. Overlays are generated from actual processing output."
        actions={
          running ? (
            <Button variant="danger" onClick={stop} disabled={busy}>
              Stop Processing
            </Button>
          ) : (
            <StatusDot status={processing?.status ?? "idle"} label={`Processing: ${processing?.status ?? "idle"}`} />
          )
        }
      />

      {error && <div className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}
      {info && <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{info}</div>}

      {/* Demo mode notice */}
      <div className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
        <span className="font-semibold">🌐 Firebase Demo Mode — </span>
        Upload any river video and click <strong>Start Processing</strong> to launch a simulated analysis session.
        Live charts, metrics, and the camera feed will animate with demo data.
        For real optical-flow processing, connect a Python backend server.
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Camera Feed" className="xl:col-span-2" subtitle={sourceInfo ? `${sourceInfo.mode_label} — ${sourceInfo.label} (${sourceInfo.width}×${sourceInfo.height}${sourceInfo.fps ? ` @ ${sourceInfo.fps.toFixed(0)} fps` : ""})` : "No active source"}>
          <CameraFeed overlays={overlays} />
          {sourceInfo && sourceInfo.frame_count != null && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              {sourceInfo.frame_count} frames · duration {sourceInfo.duration_s?.toFixed(2) ?? "?"} s
            </p>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Source">
            <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              {(
                [
                  ["upload", "Dev Video"],
                  ["camera", "Live Camera"],
                  ["stream", "Stream"],
                ] as [Mode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
                    mode === m ? "bg-white text-sky-700 shadow dark:bg-slate-900 dark:text-sky-300" : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === "upload" && (
              <div className="space-y-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) doUpload(file);
                    e.target.value = "";
                  }}
                />
                <Button onClick={() => fileRef.current?.click()} disabled={running || uploadProgress != null} className="w-full">
                  {uploadProgress != null ? `Uploading… ${uploadProgress}%` : "Upload Video File"}
                </Button>
                {uploadInfo && (
                  <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs dark:border-emerald-800 dark:bg-emerald-950/30">
                    <p className="font-semibold text-emerald-700 dark:text-emerald-300">{uploadInfo.video_id}</p>
                    <p className="mt-1 text-slate-600 dark:text-slate-400">
                      {uploadInfo.width}×{uploadInfo.height} · {uploadInfo.fps?.toFixed(1)} fps · {uploadInfo.frame_count} frames ·{" "}
                      {(uploadInfo.size_bytes / 1e6).toFixed(1)} MB
                    </p>
                    <Button className="mt-2 w-full" disabled={running || busy} onClick={() => start({ source_type: "upload", video_id: uploadInfo.video_id })}>
                      Start Processing
                    </Button>
                  </div>
                )}
                {sources.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Available videos</p>
                    <ul className="max-h-40 space-y-1 overflow-y-auto">
                      {sources.map((s) => (
                        <li key={s.path} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2 py-1 text-xs dark:border-slate-700">
                          <span className="truncate" title={s.video_id}>
                            <span className="text-slate-400">[{s.origin}]</span> {s.video_id}
                          </span>
                          <button
                            className="shrink-0 font-medium text-sky-600 hover:underline dark:text-sky-400"
                            disabled={running || busy}
                            onClick={() =>
                              s.origin === "upload"
                                ? start({ source_type: "upload", video_id: s.video_id })
                                : start({ source_type: "upload", repo_path: s.video_id })
                            }
                          >
                            Start
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {mode === "camera" && (
              <div className="space-y-3">
                <Field label="Camera device index" hint="0 is the default camera (e.g. Raspberry Pi Camera Module via V4L2)">
                  <input type="number" min={0} value={deviceIndex} onChange={(e) => setDeviceIndex(Number(e.target.value))} className={inputClass} />
                </Field>
                <Button className="w-full" disabled={running || busy} onClick={() => start({ source_type: "camera", device_index: deviceIndex })}>
                  Start Live Camera
                </Button>
              </div>
            )}

            {mode === "stream" && (
              <div className="space-y-3">
                <Field label="Stream URL" hint="RTSP or HTTP video stream URL">
                  <input value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} placeholder="rtsp://…" className={inputClass} />
                </Field>
                <Button className="w-full" disabled={running || busy || !streamUrl} onClick={() => start({ source_type: "stream", stream_url: streamUrl })}>
                  Start Stream
                </Button>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
              <Field label="Playback speed">
                <input type="number" min={0.1} step={0.5} value={playbackSpeed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))} className={inputClass} />
              </Field>
              <div className="flex items-end pb-1">
                <Toggle checked={loopVideo} onChange={setLoopVideo} label="Loop video" />
              </div>
            </div>
          </Card>

          <Card title="Overlays">
            <div className="space-y-2.5">
              {(
                [
                  ["roi", "ROI rectangle"],
                  ["flow_vectors", "Flow vectors"],
                  ["debris_boxes", "Debris boxes"],
                  ["water_edge", "Water edge line"],
                  ["hud", "HUD (FPS, motion, status)"],
                ] as [keyof typeof overlays, string][]
              ).map(([key, label]) => (
                <Toggle key={key} checked={overlays[key]} onChange={(v) => setOverlay(key, v)} label={label} />
              ))}
            </div>
          </Card>
        </div>
      </div>

      {processing && processing.message && (
        <Card title="Processing Status">
          <div className="flex items-center gap-3">
            <StatusDot status={processing.status} />
            <span className="text-sm text-slate-600 dark:text-slate-300">{processing.message}</span>
          </div>
          {!sourceInfo && <EmptyState message="No source information." />}
        </Card>
      )}
    </div>
  );
}
