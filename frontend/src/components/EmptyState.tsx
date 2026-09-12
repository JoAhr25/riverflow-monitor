export default function EmptyState({ message, hint, action }: { message: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-24 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
      <svg className="h-6 w-6 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 7c2.5-2 5-2 8 0s5.5 2 8 0M4 12c2.5-2 5-2 8 0s5.5 2 8 0M4 17c2.5-2 5-2 8 0s5.5 2 8 0"
          opacity="0.7"
        />
      </svg>
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {hint && <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}
