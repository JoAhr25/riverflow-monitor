export default function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-end gap-3">
        <span aria-hidden="true" className="mb-0.5 h-8 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-accent-500 to-brand-700" />
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
