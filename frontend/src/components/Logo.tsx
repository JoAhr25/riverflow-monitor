export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <rect width="64" height="64" rx="14" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
      <path d="M11 26c4.5-5.5 9-5.5 13.5 0s9 5.5 13.5 0 9-5.5 13.5 0" stroke="#38bdf8" strokeWidth="4.5" fill="none" strokeLinecap="round" />
      <path d="M11 40c4.5-5.5 9-5.5 13.5 0s9 5.5 13.5 0 9-5.5 13.5 0" stroke="#7dd3fc" strokeWidth="4.5" fill="none" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}
