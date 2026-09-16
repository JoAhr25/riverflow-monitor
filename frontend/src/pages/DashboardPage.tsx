import { Link } from "react-router-dom";
import CameraFeed from "../components/CameraFeed";
import Card from "../components/Card";
import Compass, { directionLabel } from "../components/Compass";
import EmptyState from "../components/EmptyState";
import LiveChart from "../components/LiveChart";
import MetricCard from "../components/MetricCard";
import StatusList from "../components/StatusList";
import { useChartSeries, useLive } from "../services/live";

export default function DashboardPage() {
  const { latest, status } = useLive();
  const motionSeries = useChartSeries("image_motion");
  const velocitySeries = useChartSeries("surfaceVelocity");
  const waterSeries = useChartSeries("waterLevel");
  const debrisSeries = useChartSeries("debris");

  const loading = status == null;
  const flow = latest?.flow ?? null;
  const water = latest?.water_level ?? null;
  const debris = latest?.debris ?? null;
  const lidarStatus = latest?.lidar_status ?? status?.components?.lidar?.status ?? "offline";

  const chip = (text: string) => (
    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {text}
    </span>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Overview</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500 dark:text-slate-400">
          <div>
            Source: <span className="font-medium text-slate-700 dark:text-slate-200">{status?.source?.mode_label ?? "No source"}</span>
          </div>
          <div className="mt-0.5">
            Camera FPS: <span className="font-mono">{latest?.camera?.fps != null ? latest.camera.fps.toFixed(1) : "--"}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card title="Live River Camera" className="xl:col-span-2" subtitle="Overlays (ROI, flow vectors, detections) are generated from actual processing">
          <CameraFeed />
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-emerald-400" /> ROI</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-yellow-400" /> Flow vectors</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-rose-400" /> Debris boxes</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-orange-400" /> Water edge</span>
          </div>
        </Card>

        <Card title="System Status" subtitle="Backend health checks">
          {status ? <StatusList components={status.components} /> : <EmptyState message="Backend status unavailable." />}
        </Card>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="h-3 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="mt-3 h-8 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="mt-3 h-3 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Water Level"
            value={water?.value != null ? water.value.toFixed(3) : "--"}
            unit={water?.value != null ? "m" : undefined}
            status={lidarStatus}
            accent="sky"
            sub={
              water?.value != null
                ? `LiDAR distance ${water.distance_m?.toFixed(2) ?? "--"} m${water.mock ? " (DEMO/MOCK)" : ""}`
                : water
                  ? "LiDAR offline or mounting height not configured"
                  : "No water-level source"
            }
          />
          <MetricCard
            label={flow?.calibrated ? "Surface Velocity" : "Surface Motion"}
            value={
              flow == null
                ? "--"
                : flow.calibrated && flow.value != null
                  ? flow.value.toFixed(2)
                  : flow.image_motion != null
                    ? flow.image_motion.toFixed(2)
                    : "--"
            }
            unit={flow?.calibrated ? "m/s" : flow ? "px" : undefined}
            status={flow ? (flow.calibrated ? "calibrated" : "limited") : "idle"}
            accent={flow?.calibrated ? "emerald" : "amber"}
            sub={
              flow == null
                ? "Start processing to measure motion"
                : flow.calibrated
                  ? flow.status
                  : "Image-space measurement (uncalibrated). NOT m/s."
            }
          />
          <MetricCard
            label="Debris Detected"
            value={debris != null ? String(debris.count) : "--"}
            status={status?.components?.debris_ai?.status}
            accent="rose"
            sub={
              debris
                ? debris.tracked_total > 0
                  ? `${debris.tracked_total} unique tracked objects this session`
                  : "Per-frame detections; unique tracking accumulates during processing"
                : "No debris data"
            }
          />
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">Flow Direction</span>
            <div className="mt-1 flex items-center justify-between">
              <Compass directionDeg={flow?.direction_deg} size={72} />
              <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                <div>Image-space bearing</div>
                <div className="mt-1 font-mono text-slate-700 dark:text-slate-200">
                  X {flow?.motion_x != null ? flow.motion_x.toFixed(2) : "--"} px · Y {flow?.motion_y != null ? flow.motion_y.toFixed(2) : "--"} px
                </div>
                <div className="mt-1">{flow ? directionLabel(flow.direction_deg) : "--"}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!flow?.calibrated && flow && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Physical velocity is unavailable: <strong>calibration is not configured</strong>. Values above are image-space
          pixel measurements and must not be interpreted as m/s.{" "}
          <Link to="/calibration" className="font-semibold underline">
            Configure calibration
          </Link>
        </div>
      )}

      <Card
        title={flow?.calibrated ? "Flow Velocity History" : "Image-Space Motion History"}
        subtitle={flow?.calibrated ? "Calibrated surface velocity (m/s)" : "Mean optical-flow displacement per measurement interval (px)"}
        actions={chip(
          flow
            ? flow.calibrated && flow.value != null
              ? `${flow.value.toFixed(2)} m/s`
              : `${flow.image_motion?.toFixed(2) ?? "--"} px`
            : "no data",
        )}
      >
        <LiveChart data={flow?.calibrated ? velocitySeries : motionSeries} unit={flow?.calibrated ? "m/s" : "px"} color="#38bdf8" height={240} />
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card
          title="Water Level History"
          subtitle="TF-Luna LiDAR (primary sensor)"
          actions={chip(water?.value != null ? `${water.value.toFixed(3)} m` : "no data")}
        >
          <LiveChart data={waterSeries} unit="m" color="#34d399" />
        </Card>
        <Card
          title="Debris Detections"
          subtitle="Detections per frame"
          actions={chip(debris != null ? `${debris.count}` : "no data")}
        >
          <LiveChart data={debrisSeries} color="#fb7185" />
        </Card>
      </div>
    </div>
  );
}
