import { useCallback, useEffect, useState } from "react";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import LiveChart from "../components/LiveChart";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import StatusDot from "../components/StatusDot";
import { Field, Button, inputClass } from "../components/Field";
import { api } from "../services/api";
import { useChartSeries } from "../services/live";
import type { WaterLevelPageData } from "../types";

export default function WaterLevelPage() {
  const waterSeries = useChartSeries("waterLevel");
  const [data, setData] = useState<WaterLevelPageData | null>(null);
  const [mountingHeight, setMountingHeight] = useState("");
  const [datumOffset, setDatumOffset] = useState("0");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.getWaterLevel().then(setData).catch(() => setData(null));
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 3000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    api
      .getConfig()
      .then((c) => {
        setMountingHeight(c.water_level.lidar.mounting_height_m != null ? String(c.water_level.lidar.mounting_height_m) : "");
        setDatumOffset(String(c.water_level.lidar.datum_offset_m ?? 0));
      })
      .catch(() => undefined);
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const height = mountingHeight.trim() === "" ? null : Number(mountingHeight);
      await api.updateConfig({
        water_level: {
          lidar: {
            mounting_height_m: height != null && !Number.isNaN(height) ? height : null,
            datum_offset_m: Number(datumOffset) || 0,
          },
        },
      });
      setMessage("Water-level conversion saved.");
      refresh();
    } catch (err) {
      setMessage(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const primary = data?.primary;
  const cue = data?.camera_cue;
  const fusion = data?.fusion;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Water Level"
        description="Primary measurement: Benewake TF-Luna ToF LiDAR. The camera water-edge detector provides an independent supplementary visual cue."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="LiDAR Water Level"
          value={primary?.water_level_m != null ? primary.water_level_m.toFixed(3) : "--"}
          unit={primary?.water_level_m != null ? "m" : undefined}
          status={primary?.status ?? "offline"}
          accent="sky"
          sub={
            primary?.status === "mock"
              ? "DEMO/MOCK simulated reading — not a real measurement"
              : primary
                ? primary.mounting_height_configured
                  ? primary.message
                  : "Mounting height not configured — only raw distance is available"
                : "Sensor offline"
          }
        />
        <MetricCard
          label="Sensor Distance"
          value={primary?.distance_m != null ? primary.distance_m.toFixed(3) : "--"}
          unit={primary?.distance_m != null ? "m" : undefined}
          status={primary?.status ?? "offline"}
          accent="sky"
          sub="Raw TF-Luna ToF distance to water surface"
        />
        <MetricCard
          label="Camera Water Edge"
          value={cue?.detected ? "Detected" : "Not detected"}
          status={cue?.detected ? "online" : "idle"}
          accent="amber"
          sub={cue?.detected ? `Experimental visual cue (confidence ${(cue.confidence * 100).toFixed(0)}%) — LiDAR is the primary measurement` : cue?.message}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card title="Sensor Fusion" subtitle="LiDAR (primary) + camera edge (visual cue)">
          {fusion ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-300">LiDAR</span>
                <StatusDot status={primary?.status === "online" ? "online" : primary?.status === "mock" ? "mock" : "offline"} label={primary?.status ?? "offline"} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-300">Camera edge</span>
                <StatusDot status={cue?.detected ? "online" : "idle"} label={cue?.detected ? "detected" : "not detected"} />
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Fusion</span>
                <StatusDot status={fusion.status} label={fusion.status} />
              </div>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{fusion.detail}</p>
              <p className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                {cue?.message}
              </p>
            </div>
          ) : (
            <EmptyState message="Fusion data unavailable." />
          )}
        </Card>

        <Card title="Water-Level Conversion" subtitle="water_level = mounting_height − distance + datum_offset" className="lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Sensor mounting height (m)"
              hint="Vertical distance from the TF-Luna to the reference datum. Measure on site — do not guess."
            >
              <input value={mountingHeight} onChange={(e) => setMountingHeight(e.target.value)} placeholder="e.g. 3.55" className={inputClass} />
            </Field>
            <Field label="Datum offset (m)" hint="Optional offset applied to the computed level (e.g. gauge zero correction).">
              <input value={datumOffset} onChange={(e) => setDatumOffset(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save Conversion"}
            </Button>
            {message && <span className="text-xs text-slate-500 dark:text-slate-400">{message}</span>}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            The LiDAR is the primary ranging measurement. Without a configured mounting height the system reports only
            the raw distance and never invents a water level.
          </p>
        </Card>
      </div>

      <Card title="Water Level History" subtitle="LiDAR-derived water level over time">
        <LiveChart data={waterSeries} unit="m" color="#34d399" height={240} />
      </Card>
    </div>
  );
}
