import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import LiveChart, { type ChartPoint } from "../components/LiveChart";
import PageHeader from "../components/PageHeader";
import { Button } from "../components/Field";
import { api } from "../services/api";
import type { HistoryRow } from "../types";

const RANGES = [
  { label: "15 min", hours: 0.25 },
  { label: "1 h", hours: 1 },
  { label: "6 h", hours: 6 },
  { label: "24 h", hours: 24 },
  { label: "7 d", hours: 168 },
  { label: "30 d", hours: 720 },
];

/* Downsample long series so charts stay responsive with large history windows */
function decimate(points: ChartPoint[], maxPoints = 1200): ChartPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

export default function HistoryPage() {
  const [hours, setHours] = useState(24);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (h: number) => {
      setLoading(true);
      setError(null);
      api
        .getHistory(h, 10000)
        .then((r) => setRows(r.rows))
        .catch((err) => setError((err as Error).message))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    load(hours);
  }, [hours, load]);

  const series = useMemo(() => {
    const build = (pick: (r: HistoryRow) => number | null): ChartPoint[] =>
      decimate(
        rows
          .map((r) => {
            const v = pick(r);
            const t = new Date(r.timestamp).getTime();
            return v == null || Number.isNaN(t) ? null : { t, v };
          })
          .filter((p): p is ChartPoint => p !== null),
      );
    return {
      water: build((r) => r.water_level),
      velocity: build((r) => r.surface_velocity),
      motion: build((r) => r.image_motion),
      debris: build((r) => r.debris_count),
    };
  }, [rows]);

  const exportCsv = () => {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => JSON.stringify((r as unknown as Record<string, unknown>)[h] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `riverflow_history_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayRows = rows.slice(-200).reverse();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Historical Data"
        description="Timestamped measurements from the local SQLite database. Data source is identical whether measurements arrive from local processing or (later) the LoRa gateway."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => setHours(r.hours)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              hours === r.hours
                ? "bg-brand-600 text-white"
                : "border border-slate-300 text-slate-600 hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-brand-500 dark:hover:text-sky-300"
            }`}
          >
            {r.label}
          </button>
        ))}
        <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
          {loading ? "Loading…" : `${rows.length} measurements`}
        </span>
      </div>

      {error && <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Water Level" subtitle="m (LiDAR)">
          <LiveChart data={series.water} unit="m" color="#29AEC9" height={200} />
        </Card>
        <Card title="Surface Velocity" subtitle="m/s — only present when calibrated">
          {series.velocity.length === 0 ? (
            <EmptyState message="No calibrated velocity in this window." hint="Configure calibration to record m/s values." />
          ) : (
            <LiveChart data={series.velocity} unit="m/s" color="#34d399" height={200} />
          )}
        </Card>
        <Card title="Image-Space Motion" subtitle="px (uncalibrated optical flow)">
          <LiveChart data={series.motion} unit="px" color="#f59e0b" height={200} />
        </Card>
        <Card title="Debris Count" subtitle="detections per stored measurement">
          <LiveChart data={series.debris} color="#fb7185" height={200} />
        </Card>
      </div>

      <Card title="Measurement Log" subtitle="Most recent 200 stored rows">
        {displayRows.length === 0 ? (
          <EmptyState message="No data available." />
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                <tr>
                  {["Timestamp", "Water Lvl (m)", "Velocity", "Motion (px)", "Dir (°)", "Debris", "Source", "LiDAR", "LoRa"].map((h) => (
                    <th key={h} className="px-2.5 py-2 font-semibold text-slate-600 dark:text-slate-300">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {displayRows.map((r) => (
                  <tr key={r.timestamp} className="border-t border-slate-100 dark:border-slate-800/60">
                    <td className="px-2.5 py-1.5">{r.timestamp?.replace("T", " ")}</td>
                    <td className="px-2.5 py-1.5">{r.water_level != null ? r.water_level.toFixed(3) : "—"}</td>
                    <td className="px-2.5 py-1.5">{r.surface_velocity != null ? `${r.surface_velocity} ${r.velocity_unit ?? ""}` : "—"}</td>
                    <td className="px-2.5 py-1.5">{r.image_motion != null ? r.image_motion.toFixed(2) : "—"}</td>
                    <td className="px-2.5 py-1.5">{r.direction_deg != null ? r.direction_deg.toFixed(0) : "—"}</td>
                    <td className="px-2.5 py-1.5">{r.debris_count ?? "—"}</td>
                    <td className="px-2.5 py-1.5">{r.source ?? "—"}</td>
                    <td className="px-2.5 py-1.5">{r.lidar_status ?? "—"}</td>
                    <td className="px-2.5 py-1.5">{r.lora_status ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
