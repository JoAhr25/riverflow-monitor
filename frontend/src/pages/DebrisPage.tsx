import { useEffect, useState } from "react";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import LiveChart from "../components/LiveChart";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import StatusDot from "../components/StatusDot";
import { api } from "../services/api";
import { useChartSeries, useLive } from "../services/live";
import type { DebrisDetection } from "../types";

interface DebrisResponse {
  detector: { status: string; detail: string; model_path: string | null; confidence_threshold: number; classes: string[]; enabled: boolean };
  count: number;
  tracked_total: number;
  active_tracks: number;
  detections: DebrisDetection[];
  tracker?: { unique_total: number; active_tracks: number; note: string };
}

export default function DebrisPage() {
  const { latest } = useLive();
  const debrisSeries = useChartSeries("debris");
  const [data, setData] = useState<DebrisResponse | null>(null);

  useEffect(() => {
    const load = () => api.getDebris().then((d) => setData(d as unknown as DebrisResponse)).catch(() => setData(null));
    load();
    const id = window.setInterval(load, 3000);
    return () => window.clearInterval(id);
  }, []);

  const detector = data?.detector;
  const liveDebris = latest?.debris;
  const detections = liveDebris?.detections ?? data?.detections ?? [];
  const modelConfigured = detector?.status === "ready";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Debris Detection"
        description="AI-based floating debris detection on the camera stream. Detections are never fabricated: without a trained model the detector reports its real state."
      />

      {!modelConfigured && detector && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <p className="font-semibold">AI Debris Detection — Model not configured</p>
          <p className="mt-1 text-xs leading-relaxed">
            {detector.detail} Configure a trained YOLO model path and confidence threshold in{" "}
            <a href="/settings" className="underline">
              Settings → Debris AI
            </a>
            . The pipeline, bounding-box overlays, counting and tracking are already implemented and will activate
            automatically once a model is provided.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Current Frame Detections"
          value={liveDebris != null ? String(liveDebris.count) : "--"}
          status={detector?.status}
          accent="rose"
          sub={modelConfigured ? `Confidence threshold ${(detector.confidence_threshold * 100).toFixed(0)}%` : "Detector inactive"}
        />
        <MetricCard
          label="Unique Tracked Objects"
          value={liveDebris != null ? String(liveDebris.tracked_total) : "--"}
          accent="amber"
          sub="Centroid tracking distinguishes unique debris from repeated per-frame detections"
        />
        <MetricCard
          label="Active Tracks"
          value={liveDebris != null ? String(liveDebris.active_tracks) : "--"}
          accent="sky"
          sub="Objects currently visible in consecutive frames"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Detector Status" subtitle="Model loading architecture">
          {detector ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300">Status</span>
                <StatusDot status={detector.status} label={detector.status.replace(/_/g, " ")} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600 dark:text-slate-300">Model</span>
                <span className="truncate text-xs font-mono text-slate-500 dark:text-slate-400" title={detector.model_path ?? ""}>
                  {detector.model_path ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300">Classes</span>
                <span className="text-xs">{detector.classes.join(", ") || "—"}</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{detector.detail}</p>
            </div>
          ) : (
            <EmptyState message="Detector info unavailable." />
          )}
        </Card>

        <Card title="Detections" subtitle="Bounding boxes in the current frame" className="lg:col-span-2">
          {detections.length === 0 ? (
            <EmptyState
              message={modelConfigured ? "No debris detected in the current frame." : "No detections — detector not active."}
              hint={modelConfigured ? undefined : "Detections appear here once a trained model is configured."}
            />
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {detections.map((det, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm dark:border-rose-900 dark:bg-rose-950/30">
                  <span className="font-semibold text-rose-700 uppercase dark:text-rose-300">{det.class}</span>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    x {det.x.toFixed(0)} · y {det.y.toFixed(0)} · w {det.width.toFixed(0)} · h {det.height.toFixed(0)}
                  </span>
                  <span className="rounded bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">{(det.confidence * 100).toFixed(0)}%</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Debris Detections Over Time" subtitle="Detections per frame (unique tracked objects accumulate separately)">
        <LiveChart data={debrisSeries} color="#fb7185" height={240} />
      </Card>
    </div>
  );
}
