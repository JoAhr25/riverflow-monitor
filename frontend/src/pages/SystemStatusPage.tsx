import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import PageHeader from "../components/PageHeader";
import StatusList from "../components/StatusList";
import { useLive } from "../services/live";

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

export default function SystemStatusPage() {
  const { status, latest, connected } = useLive();

  if (!status) {
    return (
      <div className="space-y-5">
        <PageHeader title="System Status" description="Backend subsystem health checks." />
        <EmptyState message="Backend status unavailable." hint="Start the backend: python webapp/backend/main.py" />
      </div>
    );
  }

  const detailRows: [string, string][] = [
    ["Uptime", formatUptime(status.uptime_s)],
    ["WebSocket clients", String(status.websocket_clients)],
    ["WebSocket (this browser)", connected ? "connected" : "disconnected"],
    ["Demo mode", status.demo_mode ? "ACTIVE (mock values flagged)" : "off"],
    ["PyORC (webapp env)", status.pyorc.available ? `available (v${status.pyorc.version})` : "not installed"],
    ["Latest measurement", latest?.timestamp ?? "none"],
    ["Data path", status.components.storage.detail],
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="System Status"
        description="Live health checks reported by the backend. Cloud ingest is a planned extension point: the architecture is Pi → LoRa → gateway → cloud backend → dashboard, with the same API for local and remote modes."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Components" subtitle="Actual backend health checks">
          <StatusList components={status.components} />
        </Card>

        <Card title="Details">
          <dl className="space-y-2.5 text-sm">
            {detailRows.map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800/60">
                <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                <dd className="max-w-[60%] text-right font-mono text-xs break-words text-slate-700 dark:text-slate-200">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {Object.entries(status.components).map(([key, comp]) => (
          <Card key={key} title={key.replace(/_/g, " ")}>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{comp.detail || "No detail available."}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
