import StatusDot from "./StatusDot";

const LABELS: Record<string, string> = {
  camera: "Camera",
  lidar: "LiDAR (TF-Luna)",
  flow_processing: "Flow Processing",
  debris_ai: "Debris AI",
  storage: "Storage",
  lora: "LoRa",
  cloud: "Cloud",
};

export default function StatusList({ components }: { components: Record<string, { status: string; detail: string; mock?: boolean }> }) {
  return (
    <ul className="space-y-2.5">
      {Object.entries(components).map(([key, comp]) => (
        <li key={key} className="flex items-start justify-between gap-3">
          <StatusDot status={comp.status} label={LABELS[key] ?? key} />
          <span className="max-w-[60%] truncate text-right text-xs text-slate-500 dark:text-slate-400" title={comp.detail}>
            {comp.mock ? "DEMO/MOCK" : comp.status.replace(/_/g, " ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
