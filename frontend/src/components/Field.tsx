export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="micro-label mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-slate-400 dark:text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/25 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-600";

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const variants = {
    primary:
      "bg-brand-600 text-white hover:bg-brand-500 active:bg-brand-700 disabled:bg-slate-300 dark:disabled:bg-slate-700",
    secondary:
      "border border-slate-300 bg-transparent text-slate-600 hover:border-brand-400 hover:text-brand-700 dark:border-slate-600 dark:text-slate-300 dark:hover:border-brand-500 dark:hover:text-sky-300",
    danger:
      "border border-rose-400/60 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-400",
    ghost: "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium tracking-wide transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2"
      aria-pressed={checked}
    >
      <span
        className={`relative h-5 w-9 rounded-full border transition ${
          checked
            ? "border-sky-400/60 bg-sky-600/90 shadow-[0_0_8px_rgba(23,176,207,0.35)]"
            : "border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all ${checked ? "left-4.5" : "left-0.5"}`}
        />
      </span>
      {label && <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>}
    </button>
  );
}
