import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Card from "../components/Card";
import EmptyState from "../components/EmptyState";
import MetricCard from "../components/MetricCard";
import PageHeader from "../components/PageHeader";
import { Button, Field, inputClass } from "../components/Field";
import { api } from "../services/api";
import type { ValidationTest } from "../types";

interface ResultsSummary {
  n_tests: number;
  water_level: { n: number; mean_error_pct: number | null; mean_accuracy_pct: number | null; max_error_pct: number | null };
  flow_rate: { n: number; mean_error_pct: number | null; mean_accuracy_pct: number | null; max_error_pct: number | null };
  debris_count: { n: number; mean_error_pct: number | null; mean_accuracy_pct: number | null; max_error_pct: number | null };
  reliability: { measurements_stored: number; note: string };
}

export default function ValidationPage() {
  const [tests, setTests] = useState<ValidationTest[]>([]);
  const [results, setResults] = useState<ResultsSummary | null>(null);
  const [pyorc, setPyorc] = useState<{ available: boolean; version: string | null; note: string; camera_config_found?: boolean } | null>(null);
  const [form, setForm] = useState({
    test_name: "",
    reference_flow_rate: "",
    measured_flow_rate: "",
    reference_water_level: "",
    measured_water_level: "",
    reference_debris_count: "",
    measured_debris_count: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => {
    api.getValidationTests().then((t) => setTests(t.tests)).catch(() => setTests([]));
    api.getValidationResults().then((r) => setResults(r as unknown as ResultsSummary)).catch(() => setResults(null));
  };

  useEffect(() => {
    load();
    api.getPyorcStatus().then(setPyorc).catch(() => setPyorc(null));
  }, []);

  const parseOrNull = (v: string): number | null => {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isNaN(n) ? null : n;
  };

  const capture = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const cap = (await api.captureLatest()) as {
        measured_water_level_m: number | null;
        measured_debris_count: number | null;
        measured_image_motion_px: number | null;
        calibrated: boolean;
        note: string;
      };
      setForm((f) => ({
        ...f,
        measured_water_level: cap.measured_water_level_m != null ? String(cap.measured_water_level_m) : "",
        measured_debris_count: cap.measured_debris_count != null ? String(cap.measured_debris_count) : "",
      }));
      setMessage(`Captured latest measurement. ${cap.calibrated ? "" : "Note: surface velocity is uncalibrated (image-space only), so measured flow-rate fields stay empty. "}${cap.note}`);
    } catch (err) {
      setMessage(`Capture failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.createValidationTest({
        test_name: form.test_name.trim() || "Test",
        reference_flow_rate: parseOrNull(form.reference_flow_rate),
        measured_flow_rate: parseOrNull(form.measured_flow_rate),
        reference_water_level: parseOrNull(form.reference_water_level),
        measured_water_level: parseOrNull(form.measured_water_level),
        reference_debris_count: parseOrNull(form.reference_debris_count),
        measured_debris_count: parseOrNull(form.measured_debris_count),
        notes: form.notes,
      });
      setForm({ ...form, test_name: "", notes: "" });
      setMessage("Test record stored.");
      load();
    } catch (err) {
      setMessage(`Save failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    await api.deleteValidationTest(id).catch(() => undefined);
    load();
  };

  const chartData = [
    { name: "Water Level", accuracy: results?.water_level.mean_accuracy_pct ?? null },
    { name: "Flow Rate", accuracy: results?.flow_rate.mean_accuracy_pct ?? null },
    { name: "Debris Count", accuracy: results?.debris_count.mean_accuracy_pct ?? null },
  ].filter((d) => d.accuracy != null);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Testing & Validation"
        description="Compare system measurements against real reference values (tank tests with known pump flow, gauge readings, counted debris). Reference values must be entered from actual experiments — never fabricated."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Validation Tests" value={String(results?.n_tests ?? 0)} accent="sky" sub="Stored in the local database" />
        <MetricCard
          label="Water Level Accuracy"
          value={results?.water_level.mean_accuracy_pct != null ? `${results.water_level.mean_accuracy_pct.toFixed(2)}` : "--"}
          unit={results?.water_level.mean_accuracy_pct != null ? "%" : undefined}
          status={results?.water_level.mean_accuracy_pct != null ? "calibrated" : "idle"}
          accent="emerald"
          sub={results?.water_level.n ? `from ${results.water_level.n} tests` : "No comparable tests yet"}
        />
        <MetricCard
          label="Flow Rate Accuracy"
          value={results?.flow_rate.mean_accuracy_pct != null ? `${results.flow_rate.mean_accuracy_pct.toFixed(2)}` : "--"}
          unit={results?.flow_rate.mean_accuracy_pct != null ? "%" : undefined}
          status={results?.flow_rate.mean_accuracy_pct != null ? "calibrated" : "idle"}
          accent="amber"
          sub={results?.flow_rate.n ? `from ${results.flow_rate.n} tests` : "Requires calibrated LSPIV discharge"}
        />
        <MetricCard
          label="Debris Counting Accuracy"
          value={results?.debris_count.mean_accuracy_pct != null ? `${results.debris_count.mean_accuracy_pct.toFixed(2)}` : "--"}
          unit={results?.debris_count.mean_accuracy_pct != null ? "%" : undefined}
          status={results?.debris_count.mean_accuracy_pct != null ? "calibrated" : "idle"}
          accent="rose"
          sub={results?.debris_count.n ? `from ${results.debris_count.n} tests` : "Requires trained debris model"}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="New Test Record" subtitle="Experimental tank mode: reference flow (pump), reference water level, known debris count">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Test name">
              <input value={form.test_name} onChange={(e) => setForm({ ...form, test_name: e.target.value })} placeholder="e.g. tank-run-01" className={inputClass} />
            </Field>
            <div className="flex items-end pb-1">
              <Button variant="secondary" onClick={capture} disabled={busy}>
                Capture Current Measured Values
              </Button>
            </div>
            <Field label="Reference flow rate (m³/s)" hint="Actual value from the tank pump / reference measurement">
              <input value={form.reference_flow_rate} onChange={(e) => setForm({ ...form, reference_flow_rate: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Measured flow rate (m³/s)" hint="Only available with calibrated velocity + cross-section">
              <input value={form.measured_flow_rate} onChange={(e) => setForm({ ...form, measured_flow_rate: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Reference water level (m)">
              <input value={form.reference_water_level} onChange={(e) => setForm({ ...form, reference_water_level: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Measured water level (m)">
              <input value={form.measured_water_level} onChange={(e) => setForm({ ...form, measured_water_level: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Reference debris count">
              <input value={form.reference_debris_count} onChange={(e) => setForm({ ...form, reference_debris_count: e.target.value })} className={inputClass} />
            </Field>
            <Field label="Measured debris count">
              <input value={form.measured_debris_count} onChange={(e) => setForm({ ...form, measured_debris_count: e.target.value })} className={inputClass} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Notes">
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputClass} />
            </Field>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={submit} disabled={busy}>
              Store Test Record
            </Button>
            {message && <span className="text-xs text-slate-500 dark:text-slate-400">{message}</span>}
          </div>
        </Card>

        <div className="space-y-5">
          <Card title="Accuracy Summary" subtitle="Computed from stored test data only">
            {chartData.length === 0 ? (
              <EmptyState message="No data available." hint="Store test records with reference and measured values to compute accuracy." />
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} width={48} domain={[0, 100]} unit="%" />
                    <Tooltip
                      formatter={(v) => [`${Number(v).toFixed(2)} %`, "accuracy"]}
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }}
                    />
                    <Bar dataKey="accuracy" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{results?.reliability.note}</p>
          </Card>

          <Card title="PyORC Reference Status" subtitle="LSPIV testing / calibration / validation tool (separate from live monitoring)">
            {pyorc ? (
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium">pyorc in webapp env:</span>{" "}
                  <span className={pyorc.available ? "text-emerald-500" : "text-amber-500"}>{pyorc.available ? `available (v${pyorc.version})` : "not installed"}</span>
                </p>
                <p>
                  <span className="font-medium">Camera config file:</span>{" "}
                  <span className={pyorc.camera_config_found ? "text-emerald-500" : "text-slate-500"}>
                    {pyorc.camera_config_found ? "found in data/config/" : "not found"}
                  </span>
                </p>
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{pyorc.note}</p>
              </div>
            ) : (
              <EmptyState message="PyORC status unavailable." />
            )}
          </Card>
        </div>
      </div>

      <Card title="Test Records" subtitle="Reference vs measured, with computed error and accuracy">
        {tests.length === 0 ? (
          <EmptyState message="No test records stored." hint="Values are only shown when actual reference measurements exist." />
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                <tr>
                  {["Time", "Name", "Ref Q (m³/s)", "Meas Q", "Q Err", "Ref WL (m)", "Meas WL", "WL Err", "Ref Debris", "Meas Debris", "Acc", ""].map((h) => (
                    <th key={h} className="px-2.5 py-2 font-semibold text-slate-600 dark:text-slate-300">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono">
                {tests.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800/60">
                    <td className="px-2.5 py-1.5">{t.timestamp?.replace("T", " ")}</td>
                    <td className="px-2.5 py-1.5">{t.test_name}</td>
                    <td className="px-2.5 py-1.5">{t.reference_flow_rate ?? "—"}</td>
                    <td className="px-2.5 py-1.5">{t.measured_flow_rate ?? "—"}</td>
                    <td className="px-2.5 py-1.5">{t.flow_metrics.error_pct != null ? `${t.flow_metrics.error_pct}%` : "—"}</td>
                    <td className="px-2.5 py-1.5">{t.reference_water_level ?? "—"}</td>
                    <td className="px-2.5 py-1.5">{t.measured_water_level ?? "—"}</td>
                    <td className="px-2.5 py-1.5">{t.water_level_metrics.error_pct != null ? `${t.water_level_metrics.error_pct}%` : "—"}</td>
                    <td className="px-2.5 py-1.5">{t.reference_debris_count ?? "—"}</td>
                    <td className="px-2.5 py-1.5">{t.measured_debris_count ?? "—"}</td>
                    <td className="px-2.5 py-1.5">{t.debris_metrics.accuracy_pct != null ? `${t.debris_metrics.accuracy_pct}%` : "—"}</td>
                    <td className="px-2.5 py-1.5">
                      <button onClick={() => remove(t.id)} className="text-rose-500 hover:underline">
                        delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
