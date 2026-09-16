import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ChartPoint {
  t: number;
  v: number;
}

const timeFormatter = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function LiveChart({
  data,
  color = "#38bdf8",
  unit,
  height = 220,
  yDomain,
}: {
  data: ChartPoint[];
  color?: string;
  unit?: string;
  height?: number;
  yDomain?: [number | string, number | string];
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-slate-500 dark:text-slate-400" style={{ height }}>
        No data available.
      </div>
    );
  }
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={timeFormatter} stroke="#94a3b8" fontSize={11} minTickGap={48} />
          <YAxis stroke="#94a3b8" fontSize={11} width={48} domain={yDomain ?? ["auto", "auto"]} />
          <Tooltip
            labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
            formatter={(v) => [`${Number(v).toFixed(3)}${unit ? ` ${unit}` : ""}`, "value"]}
            contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }}
          />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.8} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
