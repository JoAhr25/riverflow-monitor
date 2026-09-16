import { useEffect, useRef, useState } from "react";
import { apiUrl } from "../services/api";
import { getDemoVideoUrl } from "../services/demo";

export default function CameraFeed({
  className = "",
  showStatus = true,
}: {
  className?: string;
  showStatus?: boolean;
}) {
  const [src, setSrc] = useState(apiUrl("/api/video/stream"));
  const [failed, setFailed] = useState(false);
  const [demoUrl, setDemoUrl] = useState<string | null>(getDemoVideoUrl());
  const videoRef = useRef<HTMLVideoElement>(null);

  // Poll for demo video URL (set after file upload)
  useEffect(() => {
    const id = window.setInterval(() => {
      const url = getDemoVideoUrl();
      setDemoUrl(url);
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  // Auto-play video when demoUrl becomes available
  useEffect(() => {
    if (demoUrl && videoRef.current) {
      videoRef.current.src = demoUrl;
      videoRef.current.play().catch(() => {});
    }
  }, [demoUrl]);

  // Retry live stream every 5 min
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden && !failed && !demoUrl) {
        setSrc(apiUrl(`/api/video/stream?t=${Date.now()}`));
      }
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [failed, demoUrl]);

  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-800 bg-black ${className}`}>
      {/* Priority: uploaded demo video > live stream > error / idle placeholder */}
      {demoUrl ? (
        <video
          ref={videoRef}
          src={demoUrl}
          className="aspect-video w-full object-contain"
          autoPlay
          loop
          muted
          playsInline
        />
      ) : failed ? (
        <DemoCameraPlaceholder />
      ) : (
        <img
          src={src}
          alt="Live river camera"
          className="aspect-video w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}

      {showStatus && (
        <span
          className={`absolute top-2 left-2 rounded px-2 py-0.5 text-[10px] font-bold tracking-widest ${
            demoUrl
              ? "bg-sky-900/70 text-sky-300"
              : failed
              ? "bg-black/60 text-slate-400"
              : "bg-black/60 text-rose-400"
          }`}
        >
          {demoUrl ? "● DEMO VIDEO" : failed ? "● OFFLINE" : "● LIVE"}
        </span>
      )}
    </div>
  );
}

/** Animated canvas placeholder shown when there is no stream or demo video */
function DemoCameraPlaceholder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let animId: number;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const t = frame / 60;
      frame++;

      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.45);
      sky.addColorStop(0, "#0f172a");
      sky.addColorStop(1, "#1e3a5f");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Distant tree line
      ctx.fillStyle = "#0f2d1a";
      for (let x = 0; x < W; x += 18) {
        const h = 28 + Math.sin(x * 0.3 + t * 0.1) * 8;
        ctx.fillRect(x, H * 0.45 - h, 16, h + 4);
      }

      // River bed gradient
      const river = ctx.createLinearGradient(0, H * 0.45, 0, H);
      river.addColorStop(0, "#0c3b5c");
      river.addColorStop(0.5, "#0e4d72");
      river.addColorStop(1, "#0a3050");
      ctx.fillStyle = river;
      ctx.fillRect(0, H * 0.45, W, H);

      // Animated water surface ripples
      ctx.strokeStyle = "rgba(100,180,255,0.18)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        const y = H * 0.50 + i * (H * 0.06) + Math.sin(t * 1.2 + i) * 3;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 4) {
          const dy = Math.sin((x / W) * Math.PI * 6 + t * 3 + i * 1.3) * 4;
          x === 0 ? ctx.moveTo(x, y + dy) : ctx.lineTo(x, y + dy);
        }
        ctx.stroke();
      }

      // Flow velocity vectors (arrows)
      ctx.strokeStyle = "rgba(56,189,248,0.55)";
      ctx.lineWidth = 1.5;
      for (let col = 0; col < 6; col++) {
        for (let row = 0; row < 3; row++) {
          const x = (W / 6.5) * (col + 0.75);
          const y = H * 0.56 + row * (H * 0.12);
          const len = 16 + Math.sin(t * 2 + col + row) * 5;
          const angle = -0.25 + Math.sin(t * 0.5 + col * 0.7) * 0.15;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
          ctx.stroke();
          // arrow head
          ctx.beginPath();
          const hx = x + Math.cos(angle) * len;
          const hy = y + Math.sin(angle) * len;
          ctx.moveTo(hx, hy);
          ctx.lineTo(hx - Math.cos(angle - 0.5) * 5, hy - Math.sin(angle - 0.5) * 5);
          ctx.moveTo(hx, hy);
          ctx.lineTo(hx - Math.cos(angle + 0.5) * 5, hy - Math.sin(angle + 0.5) * 5);
          ctx.stroke();
        }
      }

      // HUD overlay
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(8, 8, 210, 58);
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 11px monospace";
      ctx.fillText("RiverFlow Monitor — Demo Mode", 16, 26);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px monospace";
      ctx.fillText(`v: ${(0.62 + Math.sin(t * 0.5) * 0.08).toFixed(2)} m/s  |  WL: ${(1.84 + Math.sin(t * 0.3) * 0.05).toFixed(2)} m`, 16, 42);
      ctx.fillText("Upload a video to see real analysis", 16, 56);

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={1280}
      height={720}
      className="aspect-video w-full"
    />
  );
}
