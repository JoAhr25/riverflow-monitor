import { useEffect, useState } from "react";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import StatusDot from "../components/StatusDot";
import { Button, Field, inputClass } from "../components/Field";
import { api } from "../services/api";
import type { CalibrationData, CalibrationSummary } from "../types";

export default function CalibrationPage() {
  const [data, setData] = useState<CalibrationData | null>(null);
  const [summary, setSummary] = useState<CalibrationSummary | null>(null);
  const [scale, setScale] = useState("");
  const [crs, setCrs] = useState("");
  const [refElev, setRefElev] = useState("");
  const [area, setArea] = useState("");
  const [factor, setFactor] = useState("");
  const [gcpCount, setGcpCount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => {
    api
      .getCalibration()
      .then((c) => {
        setData(c.calibration);
        setSummary(c.summary);
        setScale(c.calibration.physical_scale.m_per_px != null ? String(c.calibration.physical_scale.m_per_px) : "");
        setCrs(c.calibration.crs.value ?? "");
        setRefElev(c.calibration.reference_elevation.value_m != null ? String(c.calibration.reference_elevation.value_m) : "");
        setArea(c.calibration.cross_section.area_m2 != null ? String(c.calibration.cross_section.area_m2) : "");
        setFactor(c.calibration.flow_rate.velocity_correction_factor != null ? String(c.calibration.flow_rate.velocity_correction_factor) : "");
        setGcpCount(c.calibration.gcps.count ? String(c.calibration.gcps.count) : "");
      })
      .catch(() => setData(null));
  };

  useEffect(load, []);

  const save = async (partial: Record<string, unknown>, label: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.updateCalibration(partial);
      setSummary(result.summary);
      setMessage(`${label} saved.`);
    } catch (err) {
      setMessage(`Save failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const num = (v: string): number | null => {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isNaN(n) ? null : n;
  };

  const StatusRow = ({ label, configured, value }: { label: string; configured: boolean; value: string }) => (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-0 dark:border-slate-800/60">
      <StatusDot status={configured ? "configured" : "not_configured"} label={label} />
      <span className="text-xs text-slate-500 dark:text-slate-400">{configured ? value : "Not configured"}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calibration"
        description="Physical velocity (m/s) and discharge (m³/s) cannot be derived from image pixels without real calibration. Every field below starts unconfigured and must come from actual field measurements."
      />

      {summary && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${
            summary.velocity_calibrated
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          }`}
        >
          {summary.velocity_calibrated
            ? "CALIBRATED — velocity is reported in m/s and discharge in m³/s."
            : "UNCALIBRATED — flow values are reported in image pixels (px), not physical units."}
        </div>
      )}

      {message && <div className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">{message}</div>}

      <Card title="Calibration Status">
        {summary ? (
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <StatusRow label="Camera Calibration" configured={summary.camera_calibration_file_found} value={summary.camera_calibration_file_found ? "camera_config.json found" : "no camera config file"} />
            <StatusRow label="GCPs" configured={summary.gcps === "configured"} value={`${summary.gcp_count} points`} />
            <StatusRow label="Physical Scale" configured={summary.physical_scale === "configured"} value={summary.m_per_px != null ? `${summary.m_per_px} m/px` : ""} />
            <StatusRow label="CRS" configured={summary.crs !== "not_configured"} value={String(summary.crs)} />
            <StatusRow label="Reference Elevation" configured={summary.reference_elevation !== "not_configured"} value={String(summary.reference_elevation)} />
            <StatusRow label="Cross Section" configured={summary.cross_section === "configured"} value={summary.cross_section_area_m2 != null ? `${summary.cross_section_area_m2} m²` : ""} />
            <StatusRow label="Flow Rate" configured={summary.flow_rate === "calibrated"} value={summary.flow_rate === "calibrated" ? "correction factor set" : ""} />
            <StatusRow label="Discharge Available" configured={summary.discharge_available} value={summary.discharge_available ? "velocity + area + factor" : "missing prerequisites"} />
          </div>
        ) : (
          <EmptyState message="Calibration data unavailable." />
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Physical Scale" subtitle="Uniform meters-per-pixel from field measurement (enables velocity in m/s)">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Field label="Scale (m/px)" hint="e.g. from a known distance between visible reference points: real_width_m / pixel_width_px">
                <input value={scale} onChange={(e) => setScale(e.target.value)} placeholder="e.g. 0.0125" className={inputClass} />
              </Field>
            </div>
            <Button disabled={busy} onClick={() => save({ physical_scale: { m_per_px: num(scale) } }, "Physical scale")}>
              Save
            </Button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Uniform scale is an approximation: it does not correct perspective. Research-grade LSPIV uses GCP-based
            orthorectification (PyORC in the pyorc_env environment). Even with a uniform scale, velocities are labeled
            as uniform-scale approximations.
          </p>
        </Card>

        <Card title="Georeferencing" subtitle="CRS, reference elevation, GCP count">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="CRS">
              <input value={crs} onChange={(e) => setCrs(e.target.value)} placeholder="e.g. EPSG:32735" className={inputClass} />
            </Field>
            <Field label="Reference elevation (m)">
              <input value={refElev} onChange={(e) => setRefElev(e.target.value)} className={inputClass} />
            </Field>
            <Field label="GCP count" hint="4+ points required">
              <input value={gcpCount} onChange={(e) => setGcpCount(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Button
            className="mt-4"
            disabled={busy}
            onClick={() =>
              save(
                {
                  crs: { value: crs.trim() || null },
                  reference_elevation: { value_m: num(refElev) },
                  gcps: { count: gcpCount.trim() ? Math.trunc(Number(gcpCount)) || 0 : 0 },
                },
                "Georeferencing",
              )
            }
          >
            Save Georeferencing
          </Button>
        </Card>

        <Card title="Cross Section & Discharge" subtitle="Required before any m³/s is computed">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Cross-section area (m²)" hint="From real survey data (data/cross_section/)">
              <input value={area} onChange={(e) => setArea(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Velocity correction factor" hint="Surface-to-mean velocity correction (e.g. 0.85) — must be justified for this site">
              <input value={factor} onChange={(e) => setFactor(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Button
            className="mt-4"
            disabled={busy}
            onClick={() =>
              save(
                {
                  cross_section: { area_m2: num(area) },
                  flow_rate: { velocity_correction_factor: num(factor) },
                },
                "Cross-section & discharge",
              )
            }
          >
            Save
          </Button>
          <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Discharge Q = v_surface × A × correction_factor is only computed when all three inputs exist. The 0.85
            factor from the learning example is never applied automatically.
          </p>
        </Card>

        <Card title="PyORC Camera Configuration" subtitle="Full camera calibration file for LSPIV testing">
          <div className="space-y-2 text-sm">
            <p className="text-slate-600 dark:text-slate-300">
              Expected file: <span className="font-mono text-xs">{data?.camera_calibration.camera_config_file ?? "data/config/camera_config.json"}</span>
            </p>
            <StatusDot
              status={summary?.camera_calibration_file_found ? "configured" : "not_configured"}
              label={summary?.camera_calibration_file_found ? "camera_config.json found" : "camera config file not found"}
            />
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              The complete camera configuration (GCPs, CRS, camera matrix, reference elevation) is prepared in the
              research workflow and used by PyORC inside pyorc_env for LSPIV testing, calibration and validation. The
              webapp reads its presence to report calibration status.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
