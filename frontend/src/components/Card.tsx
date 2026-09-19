export default function Card({
  title,
  subtitle,
  actions,
  className = "",
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-md border border-slate-200/90 bg-white dark:border-slate-800/80 dark:bg-slate-900/50 ${className}`}>
      {(title || actions) && (
        <header className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-2.5">
          <div>
            {title && <h2 className="micro-label text-brand-600! dark:text-sky-400!">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-slate-400 dark:text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}
