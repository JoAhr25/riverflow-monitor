import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../components/Card";
import Compass from "../components/Compass";
import EmptyState from "../components/EmptyState";
import LiveChart from "../components/LiveChart";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import { useChartSeries, useLive } from "../services/live";
import { api } from "../services/api";
import type { CalibrationSummary } from "../types";

export default function FlowAnalysisPage() {
  const { latest } = useLive();
  const motionSeries = useChartSeries("image_motion");
  const velocitySeries = useChartSeries("surfaceVelocity");
  const [calibration, setCalibration] = useState<CalibrationSummary | null>(null);

  useEffect(() => {
    api.getCalibration().then((c) => setCalibration(c.summary)).catch(() => setCalibration(null));
  }, []);

  const flow = latest?.flow ?? null;
  const camera = latest?.camera;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Flow Analysis"
        description="Continuous surface-motion monitoring of the visible water surface. Optical-flow results are image-space measurements (px); calibrated velocity requires camera calibration."
      />

      {!flow && (
        <EmptyState
          message="No flow measurement available."
          hint="Upload a video or connect a camera and start processing."
          action={
            <Link to="/live-camera" className="text-sm font-medium text-sky-600 hover:underline dark:text-sky-400">
              Go to Live Camera →
            </Link>
          }
        />
      )}

      {flow && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label={flow.calibrated ? "Surface Velocity" : "Avg Surface Motion"}
              value={flow.calibrated && flow.value != null ? flow.value.toFixed(2) : (flow.image_motion?.toFixed(2) ?? "--")}
              unit={flow.calibrated ? "m/s" : "px"}
              status={flow.calibrated ? "calibrated" : "limited"}
              accent={flow.calibrated ? "emerald" : "amber"}
              sub={flow.status}
            />
            <MetricCard label="Motion X" value={flow.motion_x != null ? flow.motion_x.toFixed(3) : "--"} unit="px" accent="sky" sub="Rightward positive" />
            <MetricCard label="Motion Y" value={flow.motion_y != null ? flow.motion_y.toFixed(3) : "--"} unit="px" accent="sky" sub="Downward positive" />
            <MetricCard
              label="Vector Coverage"
              value={flow.coverage != null ? `${(flow.coverage * 100).toFixed(0)}` : "--"}
              unit="%"
              accent="sky"
              sub="ROI grid cells with motion above threshold"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card title="Direction & Method" className="lg:col-span-1">
              <div className="flex items-center justify-around">
                <Compass directionDeg={flow.direction_deg} size={110} />
                <dl className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Method</dt>
                    <dd className="font-medium">{flow.method === "farneback" ? "Farneback optical flow" : "Block PIV (LSPIV-style)"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Frame interval</dt>
                    <dd className="font-medium">{flow.frame_interval ?? "--"} frames</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Source FPS</dt>
                    <dd className="font-medium">{flow.source_fps?.toFixed(1) ?? "--"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Proc FPS</dt>
                    <dd className="font-medium">{camera?.fps?.toFixed(1) ?? "--"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">Bearing</dt>
                    <dd className="font-medium">{flow.direction_deg?.toFixed(1) ?? "--"}° (image space)</dd>
                  </div>
                </dl>
              </div>
            </Card>

            <Card
              title={flow.calibrated ? "Velocity History" : "Image-Space Motion History"}
              className="lg:col-span-2"
              subtitle={flow.calibrated ? "Calibrated (uniform scale approximation)" : "Mean displacement per measurement interval (px) — NOT m/s"}
            >
              <LiveChart data={flow.calibrated ? velocitySeries : motionSeries} unit={flow.calibrated ? "m/s" : "px"} height={260} />
            </Card>
          </div>

          <Card title="Calibration State">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Physical Scale</p>
                <p className="mt-1 font-medium">{calibration?.physical_scale === "configured" ? `Configured (${calibration?.m_per_px} m/px)` : "Not configured"}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Velocity</p>
                <p className="mt-1 font-medium">{flow.calibrated ? "Calibrated" : "Image-space only"}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Discharge</p>
                <p className="mt-1 font-medium">{calibration?.discharge_available ? "Available (needs cross-section + correction factor)" : "Not calibrated"}</p>
              </div>
            </div>
            {!flow.calibrated && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                Scientific rule: pixel displacement is never silently converted to m/s. Configure a real physical scale
                (m/px) from field measurements to enable calibrated velocity. Discharge additionally requires a
                cross-section area and a justified velocity correction factor.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
