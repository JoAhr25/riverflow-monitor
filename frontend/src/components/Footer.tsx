import { useLive } from "../services/live";

export default function Footer() {
  const { status } = useLive();
  const mode = status?.components?.cloud?.status === "connected" ? "Cloud mode" : "Local mode";
  return (
    <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-600">
      <span className="font-mono">RiverFlow Monitor v0.1.0</span>
      <span>
        Non-contact river monitoring research · {mode}
        {status?.source ? ` · ${status.source.mode_label}` : ""}
      </span>
    </footer>
  );
}
