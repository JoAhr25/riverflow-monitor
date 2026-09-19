import { describe, expect, it } from "vitest";
import { decimate, summarize } from "./chart";

describe("decimate", () => {
  it("keeps short series untouched", () => {
    const pts = Array.from({ length: 100 }, (_, i) => ({ t: i, v: i }));
    expect(decimate(pts, 1200)).toEqual(pts);
  });

  it("reduces long series below the cap and always keeps the newest point", () => {
    const pts = Array.from({ length: 5000 }, (_, i) => ({ t: i, v: i * 2 }));
    const out = decimate(pts, 1200);
    expect(out.length).toBeLessThanOrEqual(1200);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
    // monotonically increasing timestamps preserved
    for (let i = 1; i < out.length; i += 1) expect(out[i].t).toBeGreaterThan(out[i - 1].t);
  });
});

describe("summarize", () => {
  it("returns null when no finite samples exist", () => {
    expect(summarize([null, undefined, Number.NaN])).toBeNull();
    expect(summarize([])).toBeNull();
  });

  it("computes min, max and mean ignoring gaps", () => {
    const s = summarize([1, null, 3, undefined, 5, 2]);
    expect(s).not.toBeNull();
    expect(s!.min).toBe(1);
    expect(s!.max).toBe(5);
    expect(s!.mean).toBeCloseTo(2.75);
    expect(s!.count).toBe(4);
  });
});
