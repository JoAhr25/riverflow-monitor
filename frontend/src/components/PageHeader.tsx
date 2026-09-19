import { useEffect } from "react";

export default function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  useEffect(() => {
    document.title = `${title} · RiverFlow Monitor`;
    return () => {
      document.title = "RiverFlow Monitor — Non-Contact River Monitoring";
    };
  }, [title]);

  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="micro-label mb-1">RiverFlow</div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-slate-400 dark:text-slate-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
