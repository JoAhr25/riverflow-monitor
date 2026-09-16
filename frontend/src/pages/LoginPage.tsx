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
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-6 flex flex-col items-center gap-3">
            <Logo size={52} />
            <div className="text-center">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">RiverFlow Monitor</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Real-Time Non-Contact River Monitoring System</p>
            </div>
          </div>

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
              <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                {error}
              </p>
            )}

            <Button type="submit" disabled={busy || !username || !password} className="w-full">
              {busy ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-400 dark:text-slate-600">
          Access controlled by the server administrator.
        </p>
      </div>
    </div>
  );
}
