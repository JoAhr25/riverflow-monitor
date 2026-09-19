import StatusDot from "./StatusDot";

export default function MetricCard({
  label,
  value,
  unit,
  sub,
  status,
  accent = "brand",
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: React.ReactNode;
  status?: string;
  accent?: "brand" | "sky" | "emerald" | "amber" | "rose";
}) {
  const accents: Record<string, string> = {
    brand: "text-brand-700 dark:text-sky-300",
    sky: "text-sky-700 dark:text-sky-300",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
  };
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="micro-label">{label}</span>
        {status && <StatusDot status={status} />}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`metric-value text-[2rem] ${accents[accent]}`}>{value}</span>
        {unit && <span className="text-xs font-normal text-slate-400 dark:text-slate-500">{unit}</span>}
      </div>
      {sub && <div className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400 dark:text-slate-500">{sub}</div>}
    </div>
  );
}
