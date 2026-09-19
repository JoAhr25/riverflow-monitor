import { useCallback, useEffect, useMemo, useState } from "react";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import LiveChart from "../components/LiveChart";
import PageHeader from "../components/PageHeader";
import { Button } from "../components/Field";
import { decimate, summarize, type ChartPoint } from "../utils/chart";
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
function build(points: ChartPoint[]): ChartPoint[] {
  return decimate(points);
}

export default function HistoryPage() {
  const [hours, setHours] = useState(24);
  const [compareHours, setCompareHours] = useState<number | null>(null);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [compareRows, setCompareRows] = useState<HistoryRow[]>([]);
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

  useEffect(() => {
    if (compareHours == null) {
      setCompareRows([]);
      return;
    }
    api
      .getHistory(compareHours, 10000)
      .then((r) => setCompareRows(r.rows))
      .catch(() => setCompareRows([]));
  }, [compareHours]);

  const series = useMemo(() => {
    const from = (source: HistoryRow[], pick: (r: HistoryRow) => number | null): ChartPoint[] =>
      build(
        source
          .map((r) => {
            const v = pick(r);
            const t = new Date(r.timestamp).getTime();
            return v == null || Number.isNaN(t) ? null : { t, v };
          })
          .filter((p): p is ChartPoint => p !== null),
      );
    const pickFrom = (pick: (r: HistoryRow) => number | null) => ({
      main: from(rows, pick),
      compare: from(compareRows, pick),
    });
    return {
      water: pickFrom((r) => r.water_level),
      velocity: pickFrom((r) => r.surface_velocity),
      motion: pickFrom((r) => r.image_motion),
      debris: pickFrom((r) => r.debris_count),
    };
  }, [rows, compareRows]);

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

  const rangeLabel = RANGES.find((r) => r.hours === hours)?.label ?? `${hours} h`;
  const compareLabel = compareHours != null ? RANGES.find((r) => r.hours === compareHours)?.label ?? `${compareHours} h` : "";

  const printReport = () => {
    const metrics: [string, (number | null | undefined)[]][] = [
      ["Water level (m)", rows.map((r) => r.water_level)],
      ["Surface velocity (m/s)", rows.map((r) => r.surface_velocity)],
      ["Image motion (px)", rows.map((r) => r.image_motion)],
      ["Debris count", rows.map((r) => r.debris_count)],
    ];
    const fmt = (n: number) => Number(n.toFixed(3)).toString();
    const rowsHtml = metrics
      .map(([label, vals]) => {
        const s = summarize(vals);
        return `<tr><td>${label}</td><td>${s ? s.count : 0}</td><td>${s ? fmt(s.min) : "—"}</td><td>${s ? fmt(s.max) : "—"}</td><td>${s ? fmt(s.mean) : "—"}</td></tr>`;
      })
      .join("");
    const first = rows[0]?.timestamp ?? "—";
    const last = rows[rows.length - 1]?.timestamp ?? "—";
    const w = window.open("", "_blank", "width=820,height=680");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>RiverFlow Monitor — History Report</title><style>body{font-family:'Segoe UI',system-ui,sans-serif;color:#122E39;padding:34px}h1{font-size:20px;margin:0 0 4px}p.meta{color:#548491;font-size:12px;margin:0 0 22px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #D7E9EC;padding:6px 10px;text-align:left}th{background:#EAF4F6;font-size:11px;text-transform:uppercase;letter-spacing:.06em}td:nth-child(n+2){font-family:Consolas,monospace}.foot{margin-top:26px;color:#548491;font-size:11px;line-height:1.5}</style></head><body><h1>RiverFlow Monitor — History Report</h1><p class="meta">Range: last ${rangeLabel}${compareHours != null ? ` (compared with ${compareLabel})` : ""} · ${rows.length} measurements · ${first} → ${last}</p><table><tr><th>Metric</th><th>Samples</th><th>Min</th><th>Max</th><th>Mean</th></tr>${rowsHtml}</table><p class="foot">Generated from stored SQLite measurements. Values appear exactly as recorded; rows logged while demo mode was active originate from clearly-labeled simulated sessions.</p></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const displayRows = rows.slice(-200).reverse();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Historical Data"
        description="Timestamped measurements from the local SQLite database. Data source is identical whether measurements arrive from local processing or (later) the LoRa gateway."
        actions={
          <>
            <Button variant="secondary" onClick={printReport} disabled={rows.length === 0}>
              Print Report
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
              Export CSV
            </Button>
          </>
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

      <div className="flex flex-wrap items-center gap-2">
        <span className="micro-label">Compare with</span>
        <button
          onClick={() => setCompareHours(null)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
            compareHours == null ? "bg-slate-600 text-white" : "border border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
          }`}
        >
          Off
        </button>
        {RANGES.filter((r) => r.hours !== hours).map((r) => (
          <button
            key={r.label}
            onClick={() => setCompareHours(r.hours)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
              compareHours === r.hours
                ? "bg-slate-600 text-white"
                : "border border-slate-300 text-slate-500 hover:border-slate-500 dark:border-slate-700 dark:text-slate-400"
            }`}
          >
            {r.label}
          </button>
        ))}
        <span className="text-[11px] text-slate-400 dark:text-slate-500">dashed line on each chart</span>
      </div>

      {error && <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Water Level" subtitle={`m (LiDAR)${compareLabel ? ` · dashed = ${compareLabel}` : ""}`}>
          <LiveChart data={series.water.main} compare={compareHours != null ? series.water.compare : undefined} compareLabel={compareLabel} unit="m" color="#29AEC9" height={200} />
        </Card>
        <Card title="Surface Velocity" subtitle="m/s — only present when calibrated">
          {series.velocity.main.length === 0 ? (
            <EmptyState message="No calibrated velocity in this window." hint="Configure calibration to record m/s values." />
          ) : (
            <LiveChart data={series.velocity.main} compare={compareHours != null ? series.velocity.compare : undefined} compareLabel={compareLabel} unit="m/s" color="#34d399" height={200} />
          )}
        </Card>
        <Card title="Image-Space Motion" subtitle={`px (uncalibrated optical flow)${compareLabel ? ` · dashed = ${compareLabel}` : ""}`}>
          <LiveChart data={series.motion.main} compare={compareHours != null ? series.motion.compare : undefined} compareLabel={compareLabel} unit="px" color="#f59e0b" height={200} />
        </Card>
        <Card title="Debris Count" subtitle={`detections per stored measurement${compareLabel ? ` · dashed = ${compareLabel}` : ""}`}>
          <LiveChart data={series.debris.main} compare={compareHours != null ? series.debris.compare : undefined} compareLabel={compareLabel} color="#fb7185" height={200} />
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
