import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useLive } from "../services/live";
import { authApi, hasSession } from "../services/api";
import { Logo } from "./Logo";

const NAV = [
  { to: "/", label: "Dashboard", short: "Overview" },
  { to: "/live-camera", label: "Live Camera", short: "Camera" },
  { to: "/flow", label: "Flow Analysis", short: "Flow" },
  { to: "/water-level", label: "Water Level", short: "Water" },
  { to: "/debris", label: "Debris Detection", short: "Debris" },
  { to: "/history", label: "Historical Data", short: "History" },
  { to: "/validation", label: "Testing & Validation", short: "Validation" },
  { to: "/calibration", label: "Calibration", short: "Calibration" },
  { to: "/system", label: "System Status", short: "System" },
  { to: "/settings", label: "Settings", short: "Settings" },
];

function ThemeToggle() {
  const [dark, setDark] = useState(() => localStorage.getItem("rf-theme") === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("rf-theme", dark ? "dark" : "light");
  }, [dark]);
  return (
    <button
      onClick={() => setDark(!dark)}
      className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-sky-300 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-sky-300"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? (
        <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10l1.4 1.4M3 12h2m14 0h2M5.6 18.4l1.4-1.4m10-10l1.4-1.4M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
        </svg>
      )}
    </button>
  );
}

export default function Layout() {
  const { connected, latest, status } = useLive();
  const [menuOpen, setMenuOpen] = useState(false);

  const waterAlert = latest?.alerts?.water_level ?? null;
  const prevAlertRef = useRef<string | null>(null);

  // Browser notification on alert transitions (only when the user has
  // already granted permission — the app never nags for it).
  useEffect(() => {
    if (
      waterAlert &&
      waterAlert !== prevAlertRef.current &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      new Notification(
        waterAlert === "danger"
          ? "RiverFlow Monitor — water level above DANGER threshold"
          : "RiverFlow Monitor — water level above warning threshold",
        { icon: "/riverflow-logo.png" },
      );
    }
    prevAlertRef.current = waterAlert;
  }, [waterAlert]);

  const online = status?.system_online === true;
  const processing = status?.processing?.status === "running";
  const lastUpdate = latest?.timestamp;

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Command bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/95">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-4 px-4">
          {/* Brand */}
          <NavLink to="/" className="flex shrink-0 items-center gap-2.5">
            <Logo size={30} />
            <div className="hidden leading-none sm:block">
              <div className="text-[13px] font-bold tracking-tight text-slate-900 dark:text-white">RiverFlow</div>
              <div className="micro-label text-brand-600! dark:text-sky-300!">Monitor Station</div>
            </div>
          </NavLink>

          <div className="hidden h-6 w-px bg-slate-200 dark:bg-slate-700/70 lg:block" aria-hidden="true" />

          {/* Desktop nav */}
          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto lg:flex" aria-label="Main navigation">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `relative shrink-0 rounded-md px-2.5 py-1.5 text-[12.5px] whitespace-nowrap transition ${
                    isActive
                      ? "font-semibold text-brand-700 dark:text-sky-300"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {item.short}
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-2.5 -bottom-[13px] h-[2px] rounded-full bg-brand-500 dark:bg-sky-400"
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Status cluster */}
          <div className="ml-auto flex items-center gap-2.5">
            <div className="hidden items-center gap-2.5 md:flex">
              <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400">
                <span
                  className={`pulse-dot h-1.5 w-1.5 rounded-full ${
                    online ? (processing ? "bg-brand-500" : "bg-emerald-500") : "bg-rose-500"
                  }`}
                />
                {online ? (processing ? "Processing" : "Online") : "Offline"}
              </span>
              <span className="hidden font-mono text-[10px] tracking-wider text-slate-400/80 xl:inline">
                ws {connected ? "live" : "—"}
              </span>
            </div>
            {status?.demo_mode && (
              <span className="rounded-sm border border-fuchsia-400/50 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-fuchsia-600 dark:text-fuchsia-300">
                DEMO
              </span>
            )}
            {(status?.auth_required || hasSession()) && (
              <button
                onClick={async () => {
                  try {
                    await authApi.logout();
                  } catch {
                    /* ignore */
                  }
                  window.dispatchEvent(new Event("rf-unauthorized"));
                }}
                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-rose-300"
                title="Sign out"
                aria-label="Sign out"
              >
                <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H3m0 0l4-4m-4 4l4 4m6-11h4a2 2 0 012 2v10a2 2 0 01-2 2h-4" />
                </svg>
              </button>
            )}
            <ThemeToggle />
            <button
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-sky-300 lg:hidden"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile nav sheet */}
        {menuOpen && (
          <nav
            className="grid grid-cols-2 gap-1 border-t border-slate-200/80 bg-white p-3 sm:grid-cols-3 lg:hidden dark:border-slate-800/80 dark:bg-slate-950"
            aria-label="Main navigation"
          >
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-brand-100/70 font-semibold text-brand-700 dark:bg-sky-500/10 dark:text-sky-300"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-200"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/* Demo banner */}
      {status?.demo_mode && (
        <div className="border-b border-fuchsia-500/20 bg-fuchsia-500/10 px-4 py-1.5 text-center text-[11px] font-semibold tracking-wide text-fuchsia-300">
          DEMO MODE — simulated values, not real measurements
        </div>
      )}

      {/* Water-level alert banner */}
      {waterAlert && (
        <div
          role="alert"
          className={`flex flex-wrap items-center justify-center gap-x-2 px-4 py-2 text-center text-xs font-semibold tracking-wide ${
            waterAlert === "danger"
              ? "bg-rose-600 text-white"
              : "bg-amber-400/90 text-amber-950"
          }`}
        >
          <span>{waterAlert === "danger" ? "WATER LEVEL ABOVE DANGER THRESHOLD" : "Water level above warning threshold"}</span>
          {latest?.water_level?.value != null && (
            <span className="font-mono">
              {latest.water_level.value.toFixed(2)} m
              {latest.alerts?.thresholds.danger_m != null && waterAlert === "danger" && ` (limit ${latest.alerts.thresholds.danger_m} m)`}
              {latest.alerts?.thresholds.warning_m != null && waterAlert === "warning" && ` (limit ${latest.alerts.thresholds.warning_m} m)`}
            </span>
          )}
          {typeof Notification !== "undefined" && Notification.permission === "default" && (
            <button
              className="rounded-sm border border-current px-1.5 py-px text-[10px] font-bold uppercase"
              onClick={() => Notification.requestPermission()}
            >
              Enable notifications
            </button>
          )}
        </div>
      )}

      {/* ── Content ─────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-[1600px] min-w-0 flex-1 p-4 md:p-7">
        <Outlet />
        <div className="mt-8 flex items-center justify-between border-t border-slate-200/70 pt-4 text-[11px] text-slate-400 dark:border-slate-800/60 dark:text-slate-600">
          <span className="font-mono">Last update {lastUpdate ? lastUpdate.replace("T", " ") : "—"}</span>
          <span className="hidden sm:inline">RiverFlow Monitor · Non-Contact River Monitoring</span>
        </div>
      </main>
    </div>
  );
}
