import { useEffect, useRef, useState } from "react";
import { apiUrl } from "../services/api";
import { getDemoVideoUrl } from "../services/demo";
import { useLive } from "../services/live";

interface Overlays {
  roi: boolean;
  flow_vectors: boolean;
  debris_boxes: boolean;
  water_edge: boolean;
  hud: boolean;
}

export default function CameraFeed({
  className = "",
  showStatus = true,
  overlays,
}: {
  className?: string;
  showStatus?: boolean;
  overlays?: Overlays;
}) {
  const ov = overlays ?? { roi: true, flow_vectors: true, debris_boxes: true, water_edge: true, hud: true };

  const [src, setSrc] = useState(apiUrl("/api/video/stream"));
  const [failed, setFailed] = useState(false);
  const [demoUrl, setDemoUrl] = useState<string | null>(getDemoVideoUrl());
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const { latest, status } = useLive();

  // Poll for demo video URL (set after file upload)
  useEffect(() => {
    const id = window.setInterval(() => {
      const url = getDemoVideoUrl();
      setDemoUrl((prev) => (prev !== url ? url : prev));
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

  // Draw overlays on canvas when video is playing
  useEffect(() => {
    if (!demoUrl) return;
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const isRunning = status?.processing?.status === "running";
      if (!isRunning) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      const flow = latest?.flow;
      const waterEdge = latest?.water_edge;
      const debris = latest?.debris;
      const camera = latest?.camera;
      const wl = latest?.water_level;
      const t = Date.now() / 1000;

      // ── ROI rectangle ──────────────────────────────────────────────
      if (ov.roi) {
        const rx = W * 0.08, ry = H * 0.25, rw = W * 0.84, rh = H * 0.60;
        ctx.save();
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 6]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(34,197,94,0.12)";
        ctx.fillRect(rx, ry, rw, rh);
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = "#22c55e";
        ctx.fillText("ROI", rx + 6, ry + 16);
        ctx.restore();
      }

      // ── Water edge line ────────────────────────────────────────────
      if (ov.water_edge) {
        const edgeY = (waterEdge?.edge_y_normalized ?? 0.47) * H;
        const conf = waterEdge?.confidence ?? 0.92;
        ctx.save();
        ctx.strokeStyle = `rgba(56,189,248,${0.5 + conf * 0.5})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, edgeY);
        ctx.lineTo(W, edgeY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = "bold 10px monospace";
        ctx.fillStyle = "#38bdf8";
        ctx.fillText(`Water Edge  conf:${(conf * 100).toFixed(0)}%`, 8, edgeY - 4);
        ctx.restore();
      }

      // ── Flow vectors ───────────────────────────────────────────────
      if (ov.flow_vectors && flow) {
        const dirRad = ((flow.direction_deg ?? 27) * Math.PI) / 180;
        const mag = (flow.image_motion ?? 12.4);
        const COLS = 7, ROWS = 4;
        const roiX = W * 0.08, roiY = H * 0.25, roiW = W * 0.84, roiH = H * 0.60;

        for (let c = 0; c < COLS; c++) {
          for (let r = 0; r < ROWS; r++) {
            const ox = roiX + (roiW / (COLS + 1)) * (c + 1);
            const oy = roiY + (roiH / (ROWS + 1)) * (r + 1);

            // Animate each vector slightly for liveliness
            const phase = t * 2 + c * 0.7 + r * 1.1;
            const len = (mag / 20) * 28 * (0.85 + Math.sin(phase) * 0.15);
            const angle = dirRad + Math.sin(phase * 0.3) * 0.1;

            const ex = ox + Math.cos(angle) * len;
            const ey = oy + Math.sin(angle) * len;

            ctx.save();
            ctx.strokeStyle = "rgba(250,204,21,0.85)";
            ctx.fillStyle = "rgba(250,204,21,0.85)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.lineTo(ex, ey);
            ctx.stroke();

            // Arrow head
            const headAngle = Math.atan2(ey - oy, ex - ox);
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - Math.cos(headAngle - 0.4) * 6, ey - Math.sin(headAngle - 0.4) * 6);
            ctx.lineTo(ex - Math.cos(headAngle + 0.4) * 6, ey - Math.sin(headAngle + 0.4) * 6);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }

        // Direction label
        ctx.save();
        ctx.font = "10px monospace";
        ctx.fillStyle = "rgba(250,204,21,0.9)";
        ctx.fillText(`Flow: ${(flow.direction_deg ?? 27).toFixed(1)}°`, W * 0.08 + 4, H * 0.25 + H * 0.60 - 6);
        ctx.restore();
      }

      // ── Debris boxes ───────────────────────────────────────────────
      if (ov.debris_boxes && debris && debris.count > 0) {
        ctx.save();
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.strokeRect(W * 0.4, H * 0.35, 80, 60);
        ctx.font = "bold 10px monospace";
        ctx.fillStyle = "#ef4444";
        ctx.fillText(`Debris #1  conf:87%`, W * 0.4, H * 0.35 - 4);
        ctx.restore();
      }

      // ── HUD ────────────────────────────────────────────────────────
      if (ov.hud) {
        const fps = (camera?.fps ?? 29.5).toFixed(1);
        const vel = flow?.calibrated && flow?.value != null ? `${flow.value.toFixed(2)} m/s` : `${(flow?.image_motion ?? 12.4).toFixed(1)} px`;
        const wlVal = wl?.value != null ? `${wl.value.toFixed(2)} m` : "--";
        const frameN = camera?.frames ?? 0;

        ctx.save();
        // HUD background
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(6, 6, 230, 74);

        ctx.font = "bold 11px monospace";
        ctx.fillStyle = "#38bdf8";
        ctx.fillText("● RIVERFLOW  DEMO MODE", 14, 23);

        ctx.font = "10px monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(`FPS: ${fps}   Frame: ${frameN}`, 14, 39);
        ctx.fillText(`Velocity: ${vel}`, 14, 53);
        ctx.fillText(`Water Level: ${wlVal}   Status: OK`, 14, 67);
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [demoUrl, latest, status, ov.roi, ov.flow_vectors, ov.water_edge, ov.debris_boxes, ov.hud]);

  // Sync canvas size to video element size
  useEffect(() => {
    if (!demoUrl) return;
    const video = videoRef.current;
    const canvas = overlayRef.current;
    if (!video || !canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = video.clientWidth || 1280;
      canvas.height = video.clientHeight || 720;
    });
    ro.observe(video);
    return () => ro.disconnect();
  }, [demoUrl]);

  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-800 bg-black ${className}`}>
      {/* Priority: uploaded demo video > live stream > error / idle canvas */}
      {demoUrl ? (
        <>
          <video
            ref={videoRef}
            src={demoUrl}
            className="aspect-video w-full object-contain"
            autoPlay
            loop
            muted
            playsInline
          />
          {/* Overlay canvas drawn on top of the video */}
          <canvas
            ref={overlayRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ mixBlendMode: "normal" }}
          />
        </>
      ) : failed ? (
        <DemoCameraPlaceholder overlays={ov} latest={latest} status={status} />
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
          className={`absolute top-2 right-2 rounded px-2 py-0.5 text-[10px] font-bold tracking-widest ${
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

// ── Animated placeholder canvas (no video uploaded yet) ────────────────────
function DemoCameraPlaceholder({
  overlays,
  latest,
  status,
}: {
  overlays: Overlays;
  latest: import("../types").LiveMeasurement | null;
  status: import("../types").SystemStatus | null;
}) {
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

      const isRunning = status?.processing?.status === "running";
      const flow = latest?.flow;
      const wl = latest?.water_level;

      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.45);
      sky.addColorStop(0, "#0f172a");
      sky.addColorStop(1, "#1e3a5f");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Tree line
      ctx.fillStyle = "#0f2d1a";
      for (let x = 0; x < W; x += 18) {
        const h = 28 + Math.sin(x * 0.3 + t * 0.1) * 8;
        ctx.fillRect(x, H * 0.45 - h, 16, h + 4);
      }

      // River gradient
      const river = ctx.createLinearGradient(0, H * 0.45, 0, H);
      river.addColorStop(0, "#0c3b5c");
      river.addColorStop(0.5, "#0e4d72");
      river.addColorStop(1, "#0a3050");
      ctx.fillStyle = river;
      ctx.fillRect(0, H * 0.45, W, H);

      // Ripples
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        ctx.strokeStyle = `rgba(100,180,255,${0.10 + (i % 3) * 0.06})`;
        const y = H * 0.50 + i * (H * 0.06) + Math.sin(t * 1.2 + i) * 3;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 4) {
          const dy = Math.sin((x / W) * Math.PI * 6 + t * 3 + i * 1.3) * 4;
          x === 0 ? ctx.moveTo(x, y + dy) : ctx.lineTo(x, y + dy);
        }
        ctx.stroke();
      }

      // ROI
      if (overlays.roi) {
        const rx = W * 0.08, ry = H * 0.25, rw = W * 0.84, rh = H * 0.60;
        ctx.save();
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 6]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = "#22c55e";
        ctx.fillText("ROI", rx + 6, ry + 16);
        ctx.restore();
      }

      // Water edge
      if (overlays.water_edge) {
        const edgeY = H * (0.47 + Math.sin(t * 0.5) * 0.01);
        ctx.save();
        ctx.strokeStyle = "rgba(56,189,248,0.8)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(0, edgeY); ctx.lineTo(W, edgeY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = "bold 10px monospace";
        ctx.fillStyle = "#38bdf8";
        ctx.fillText("Water Edge  conf:92%", 8, edgeY - 4);
        ctx.restore();
      }

      // Flow vectors
      if (overlays.flow_vectors) {
        const dirDeg = isRunning ? (flow?.direction_deg ?? 27) : 27;
        const dirRad = (dirDeg * Math.PI) / 180;
        const mag = isRunning ? (flow?.image_motion ?? 12.4) : 12.4;

        for (let col = 0; col < 7; col++) {
          for (let row = 0; row < 4; row++) {
            const ox = W * 0.08 + (W * 0.84 / 8) * (col + 1);
            const oy = H * 0.25 + (H * 0.60 / 5) * (row + 1);
            const phase = t * 2 + col * 0.7 + row * 1.1;
            const len = (mag / 20) * 28 * (0.85 + Math.sin(phase) * 0.15);
            const angle = dirRad + Math.sin(phase * 0.3) * 0.1;
            const ex = ox + Math.cos(angle) * len;
            const ey = oy + Math.sin(angle) * len;

            ctx.save();
            ctx.strokeStyle = "rgba(250,204,21,0.85)";
            ctx.fillStyle = "rgba(250,204,21,0.85)";
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
            const ha = Math.atan2(ey - oy, ex - ox);
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - Math.cos(ha - 0.4) * 6, ey - Math.sin(ha - 0.4) * 6);
            ctx.lineTo(ex - Math.cos(ha + 0.4) * 6, ey - Math.sin(ha + 0.4) * 6);
            ctx.closePath(); ctx.fill();
            ctx.restore();
          }
        }
      }

      // HUD
      if (overlays.hud) {
        const fps = isRunning ? (29 + Math.sin(t) * 0.4).toFixed(1) : "--";
        const vel = isRunning ? `${(wl?.value ?? 1.84).toFixed(2)} m` : "--";
        const vFlow = isRunning && flow?.value != null ? `${flow.value.toFixed(2)} m/s` : "--";

        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(6, 6, 230, 76);
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = isRunning ? "#38bdf8" : "#64748b";
        ctx.fillText(isRunning ? "● RIVERFLOW  PROCESSING" : "● RIVERFLOW  DEMO MODE", 14, 23);
        ctx.font = "10px monospace";
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(`FPS: ${fps}`, 14, 39);
        ctx.fillText(`Velocity: ${vFlow}`, 14, 53);
        ctx.fillText(`Water Level: ${vel}   Status: ${isRunning ? "OK" : "IDLE"}`, 14, 67);
        ctx.restore();
      }

      // "Upload a video" hint when idle
      if (!isRunning) {
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(W / 2 - 150, H / 2 - 18, 300, 36);
        ctx.font = "13px sans-serif";
        ctx.fillStyle = "#94a3b8";
        ctx.textAlign = "center";
        ctx.fillText("Upload a video → Start Processing", W / 2, H / 2 + 5);
        ctx.restore();
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [overlays, latest, status]);

  return (
    <canvas
      ref={canvasRef}
      width={1280}
      height={720}
      className="aspect-video w-full"
    />
  );
}
