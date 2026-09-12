import StatusDot from "./StatusDot";

export default function MetricCard({
  label,
  value,
  unit,
  sub,
  status,
  accent = "sky",
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: React.ReactNode;
  status?: string;
  accent?: "sky" | "emerald" | "amber" | "rose" | "violet";
}) {
  const accents: Record<string, string> = {
    sky: "text-sky-600 dark:text-sky-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
    violet: "text-violet-600 dark:text-violet-400",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">{label}</span>
        {status && <StatusDot status={status} />}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`text-3xl font-bold tabular-nums ${accents[accent]}`}>{value}</span>
        {unit && <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{unit}</span>}
      </div>
      {sub && <div className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}
