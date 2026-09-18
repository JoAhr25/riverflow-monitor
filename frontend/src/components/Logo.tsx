export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-900/10 dark:ring-white/15"
      style={{ width: size, height: size }}
    >
      <img src="/riverflow-logo.png" alt="RiverFlow Monitor logo" className="h-full w-full object-contain" />
    </span>
  );
}
