/* Pure chart data helpers (unit-tested). */

export interface ChartPoint {
  t: number;
  v: number;
}

/** Downsample long series so charts stay responsive with large windows. */
export function decimate(points: ChartPoint[], maxPoints = 1200): ChartPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

export interface SeriesStats {
  count: number;
  min: number;
  max: number;
  mean: number;
}

/** Summary statistics for a numeric series; null when no valid samples. */
export function summarize(values: (number | null | undefined)[]): SeriesStats | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  let min = nums[0];
  let max = nums[0];
  let sum = 0;
  for (const n of nums) {
    if (n < min) min = n;
    if (n > max) max = n;
    sum += n;
  }
  return { count: nums.length, min, max, mean: sum / nums.length };
}
