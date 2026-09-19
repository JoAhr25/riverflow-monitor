import { useState } from "react";
import { Logo } from "../components/Logo";
import { Button, Field, inputClass } from "../components/Field";
import { authApi } from "../services/api";

export default function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authApi.login(username, password);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* ── River brand panel ─────────────────────────────────────── */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-gradient-to-b from-accent-300 via-sky-100 to-brand-100 p-10 lg:flex">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(80% 50% at 20% 0%, rgba(255,255,255,0.55), transparent 65%), radial-gradient(60% 40% at 90% 100%, rgba(41,163,192,0.18), transparent 70%)",
          }}
        />
        {/* Layered flow lines */}
        <svg aria-hidden="true" className="absolute inset-x-0 bottom-0 w-full" viewBox="0 0 600 320" preserveAspectRatio="none">
          <path d="M0 220 C 90 190, 160 250, 260 220 S 430 180, 600 225 L 600 320 L 0 320 Z" fill="rgba(41,163,192,0.12)" />
          <path d="M0 250 C 110 225, 190 280, 300 250 S 470 215, 600 258 L 600 320 L 0 320 Z" fill="rgba(41,163,192,0.20)" />
          <path d="M0 285 C 100 265, 210 305, 330 282 S 480 255, 600 292 L 600 320 L 0 320 Z" fill="rgba(23,134,159,0.28)" />
          <path
            d="M0 220 C 90 190, 160 250, 260 220 S 430 180, 600 225"
            fill="none"
            stroke="rgba(23,134,159,0.55)"
            strokeWidth="1.5"
          />
          <path
            d="M0 250 C 110 225, 190 280, 300 250 S 470 215, 600 258"
            fill="none"
            stroke="rgba(23,134,159,0.4)"
            strokeWidth="1.5"
          />
        </svg>

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white/95 shadow-lg ring-1 ring-brand-300/40">
              <img src="/riverflow-logo.png" alt="" className="h-full w-full object-contain p-0.5" />
            </span>
            <div>
              <div className="text-base font-bold tracking-tight text-brand-900">RiverFlow Monitor</div>
              <div className="text-[10px] font-semibold tracking-[0.16em] text-brand-600 uppercase">Monitor Station</div>
            </div>
          </div>
        </div>

        <div className="relative max-w-sm">
          <h2 className="text-2xl leading-snug font-bold tracking-tight text-brand-900">
            Non-contact river intelligence.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-brand-800/80">
            Real-time water level, surface velocity, and debris detection — measured from the riverbank with
            LiDAR and computer vision, streamed to any device.
          </p>
          <div className="mt-8 flex gap-6 font-mono text-[10px] tracking-widest text-brand-700/70 uppercase">
            <span>TF-Luna LiDAR</span>
            <span>Optical Flow</span>
            <span>LoRa Link</span>
          </div>
        </div>
      </div>

      {/* ── Form panel ────────────────────────────────────────────── */}
      <div className="flex min-h-screen flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <Logo size={56} />
            <div className="text-center">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">RiverFlow Monitor</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Non-Contact River Monitoring System</p>
            </div>
          </div>

          <div className="rounded-md border border-slate-200/90 bg-white p-8 dark:border-slate-800/80 dark:bg-slate-900/50">
            <div className="micro-label mb-6">Operator Sign-In</div>
            <form onSubmit={submit} className="space-y-4">
              <Field label="Username">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  className={inputClass}
                />
              </Field>

              <Field label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className={inputClass}
                />
              </Field>

              {error && (
                <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs leading-relaxed text-rose-600 dark:text-rose-300">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={busy || !username || !password} className="w-full">
                {busy ? "Signing in…" : "Sign In"}
              </Button>
            </form>
          </div>
          <p className="mt-4 text-center text-[11px] text-slate-400 dark:text-slate-600">
            Access controlled by the system administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
