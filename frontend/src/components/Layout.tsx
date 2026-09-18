import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useLive } from "../services/live";
import { authApi, hasSession } from "../services/api";
import StatusDot from "./StatusDot";
import Footer from "./Footer";
import { Logo } from "./Logo";

const NAV_GROUPS: { label: string; items: { to: string; label: string; icon: string }[] }[] = [
  {
    label: "Monitoring",
    items: [
      { to: "/", label: "Dashboard", icon: "M3 13h2v8H3v-8zm4-6h2v14H7V7zm4 3h2v11h-2V10zm4-7h2v18h-2V3z" },
      { to: "/live-camera", label: "Live Camera", icon: "M15 10l6-4v12l-6-4M3 6h12v12H3V6z" },
    ],
  },
  {
    label: "Analysis",
    items: [
      { to: "/flow", label: "Flow Analysis", icon: "M4 12h14m0 0l-4-4m4 4l-4 4M20 4v16" },
      { to: "/water-level", label: "Water Level", icon: "M4 18c2 0 3-1.5 5-1.5S11 18 13 18s3-1.5 5-1.5M3 12h18M7 12V6a2 2 0 012-2h6a2 2 0 012 2v6" },
      { to: "/debris", label: "Debris Detection", icon: "M5 8h14l-1.5 11h-11L5 8zm3 0V6a4 4 0 018 0v2" },
    ],
  },
  {
    label: "Data",
    items: [
      { to: "/history", label: "Historical Data", icon: "M4 20V6m0 14h16M8 16v-5m4 5V8m4 8v-8" },
      { to: "/validation", label: "Testing & Validation", icon: "M9 12l2 2 4-5m6 3a9 9 0 11-18 0 9 9 0 0118 0z" },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/calibration", label: "Calibration", icon: "M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5l-2 2m-5 9l-2 2m11 0l-2-2m-9-9l-2-2M14 12a2 2 0 11-4 0 2 2 0 014 0z" },
      { to: "/system", label: "System Status", icon: "M5 12h4m6 0h4M12 5v4m0 6v4M8.5 8.5l-3-3m13 0l-3 3m-7 7l-3 3m13 0l-3-3" },
      { to: "/settings", label: "Settings", icon: "M10.5 6h3M4 10v4m16-4v4M10.5 18h3M8 4h8v4H8V4zm-4 12h8v4H4v-4zm12 0h4v4h-4v-4z" },
    ],
  },
];

function ThemeToggle() {
  const [dark, setDark] = useState(() => localStorage.getItem("rf-theme") !== "light");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("rf-theme", dark ? "dark" : "light");
  }, [dark]);
  return (
    <button
      onClick={() => setDark(!dark)}
      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10l1.4 1.4M3 12h2m14 0h2M5.6 18.4l1.4-1.4m10-10l1.4-1.4M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path strokeLinecap="round" d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
        </svg>
      )}
    </button>
  );
}

export default function Layout() {
  const { connected, latest, status } = useLive();
  const [menuOpen, setMenuOpen] = useState(false);

  const online = status?.system_online === true;
  const processing = status?.processing?.status === "running";
  const lastUpdate = latest?.timestamp;

  return (
    <div className="flex h-full">
      <aside
        className={`${menuOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 w-60 shrink-0 border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 md:sticky md:top-0 md:h-screen md:translate-x-0`}
      >
        <div className="h-1 w-full bg-gradient-to-r from-accent-500 via-brand-500 to-brand-700" aria-hidden="true" />
        <div className="flex h-13 items-center gap-2.5 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <Logo size={30} />
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">RiverFlow Monitor</span>
              <span className="rounded bg-slate-200 px-1.5 py-px font-mono text-[9px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                v0.1.0
              </span>
            </div>
            <div className="truncate text-[10px] tracking-wide text-slate-500 dark:text-slate-400">Non-Contact River Monitoring</div>
          </div>
        </div>
        <nav className="space-y-3 overflow-y-auto p-2 pb-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold tracking-widest text-slate-400 uppercase dark:text-slate-500">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      `relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                        isActive
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="absolute top-1.5 bottom-1.5 left-0 w-1 rounded-full bg-gradient-to-b from-accent-500 to-brand-600"
                          />
                        )}
                        <svg className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                        </svg>
                        {item.label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {menuOpen && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMenuOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex items-center gap-3">
            <button
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden"
              onClick={() => setMenuOpen(true)}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <StatusDot
              status={online ? (processing ? "running" : "online") : "error"}
              label={online ? (processing ? "PROCESSING" : "SYSTEM ONLINE") : "BACKEND OFFLINE"}
            />
            {status?.demo_mode && (
              <span className="rounded bg-fuchsia-600 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white">DEMO MODE</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
              WebSocket: <span className={connected ? "text-emerald-500" : "text-rose-500"}>{connected ? "connected" : "disconnected"}</span>
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Last update: <span className="font-mono">{lastUpdate ? lastUpdate.replace("T", " ") : "--:--:--"}</span>
            </span>
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
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                title="Sign out"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H3m0 0l4-4m-4 4l4 4m6-11h4a2 2 0 012 2v10a2 2 0 01-2 2h-4" />
                </svg>
              </button>
            )}
            <ThemeToggle />
          </div>
        </header>

        {status?.demo_mode && (
          <div className="bg-fuchsia-600 px-4 py-1.5 text-center text-xs font-semibold tracking-wide text-white">
            DEMO MODE ACTIVE - mock values are simulated for development and are NOT real measurements
          </div>
        )}

        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
          <Footer />
        </main>
      </div>
    </div>
  );
}
