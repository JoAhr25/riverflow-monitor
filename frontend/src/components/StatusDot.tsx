const COLOR_MAP: Record<string, string> = {
  online: "bg-emerald-500",
  running: "bg-emerald-500",
  ready: "bg-emerald-500",
  available: "bg-emerald-500",
  connected: "bg-emerald-500",
  valid: "bg-emerald-500",
  calibrated: "bg-emerald-500",
  configured: "bg-emerald-500",
  idle: "bg-slate-400",
  stopped: "bg-slate-400",
  not_configured: "bg-amber-500",
  not_connected: "bg-slate-400",
  offline: "bg-rose-500",
  error: "bg-rose-500",
  disabled: "bg-slate-400",
  library_missing: "bg-amber-500",
  limited: "bg-amber-500",
  mock: "bg-fuchsia-500",
  completed: "bg-sky-500",
};

export default function StatusDot({ status, label }: { status: string; label?: string }) {
  const color = COLOR_MAP[status] ?? "bg-slate-400";
  const pulse = status === "running" || status === "online" || status === "connected";
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="relative flex h-2.5 w-2.5">
        {pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${color}`} />}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
      </span>
      {label && <span className="text-slate-700 dark:text-slate-300">{label}</span>}
    </span>
  );
}
