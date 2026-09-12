export function directionLabel(deg: number | null | undefined): string {
  if (deg == null || Number.isNaN(deg)) return "--";
  const dirs = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"];
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

export default function Compass({ directionDeg, size = 84 }: { directionDeg: number | null | undefined; size?: number }) {
  const valid = directionDeg != null && !Number.isNaN(directionDeg);
  const rad = valid ? ((directionDeg as number) * Math.PI) / 180 : 0;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
  const x2 = cx + r * 0.8 * Math.cos(rad);
  const y2 = cy - r * 0.8 * Math.sin(rad);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" className="text-slate-300 dark:text-slate-700" strokeWidth="1.5" />
        {[0, 90, 180, 270].map((a) => {
          const ar = (a * Math.PI) / 180;
          return (
            <text
              key={a}
              x={cx + (r + 6) * Math.cos(ar)}
              y={cy - (r + 6) * Math.sin(ar) + 3}
              textAnchor="middle"
              fontSize="9"
              fill="currentColor"
              className="text-slate-400"
            >
              {a === 0 ? "E" : a === 90 ? "N" : a === 180 ? "W" : "S"}
            </text>
          );
        })}
        {valid ? (
          <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
        ) : null}
        <circle cx={cx} cy={cy} r="3" fill={valid ? "#38bdf8" : "#94a3b8"} />
      </svg>
      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
        {valid ? `${(directionDeg as number).toFixed(0)}° ${directionLabel(directionDeg)}` : "no data"}
      </span>
    </div>
  );
}
