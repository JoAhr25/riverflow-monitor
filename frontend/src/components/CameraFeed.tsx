import { useEffect, useRef, useState } from "react";
import { apiUrl } from "../services/api";
import { getDemoVideoUrl } from "../services/demo";
import { useLive } from "../services/live";

export interface Overlays {
  roi: boolean;
  flow_vectors: boolean;
  debris_boxes: boolean;
  water_edge: boolean;
  hud: boolean;
}

interface FlowParticle {
  x: number; // 0..1 across river channel width
  y: number; // 0..1 from water edge to ROI bottom
  speedFactor: number;
  length: number;
  life: number;
  maxLife: number;
  trail: { x: number; y: number }[];
}

function initParticles(count: number): FlowParticle[] {
  const particles: FlowParticle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random(),
      y: Math.random(),
      speedFactor: 0.75 + Math.random() * 0.5,
      length: 12 + Math.random() * 8,
      life: Math.random() * 3,
      maxLife: 2.5 + Math.random() * 2.0,
      trail: [],
    });
  }
  return particles;
}

function getVelocityColor(speedMps: number, alpha = 0.9): string {
  if (speedMps < 0.4) return `rgba(56, 189, 248, ${alpha})`; // Cyan
  if (speedMps < 0.75) return `rgba(52, 211, 153, ${alpha})`; // Emerald
  if (speedMps < 1.1) return `rgba(250, 204, 21, ${alpha})`; // Amber
  return `rgba(248, 113, 113, ${alpha})`; // Coral
}

export default function CameraFeed({
  className = "",
  showStatus = true,
  overlays,
  flowDirectionAngle,
}: {
  className?: string;
  showStatus?: boolean;
  overlays?: Overlays;
  flowDirectionAngle?: number;
}) {
  const ov = overlays ?? { roi: true, flow_vectors: true, debris_boxes: true, water_edge: true, hud: true };

  const [src, setSrc] = useState(apiUrl("/api/video/stream"));
  const [failed, setFailed] = useState(false);
  const [demoUrl, setDemoUrl] = useState<string | null>(getDemoVideoUrl());
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const particlesRef = useRef<FlowParticle[]>(initParticles(45));
  const lastTimeRef = useRef<number>(performance.now());
  const debrisPosRef = useRef<{ x: number; y: number; trail: { x: number; y: number }[] }>({
    x: 0.45,
    y: 0.3,
    trail: [],
  });

  const { latest, status } = useLive();
  const running = status?.processing?.status === "running";

  // Poll for demo video URL (set after file upload)
  useEffect(() => {
    const id = window.setInterval(() => {
      const url = getDemoVideoUrl();
      setDemoUrl((prev) => (prev !== url ? url : prev));
    }, 400);
    return () => window.clearInterval(id);
  }, []);

  // Auto-play video when demoUrl becomes available
  useEffect(() => {
    if (demoUrl && videoRef.current) {
      videoRef.current.src = demoUrl;
      videoRef.current.play().catch(() => {});
    }
  }, [demoUrl]);

  // Retry live stream every 5 min if not demo
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden && !failed && !demoUrl) {
        setSrc(apiUrl(`/api/video/stream?t=${Date.now()}`));
      }
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [failed, demoUrl]);

  // Sync canvas size to container's actual pixel dimensions
  useEffect(() => {
    const container = containerRef.current;
    const canvas = overlayRef.current;
    if (!container || !canvas) return;

    const syncSize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Draw overlays on canvas — only over the local demo video. The live
  // backend MJPEG stream already carries the OpenCV-rendered overlays
  // server-side, so drawing here too would duplicate them.
  useEffect(() => {
    if (!demoUrl) return;
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const now = performance.now();
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;
      const t = now / 1000;

      const cw = canvas.width;
      const ch = canvas.height;
      if (cw === 0 || ch === 0) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, cw, ch);

      // Determine video render rect inside container (handling object-contain letterboxing)
      let rx = 0, ry = 0, rw = cw, rh = ch;
      if (video && video.videoWidth && video.videoHeight) {
        const vAspect = video.videoWidth / video.videoHeight;
        const cAspect = cw / ch;
        if (vAspect > cAspect) {
          rh = cw / vAspect;
          ry = (ch - rh) / 2;
        } else {
          rw = ch * vAspect;
          rx = (cw - rw) / 2;
        }
      }

      const isRunning = status?.processing?.status === "running";
      const flow = latest?.flow;
      const waterEdge = latest?.water_edge;
      const debris = latest?.debris;
      const camera = latest?.camera;
      const wl = latest?.water_level;

      // Coordinates for River ROI
      const roiX = rx + rw * 0.08;
      const roiY = ry + rh * 0.22;
      const roiW = rw * 0.84;
      const roiH = rh * 0.65;
      const roiBottom = roiY + roiH;

      // Water edge line (starts at ~45% of video height)
      const edgeYNorm = waterEdge?.edge_y_normalized ?? 0.44;
      const edgeY = ry + rh * edgeYNorm;
      const edgeConf = waterEdge?.confidence ?? 0.92;
      const waterLevelVal = wl?.value ?? 1.84;

      // Flow physics
      const rawDirDeg = flowDirectionAngle ?? flow?.direction_deg ?? 45;
      const dirRad = (rawDirDeg * Math.PI) / 180;
      const speedMps = flow?.value ?? 0.62;
      const imageMotionPx = flow?.image_motion ?? 14.2;

      // ── 1. ROI Overlay ────────────────────────────────────────────────────────
      if (ov.roi) {
        ctx.save();
        // Dashed border
        ctx.strokeStyle = "rgba(34, 197, 94, 0.75)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(roiX, roiY, roiW, roiH);
        ctx.setLineDash([]);

        // Subtle fill tint
        ctx.fillStyle = "rgba(34, 197, 94, 0.04)";
        ctx.fillRect(roiX, roiY, roiW, roiH);

        // Tech corner brackets
        const bracketLen = Math.min(22, roiW * 0.06);
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2.5;

        // Top-left
        ctx.beginPath();
        ctx.moveTo(roiX, roiY + bracketLen);
        ctx.lineTo(roiX, roiY);
        ctx.lineTo(roiX + bracketLen, roiY);
        ctx.stroke();

        // Top-right
        ctx.beginPath();
        ctx.moveTo(roiX + roiW - bracketLen, roiY);
        ctx.lineTo(roiX + roiW, roiY);
        ctx.lineTo(roiX + roiW, roiY + bracketLen);
        ctx.stroke();

        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(roiX, roiBottom - bracketLen);
        ctx.lineTo(roiX, roiBottom);
        ctx.lineTo(roiX + bracketLen, roiBottom);
        ctx.stroke();

        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(roiX + roiW - bracketLen, roiBottom);
        ctx.lineTo(roiX + roiW, roiBottom);
        ctx.lineTo(roiX + roiW, roiBottom - bracketLen);
        ctx.stroke();

        // ROI badge
        ctx.font = "bold 10px monospace";
        ctx.fillStyle = "#22c55e";
        ctx.fillText(`ROI · ZONE 84%×65%`, roiX + 8, roiY + 14);
        ctx.restore();
      }

      // ── 2. Water Edge & Staff Gauge ──────────────────────────────────────────
      if (ov.water_edge) {
        ctx.save();
        // Sci-fi glowing edge line across the river
        ctx.shadowColor = "#38bdf8";
        ctx.shadowBlur = 8;
        ctx.strokeStyle = `rgba(56, 189, 248, ${0.7 + Math.sin(t * 2) * 0.15})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(rx, edgeY);
        ctx.lineTo(rx + rw, edgeY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        // Edge line confidence tag
        const tagText = `WATER EDGE · ELEV: ${waterLevelVal.toFixed(2)}m · CONF: ${(edgeConf * 100).toFixed(0)}%`;
        ctx.font = "bold 10px monospace";
        const tagW = ctx.measureText(tagText).width + 12;
        ctx.fillStyle = "rgba(12, 74, 110, 0.85)";
        ctx.fillRect(rx + 8, edgeY - 20, tagW, 16);
        ctx.strokeStyle = "#0284c7";
        ctx.lineWidth = 1;
        ctx.strokeRect(rx + 8, edgeY - 20, tagW, 16);
        ctx.fillStyle = "#38bdf8";
        ctx.fillText(tagText, rx + 14, edgeY - 8);

        // Staff Gauge (Hydrology Ruler) along the left river bank
        const gaugeX = rx + 6;
        const gaugeTop = roiY;
        const gaugeBottom = roiBottom;
        const gaugeH = gaugeBottom - gaugeTop;

        ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
        ctx.fillRect(gaugeX, gaugeTop, 24, gaugeH);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
        ctx.lineWidth = 1;
        ctx.strokeRect(gaugeX, gaugeTop, 24, gaugeH);

        // Gauge tick marks
        const numTicks = 8;
        for (let i = 0; i <= numTicks; i++) {
          const ty = gaugeTop + (gaugeH / numTicks) * i;
          const isMajor = i % 2 === 0;
          ctx.beginPath();
          ctx.moveTo(gaugeX + 16, ty);
          ctx.lineTo(gaugeX + 24, ty);
          ctx.strokeStyle = isMajor ? "#38bdf8" : "rgba(148, 163, 184, 0.6)";
          ctx.lineWidth = isMajor ? 1.5 : 1;
          ctx.stroke();
        }

        // Active water level diamond pointer on gauge
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.moveTo(gaugeX + 26, edgeY);
        ctx.lineTo(gaugeX + 32, edgeY - 4);
        ctx.lineTo(gaugeX + 32, edgeY + 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // ── 3. Flow Vectors & Moving Stream Arrows ("Follow the water with arrows") ──
      if (ov.flow_vectors) {
        ctx.save();
        const waterTop = Math.max(roiY, edgeY);
        const waterH = roiBottom - waterTop;
        const waterW = roiW;

        if (waterH > 20 && waterW > 20) {
          // A) Stationary Eulerian PIV Grid (sensor interrogation points)
          const COLS = 7;
          const ROWS = 4;
          for (let c = 0; c < COLS; c++) {
            for (let r = 0; r < ROWS; r++) {
              const nx = (c + 0.5) / COLS;
              const ny = (r + 0.5) / ROWS;
              const gx = roiX + nx * waterW;
              const gy = waterTop + ny * waterH;

              // Channel parabolic velocity profile (faster in center, slower near banks)
              const channelProfile = 0.65 + 0.65 * Math.sin(Math.PI * nx);
              // Perspective scale (closer to camera appears longer)
              const perspScale = 0.75 + 0.5 * ny;
              const localSpeed = speedMps * channelProfile;
              const arrowLen = Math.max(14, (imageMotionPx / 15) * 24 * channelProfile * perspScale);

              // Micro turbulence wave
              const waveAngle = dirRad + Math.sin(t * 2.5 + c * 0.8 + r * 1.2) * 0.08;
              const ex = gx + Math.cos(waveAngle) * arrowLen;
              const ey = gy + Math.sin(waveAngle) * arrowLen;

              const gridColor = getVelocityColor(localSpeed, 0.45);

              // Station anchor circle
              ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
              ctx.beginPath();
              ctx.arc(gx, gy, 1.8, 0, Math.PI * 2);
              ctx.fill();

              // Vector arrow shaft
              ctx.strokeStyle = gridColor;
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              ctx.moveTo(gx, gy);
              ctx.lineTo(ex, ey);
              ctx.stroke();

              // Vector arrow head
              const ha = Math.atan2(ey - gy, ex - gx);
              const headLen = 5.5 * perspScale;
              ctx.fillStyle = gridColor;
              ctx.beginPath();
              ctx.moveTo(ex, ey);
              ctx.lineTo(ex - Math.cos(ha - 0.45) * headLen, ey - Math.sin(ha - 0.45) * headLen);
              ctx.lineTo(ex - Math.cos(ha + 0.45) * headLen, ey - Math.sin(ha + 0.45) * headLen);
              ctx.closePath();
              ctx.fill();
            }
          }

          // B) Dynamic Lagrangian Flowing Arrows (particles that actively follow the river current)
          if (isRunning) {
            const particles = particlesRef.current;
            const flowSpeedPx = (imageMotionPx / 12) * 85; // Screen px per second

            for (let i = 0; i < particles.length; i++) {
              const p = particles[i];

              // Natural velocity profile
              const channelProfile = 0.6 + 0.7 * Math.sin(Math.PI * p.x);
              const perspScale = 0.65 + 0.7 * p.y;
              const currentSpeed = flowSpeedPx * channelProfile * perspScale * p.speedFactor;

              // Move particle along flow direction vector
              const dx = Math.cos(dirRad) * currentSpeed * dt;
              const dy = Math.sin(dirRad) * currentSpeed * dt;

              p.x += dx / waterW;
              p.y += dy / waterH;
              p.life += dt;

              // Convert normalized position to screen pixels
              const curPx = roiX + p.x * waterW;
              const curPy = waterTop + p.y * waterH;

              // Keep trailing path
              p.trail.push({ x: curPx, y: curPy });
              if (p.trail.length > 6) p.trail.shift();

              // Respawn if out of river water bounds or expired
              if (p.x < -0.05 || p.x > 1.05 || p.y > 1.05 || p.life > p.maxLife) {
                p.x = 0.05 + Math.random() * 0.9;
                p.y = 0.01 + Math.random() * 0.08; // Respawn upstream near water edge
                p.life = 0;
                p.maxLife = 2.2 + Math.random() * 2.0;
                p.speedFactor = 0.8 + Math.random() * 0.4;
                p.trail = [];
                continue;
              }

              // Draw flowing streamline trail
              if (p.trail.length >= 2) {
                ctx.beginPath();
                ctx.moveTo(p.trail[0].x, p.trail[0].y);
                for (let k = 1; k < p.trail.length; k++) {
                  ctx.lineTo(p.trail[k].x, p.trail[k].y);
                }
                const trailAlpha = Math.min(1, p.life / 0.5) * Math.min(1, (p.maxLife - p.life) / 0.5);
                ctx.strokeStyle = getVelocityColor(speedMps * channelProfile, 0.45 * trailAlpha);
                ctx.lineWidth = 1.5 * perspScale;
                ctx.stroke();
              }

              // Draw aerodynamic directional arrow head traveling with the water
              const headSize = Math.max(9, 13 * perspScale);
              const headWidth = Math.max(7, 10 * perspScale);
              const arrowColor = getVelocityColor(speedMps * channelProfile, 0.95);

              ctx.save();
              ctx.translate(curPx, curPy);
              ctx.rotate(dirRad);

              // Aerodynamic chevron arrow
              ctx.beginPath();
              ctx.moveTo(headSize * 0.6, 0); // Tip
              ctx.lineTo(-headSize * 0.6, -headWidth); // Left wing
              ctx.lineTo(-headSize * 0.2, 0); // Inset
              ctx.lineTo(-headSize * 0.6, headWidth); // Right wing
              ctx.closePath();

              // High-contrast outline so arrows pop against any video background
              ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
              ctx.lineWidth = 1.5;
              ctx.stroke();

              ctx.fillStyle = arrowColor;
              ctx.shadowColor = arrowColor;
              ctx.shadowBlur = 6;
              ctx.fill();

              ctx.restore();
            }
          }
        }
        ctx.restore();
      }

      // ── 4. Debris Tracking Boxes ─────────────────────────────────────────────
      if (ov.debris_boxes) {
        ctx.save();
        const hasDebris = isRunning && debris && (debris.count > 0 || debris.active_tracks > 0);

        if (hasDebris) {
          // Animate debris drifting downstream with the current
          const waterTop = Math.max(roiY, edgeY);
          const waterH = roiBottom - waterTop;
          const waterW = roiW;

          const deb = debrisPosRef.current;
          const flowSpeedNorm = (imageMotionPx / 15) * 0.06;
          deb.x += Math.cos(dirRad) * flowSpeedNorm * dt;
          deb.y += Math.sin(dirRad) * flowSpeedNorm * dt;

          if (deb.x > 0.9 || deb.y > 0.95 || deb.x < 0.1) {
            deb.x = 0.35 + Math.random() * 0.3;
            deb.y = 0.1 + Math.random() * 0.15;
            deb.trail = [];
          }

          const debPx = roiX + deb.x * waterW;
          const debPy = waterTop + deb.y * waterH;
          deb.trail.push({ x: debPx, y: debPy });
          if (deb.trail.length > 15) deb.trail.shift();

          // Draw debris historical drift path
          if (deb.trail.length >= 2) {
            ctx.strokeStyle = "rgba(239, 68, 68, 0.45)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(deb.trail[0].x, deb.trail[0].y);
            for (const pt of deb.trail) ctx.lineTo(pt.x, pt.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Target box with crosshairs
          const boxW = 54;
          const boxH = 42;
          const bx = debPx - boxW / 2;
          const by = debPy - boxH / 2;

          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 2;
          ctx.strokeRect(bx, by, boxW, boxH);

          // Center crosshair
          ctx.beginPath();
          ctx.moveTo(debPx - 6, debPy); ctx.lineTo(debPx + 6, debPy);
          ctx.moveTo(debPx, debPy - 6); ctx.lineTo(debPx, debPy + 6);
          ctx.stroke();

          // Label
          ctx.fillStyle = "rgba(185, 28, 28, 0.85)";
          ctx.fillRect(bx, by - 18, boxW + 42, 16);
          ctx.font = "bold 9px monospace";
          ctx.fillStyle = "#ffffff";
          ctx.fillText(`DEBRIS #01 89%`, bx + 4, by - 6);

          // Velocity tag
          ctx.font = "9px monospace";
          ctx.fillStyle = "#fca5a5";
          ctx.fillText(`v:${(speedMps * 0.95).toFixed(2)}m/s`, bx + 2, by + boxH + 12);
        }
        ctx.restore();
      }

      // ── 5. Hydrology Telemetry HUD ───────────────────────────────────────────
      if (ov.hud) {
        ctx.save();
        const fps = (camera?.fps ?? 29.8).toFixed(1);
        const velStr = flow?.calibrated && flow?.value != null ? `${flow.value.toFixed(2)} m/s` : `${imageMotionPx.toFixed(1)} px/s`;
        const wlStr = wl?.value != null ? `${wl.value.toFixed(2)} m` : `${waterLevelVal.toFixed(2)} m`;
        const degStr = `${rawDirDeg.toFixed(0)}°`;

        // Compass heading label (e.g. SE, SSE, E)
        const headings = ["E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N", "NNE", "NE", "ENE"];
        const headingIdx = Math.round(rawDirDeg / 22.5) % 16;
        const headingStr = headings[(headingIdx + 16) % 16];

        const hudW = Math.min(270, cw * 0.45);
        const hudH = 88;
        const hudX = rx + 8;
        const hudY = ry + 8;

        // Glassmorphism HUD Panel
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.fillRect(hudX, hudY, hudW, hudH);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(hudX, hudY, hudW, hudH);

        // Status Header
        ctx.font = "bold 11px monospace";
        if (isRunning) {
          ctx.fillStyle = "#22c55e";
          ctx.beginPath();
          ctx.arc(hudX + 14, hudY + 16, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText(`RIVERFLOW · FARNEBACK (${fps} FPS)`, hudX + 24, hudY + 20);
        } else {
          ctx.fillStyle = "#f59e0b";
          ctx.beginPath();
          ctx.arc(hudX + 14, hudY + 16, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText("RIVERFLOW · READY (IDLE)", hudX + 24, hudY + 20);
        }

        // Telemetry Grid
        ctx.font = "10px monospace";
        ctx.fillStyle = "#94a3b8";

        // Row 1: Velocity & Flow Direction
        ctx.fillText("SURFACE VELOCITY:", hudX + 12, hudY + 40);
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = "#38bdf8";
        ctx.fillText(velStr, hudX + 128, hudY + 40);

        ctx.font = "10px monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("FLOW DIRECTION:", hudX + 12, hudY + 56);
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = "#facc15";
        ctx.fillText(`${degStr} ${headingStr}`, hudX + 128, hudY + 56);

        // Row 2: Water Level & FPS
        ctx.font = "10px monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("WATER LEVEL:", hudX + 12, hudY + 72);
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = "#34d399";
        ctx.fillText(`${wlStr} (LiDAR)`, hudX + 128, hudY + 72);

        // Mini Velocity Color Scale Legend (Bottom Right)
        const legW = 150;
        const legH = 26;
        const legX = rx + rw - legW - 10;
        const legY = ry + rh - legH - 10;

        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.fillRect(legX, legY, legW, legH);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
        ctx.lineWidth = 1;
        ctx.strokeRect(legX, legY, legW, legH);

        // Gradient bar
        const grad = ctx.createLinearGradient(legX + 6, 0, legX + legW - 6, 0);
        grad.addColorStop(0, "rgba(56, 189, 248, 0.9)"); // 0.2 m/s
        grad.addColorStop(0.35, "rgba(52, 211, 153, 0.9)"); // 0.6 m/s
        grad.addColorStop(0.7, "rgba(250, 204, 21, 0.9)"); // 1.0 m/s
        grad.addColorStop(1, "rgba(248, 113, 113, 0.9)"); // 1.5+ m/s
        ctx.fillStyle = grad;
        ctx.fillRect(legX + 6, legY + 6, legW - 12, 6);

        ctx.font = "8px monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("0.2", legX + 6, legY + 21);
        ctx.fillText("0.6", legX + 56, legY + 21);
        ctx.fillText("1.0", legX + 96, legY + 21);
        ctx.fillText("1.5+ m/s", legX + 116, legY + 21);

        ctx.restore();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [demoUrl, latest, status, ov.roi, ov.flow_vectors, ov.water_edge, ov.debris_boxes, ov.hud, flowDirectionAngle]);

  return (
    <div
      ref={containerRef}
      className={`relative aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-black ${className}`}
    >
      {/* Priority: uploaded demo video > live stream > error / idle canvas */}
      {demoUrl ? (
        <>
          <video
            ref={videoRef}
            src={demoUrl}
            className="absolute inset-0 h-full w-full object-contain"
            autoPlay
            loop
            muted
            playsInline
          />
          {/* Overlay canvas drawn on top of the video (z-20 ensures visibility above video) */}
          <canvas
            ref={overlayRef}
            width={1280}
            height={720}
            className="pointer-events-none absolute inset-0 z-20 h-full w-full"
          />
        </>
      ) : failed ? (
        <DemoCameraPlaceholder
          overlays={ov}
          latest={latest}
          status={status}
          flowDirectionAngle={flowDirectionAngle}
        />
      ) : (
        <img
          src={src}
          alt="Live river camera"
          className="absolute inset-0 h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}

      {showStatus && (
        <span
          className={`absolute top-2 right-2 z-30 rounded px-2 py-0.5 text-[10px] font-bold tracking-widest ${
            demoUrl
              ? "bg-sky-900/80 text-sky-200 border border-sky-700"
              : failed
              ? "bg-slate-900/80 text-slate-400 border border-slate-700"
              : running
              ? "bg-emerald-900/80 text-emerald-200 border border-emerald-700"
              : "bg-slate-900/80 text-slate-300 border border-slate-600"
          }`}
        >
          {demoUrl ? "● DEMO VIDEO" : failed ? "● SIMULATION" : running ? "● LIVE" : "○ NO SIGNAL"}
        </span>
      )}
    </div>
  );
}

// ── Animated placeholder canvas (when no video uploaded yet) ────────────────────
function DemoCameraPlaceholder({
  overlays,
  latest,
  status,
  flowDirectionAngle,
}: {
  overlays: Overlays;
  latest: import("../types").LiveMeasurement | null;
  status: import("../types").SystemStatus | null;
  flowDirectionAngle?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<FlowParticle[]>(initParticles(45));
  const lastTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;

    const draw = () => {
      const now = performance.now();
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;
      const t = now / 1000;

      const W = canvas.width;
      const H = canvas.height;

      const isRunning = status?.processing?.status === "running";
      const flow = latest?.flow;
      const wl = latest?.water_level;
      const rawDirDeg = flowDirectionAngle ?? flow?.direction_deg ?? 45;
      const dirRad = (rawDirDeg * Math.PI) / 180;
      const speedMps = flow?.value ?? 0.62;
      const imageMotionPx = flow?.image_motion ?? 14.2;
      const waterLevelVal = wl?.value ?? 1.84;

      // ── Background River Landscape ─────────────────────────────────────────
      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.44);
      sky.addColorStop(0, "#091428");
      sky.addColorStop(1, "#162e4f");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // Mountains / far river banks
      ctx.fillStyle = "#0d2138";
      ctx.beginPath();
      ctx.moveTo(0, H * 0.44);
      ctx.lineTo(W * 0.25, H * 0.32);
      ctx.lineTo(W * 0.5, H * 0.38);
      ctx.lineTo(W * 0.75, H * 0.3);
      ctx.lineTo(W, H * 0.42);
      ctx.lineTo(W, H * 0.44);
      ctx.closePath();
      ctx.fill();

      // Tree line along bank
      ctx.fillStyle = "#0c281e";
      for (let x = 0; x < W; x += 16) {
        const treeH = 22 + Math.sin(x * 0.4 + t * 0.05) * 8;
        ctx.fillRect(x, H * 0.44 - treeH, 14, treeH + 4);
      }

      // River body gradient
      const river = ctx.createLinearGradient(0, H * 0.44, 0, H);
      river.addColorStop(0, "#0c3b5c");
      river.addColorStop(0.5, "#0e4d72");
      river.addColorStop(1, "#072642");
      ctx.fillStyle = river;
      ctx.fillRect(0, H * 0.44, W, H);

      // Dynamic water ripples moving with the flow
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 9; i++) {
        ctx.strokeStyle = `rgba(147, 197, 253, ${0.08 + (i % 3) * 0.05})`;
        const ry = H * 0.48 + i * (H * 0.055) + Math.sin(t * 1.5 + i) * 3;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 6) {
          const dy = Math.sin((x / W) * Math.PI * 8 + t * 2.5 + i * 1.2) * 3.5;
          x === 0 ? ctx.moveTo(x, ry + dy) : ctx.lineTo(x, ry + dy);
        }
        ctx.stroke();
      }

      const roiX = W * 0.08;
      const roiY = H * 0.22;
      const roiW = W * 0.84;
      const roiH = H * 0.65;
      const roiBottom = roiY + roiH;
      const edgeY = H * 0.44;

      // ── ROI ───────────────────────────────────────────────────────────────
      if (overlays.roi) {
        ctx.save();
        ctx.strokeStyle = "rgba(34, 197, 94, 0.75)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(roiX, roiY, roiW, roiH);
        ctx.setLineDash([]);

        const bracketLen = 22;
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2.5;

        // Top-left
        ctx.beginPath();
        ctx.moveTo(roiX, roiY + bracketLen); ctx.lineTo(roiX, roiY); ctx.lineTo(roiX + bracketLen, roiY);
        ctx.stroke();
        // Top-right
        ctx.beginPath();
        ctx.moveTo(roiX + roiW - bracketLen, roiY); ctx.lineTo(roiX + roiW, roiY); ctx.lineTo(roiX + roiW, roiY + bracketLen);
        ctx.stroke();
        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(roiX, roiBottom - bracketLen); ctx.lineTo(roiX, roiBottom); ctx.lineTo(roiX + bracketLen, roiBottom);
        ctx.stroke();
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(roiX + roiW - bracketLen, roiBottom); ctx.lineTo(roiX + roiW, roiBottom); ctx.lineTo(roiX + roiW, roiBottom - bracketLen);
        ctx.stroke();

        ctx.font = "bold 10px monospace";
        ctx.fillStyle = "#22c55e";
        ctx.fillText("ROI · ZONE 84%×65%", roiX + 8, roiY + 14);
        ctx.restore();
      }

      // ── Water Edge ────────────────────────────────────────────────────────
      if (overlays.water_edge) {
        ctx.save();
        ctx.shadowColor = "#38bdf8";
        ctx.shadowBlur = 8;
        ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(0, edgeY);
        ctx.lineTo(W, edgeY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        const tagText = `WATER EDGE · ELEV: ${waterLevelVal.toFixed(2)}m · CONF: 92%`;
        ctx.font = "bold 10px monospace";
        const tagW = ctx.measureText(tagText).width + 12;
        ctx.fillStyle = "rgba(12, 74, 110, 0.85)";
        ctx.fillRect(8, edgeY - 20, tagW, 16);
        ctx.strokeStyle = "#0284c7";
        ctx.lineWidth = 1;
        ctx.strokeRect(8, edgeY - 20, tagW, 16);
        ctx.fillStyle = "#38bdf8";
        ctx.fillText(tagText, 14, edgeY - 8);

        // Staff gauge on left
        const gaugeX = 6;
        const gaugeTop = roiY;
        const gaugeBottom = roiBottom;
        const gaugeH = gaugeBottom - gaugeTop;
        ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
        ctx.fillRect(gaugeX, gaugeTop, 24, gaugeH);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
        ctx.strokeRect(gaugeX, gaugeTop, 24, gaugeH);

        for (let i = 0; i <= 8; i++) {
          const ty = gaugeTop + (gaugeH / 8) * i;
          ctx.beginPath();
          ctx.moveTo(gaugeX + 16, ty); ctx.lineTo(gaugeX + 24, ty);
          ctx.strokeStyle = i % 2 === 0 ? "#38bdf8" : "rgba(148, 163, 184, 0.6)";
          ctx.lineWidth = i % 2 === 0 ? 1.5 : 1;
          ctx.stroke();
        }

        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.moveTo(gaugeX + 26, edgeY); ctx.lineTo(gaugeX + 32, edgeY - 4); ctx.lineTo(gaugeX + 32, edgeY + 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // ── Flow Vectors & Moving Stream Arrows ────────────────────────────────
      if (overlays.flow_vectors) {
        ctx.save();
        const waterTop = edgeY;
        const waterH = roiBottom - waterTop;
        const waterW = roiW;

        // PIV Grid
        const COLS = 7, ROWS = 4;
        for (let c = 0; c < COLS; c++) {
          for (let r = 0; r < ROWS; r++) {
            const nx = (c + 0.5) / COLS;
            const ny = (r + 0.5) / ROWS;
            const gx = roiX + nx * waterW;
            const gy = waterTop + ny * waterH;
            const channelProfile = 0.65 + 0.65 * Math.sin(Math.PI * nx);
            const perspScale = 0.75 + 0.5 * ny;
            const localSpeed = speedMps * channelProfile;
            const arrowLen = Math.max(14, (imageMotionPx / 15) * 24 * channelProfile * perspScale);
            const waveAngle = dirRad + Math.sin(t * 2.5 + c * 0.8 + r * 1.2) * 0.08;
            const ex = gx + Math.cos(waveAngle) * arrowLen;
            const ey = gy + Math.sin(waveAngle) * arrowLen;

            const gridColor = getVelocityColor(localSpeed, 0.45);
            ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
            ctx.beginPath(); ctx.arc(gx, gy, 1.8, 0, Math.PI * 2); ctx.fill();

            ctx.strokeStyle = gridColor;
            ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(ex, ey); ctx.stroke();

            const ha = Math.atan2(ey - gy, ex - gx);
            const headLen = 5.5 * perspScale;
            ctx.fillStyle = gridColor;
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(ex - Math.cos(ha - 0.45) * headLen, ey - Math.sin(ha - 0.45) * headLen);
            ctx.lineTo(ex - Math.cos(ha + 0.45) * headLen, ey - Math.sin(ha + 0.45) * headLen);
            ctx.closePath();
            ctx.fill();
          }
        }

        // Moving Stream Arrows
        if (isRunning) {
          const particles = particlesRef.current;
          const flowSpeedPx = (imageMotionPx / 12) * 85;

          for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            const channelProfile = 0.6 + 0.7 * Math.sin(Math.PI * p.x);
            const perspScale = 0.65 + 0.7 * p.y;
            const currentSpeed = flowSpeedPx * channelProfile * perspScale * p.speedFactor;

            p.x += (Math.cos(dirRad) * currentSpeed * dt) / waterW;
            p.y += (Math.sin(dirRad) * currentSpeed * dt) / waterH;
            p.life += dt;

            const curPx = roiX + p.x * waterW;
            const curPy = waterTop + p.y * waterH;

            p.trail.push({ x: curPx, y: curPy });
            if (p.trail.length > 6) p.trail.shift();

            if (p.x < -0.05 || p.x > 1.05 || p.y > 1.05 || p.life > p.maxLife) {
              p.x = 0.05 + Math.random() * 0.9;
              p.y = 0.01 + Math.random() * 0.08;
              p.life = 0;
              p.maxLife = 2.2 + Math.random() * 2.0;
              p.speedFactor = 0.8 + Math.random() * 0.4;
              p.trail = [];
              continue;
            }

            if (p.trail.length >= 2) {
              ctx.beginPath();
              ctx.moveTo(p.trail[0].x, p.trail[0].y);
              for (let k = 1; k < p.trail.length; k++) ctx.lineTo(p.trail[k].x, p.trail[k].y);
              const trailAlpha = Math.min(1, p.life / 0.5) * Math.min(1, (p.maxLife - p.life) / 0.5);
              ctx.strokeStyle = getVelocityColor(speedMps * channelProfile, 0.45 * trailAlpha);
              ctx.lineWidth = 1.5 * perspScale;
              ctx.stroke();
            }

            const headSize = Math.max(9, 13 * perspScale);
            const headWidth = Math.max(7, 10 * perspScale);
            const arrowColor = getVelocityColor(speedMps * channelProfile, 0.95);

            ctx.save();
            ctx.translate(curPx, curPy);
            ctx.rotate(dirRad);
            ctx.beginPath();
            ctx.moveTo(headSize * 0.6, 0);
            ctx.lineTo(-headSize * 0.6, -headWidth);
            ctx.lineTo(-headSize * 0.2, 0);
            ctx.lineTo(-headSize * 0.6, headWidth);
            ctx.closePath();
            ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = arrowColor;
            ctx.shadowColor = arrowColor;
            ctx.shadowBlur = 6;
            ctx.fill();
            ctx.restore();
          }
        }
        ctx.restore();
      }

      // ── HUD ───────────────────────────────────────────────────────────────
      if (overlays.hud) {
        ctx.save();
        const velStr = `${speedMps.toFixed(2)} m/s (${imageMotionPx.toFixed(1)} px/s)`;
        const wlStr = `${waterLevelVal.toFixed(2)} m`;
        const headings = ["E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW", "N", "NNE", "NE", "ENE"];
        const headingIdx = Math.round(rawDirDeg / 22.5) % 16;
        const headingStr = headings[(headingIdx + 16) % 16];

        const hudW = 270;
        const hudH = 88;
        const hudX = 8, hudY = 8;

        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.fillRect(hudX, hudY, hudW, hudH);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
        ctx.lineWidth = 1;
        ctx.strokeRect(hudX, hudY, hudW, hudH);

        ctx.font = "bold 11px monospace";
        ctx.fillStyle = isRunning ? "#22c55e" : "#f59e0b";
        ctx.beginPath(); ctx.arc(hudX + 14, hudY + 16, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillText(isRunning ? "RIVERFLOW · FARNEBACK PIV" : "RIVERFLOW · READY (IDLE)", hudX + 24, hudY + 20);

        ctx.font = "10px monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("SURFACE VELOCITY:", hudX + 12, hudY + 40);
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = "#38bdf8";
        ctx.fillText(velStr, hudX + 128, hudY + 40);

        ctx.font = "10px monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("FLOW DIRECTION:", hudX + 12, hudY + 56);
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = "#facc15";
        ctx.fillText(`${rawDirDeg.toFixed(0)}° ${headingStr}`, hudX + 128, hudY + 56);

        ctx.font = "10px monospace";
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("WATER LEVEL:", hudX + 12, hudY + 72);
        ctx.font = "bold 11px monospace";
        ctx.fillStyle = "#34d399";
        ctx.fillText(`${wlStr} (LiDAR)`, hudX + 128, hudY + 72);
        ctx.restore();
      }

      // Idle guidance text in center when not running
      if (!isRunning) {
        ctx.save();
        ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
        ctx.fillRect(W / 2 - 160, H / 2 - 20, 320, 40);
        ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
        ctx.strokeRect(W / 2 - 160, H / 2 - 20, 320, 40);
        ctx.font = "bold 13px sans-serif";
        ctx.fillStyle = "#38bdf8";
        ctx.textAlign = "center";
        ctx.fillText("Upload River Video → Start Processing", W / 2, H / 2 + 5);
        ctx.restore();
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [overlays, latest, status, flowDirectionAngle]);

  return (
    <canvas
      ref={canvasRef}
      width={1280}
      height={720}
      className="aspect-video w-full"
    />
  );
}
