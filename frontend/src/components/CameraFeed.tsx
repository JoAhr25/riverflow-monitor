import { useEffect, useState } from "react";

export default function CameraFeed({
  className = "",
  showStatus = true,
}: {
  className?: string;
  showStatus?: boolean;
}) {
  const [src, setSrc] = useState("/api/video/stream");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden && !failed) {
        setSrc(`/api/video/stream?t=${Date.now()}`);
      }
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [failed]);

  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-800 bg-black ${className}`}>
      {failed ? (
        <div className="flex aspect-video w-full items-center justify-center">
          <p className="text-sm text-slate-400">
            Live stream unavailable. Make sure the backend is running.
            <button className="ml-2 underline" onClick={() => setFailed(false)}>
              Retry
            </button>
          </p>
        </div>
      ) : (
        <img
          src={src}
          alt="Live river camera"
          className="aspect-video w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
      {showStatus && (
        <span className="absolute top-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold tracking-widest text-rose-400">
          ● LIVE
        </span>
      )}
    </div>
  );
}
