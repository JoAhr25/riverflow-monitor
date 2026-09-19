import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ChartPoint {
  t: number;
  v: number;
}

const timeFormatter = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function LiveChart({
  data,
  color = "#38c8e3",
  unit,
  height = 220,
  yDomain,
  compare,
  compareLabel = "comparison",
}: {
  data: ChartPoint[];
  color?: string;
  unit?: string;
  height?: number;
  yDomain?: [number | string, number | string];
  compare?: ChartPoint[];
  compareLabel?: string;
}) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-slate-300 font-mono text-[11px] tracking-wider text-slate-400 uppercase dark:border-slate-700 dark:text-slate-500"
        style={{ height }}
      >
        No data available
      </div>
    );
  }
  const gradientId = `flow-grad-${Math.round(height)}-${color.replace("#", "")}`;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0.015} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="1 5" stroke="currentColor" className="text-slate-300/70 dark:text-slate-700/60" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={timeFormatter}
            stroke="currentColor"
            className="text-slate-400 dark:text-slate-500"
            tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={{ stroke: "currentColor", strokeOpacity: 0.25 }}
            minTickGap={48}
          />
          <YAxis
            stroke="currentColor"
            className="text-slate-400 dark:text-slate-500"
            tick={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
            tickLine={false}
            axisLine={false}
            width={52}
            domain={yDomain ?? ["auto", "auto"]}
          />
          <Tooltip
            cursor={{ stroke: color, strokeOpacity: 0.35, strokeDasharray: "3 3" }}
            labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
            formatter={(v) => [`${Number(v).toFixed(3)}${unit ? ` ${unit}` : ""}`, "value"]}
            contentStyle={{
              background: "rgba(7,32,43,0.94)",
              border: "1px solid rgba(91,187,208,0.4)",
              borderRadius: 8,
              color: "#D7E9EC",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
            labelStyle={{ color: "#8AE0EE" }}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            activeDot={{ r: 3, strokeWidth: 0 }}
            isAnimationActive={false}
          />
          {compare && compare.length > 0 && (
            <Area
              type="monotone"
              dataKey="v"
              data={compare}
              stroke={color}
              strokeOpacity={0.65}
              strokeWidth={1.2}
              strokeDasharray="5 4"
              fill="transparent"
              isAnimationActive={false}
              name={compareLabel}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
