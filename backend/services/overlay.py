"""Frame overlay rendering (all overlays derive from actual processing output).

Visual language: dark translucent panels, emerald ROI brackets, speed-coloured
velocity vectors, rose debris brackets, dashed sky water-edge line. Everything
is drawn with plain OpenCV primitives and blends only over small regions so
the per-frame cost stays negligible.
"""
import time
from typing import Any

import cv2
import numpy as np

# Palette (BGR)
EMERALD = (94, 197, 34)      # #22c55e ROI
SKY = (248, 189, 56)         # #38bdf8 water edge / accents
ROSE = (78, 82, 240)         # #f0524e debris
AMBER = (16, 163, 244)       # #f4a310 warnings
BG_DARK = (18, 16, 13)       # #0d1012 panel fill
TEXT_MAIN = (240, 241, 243)  # near white
TEXT_MUTED = (168, 172, 184) # slate
BORDER = (64, 62, 58)        # subtle panel border

VEC_SLOW = (248, 189, 56)    # cyan
VEC_MID = (153, 211, 52)     # emerald
VEC_FAST = (21, 204, 250)    # amber
VEC_VFAST = (120, 120, 250)  # rose


def _speed_color(mag: float):
    """Colour per per-interval displacement magnitude (px between processed frames)."""
    if mag < 1.0:
        return VEC_SLOW
    if mag < 2.2:
        return VEC_MID
    if mag < 4.0:
        return VEC_FAST
    return VEC_VFAST


def _blend_rect(img: np.ndarray, x: int, y: int, w: int, h: int, color, alpha: float, radius: int = 8) -> None:
    """Translucent rounded rectangle blended over a small region of the frame."""
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(img.shape[1], x + w), min(img.shape[0], y + h)
    if x1 <= x0 or y1 <= y0:
        return
    region = img[y0:y1, x0:x1]
    overlay = region.copy()
    cv2.rectangle(overlay, (0, 0), (region.shape[1] - 1, region.shape[0] - 1), color, -1)
    if radius > 0:
        r = min(radius, region.shape[0] // 2, region.shape[1] // 2)
        for cx, cy in ((0, 0), (region.shape[1] - 1, 0), (0, region.shape[0] - 1), (region.shape[1] - 1, region.shape[0] - 1)):
            cv2.circle(overlay, (cx if cx == 0 else cx, cy if cy == 0 else cy), r, color, -1)
        cv2.rectangle(overlay, (r, 0), (region.shape[1] - 1 - r, region.shape[0] - 1), color, -1)
        cv2.rectangle(overlay, (0, r), (region.shape[1] - 1, region.shape[0] - 1 - r), color, -1)
    cv2.addWeighted(overlay, alpha, region, 1.0 - alpha, 0, region)


def _chip(img: np.ndarray, x: int, y: int, text: str, fg, bg=None, alpha: float = 0.78, border=None) -> int:
    """Small label chip; returns its width. bg=None means solid fg background with white text."""
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.46, 1)
    pad_x, pad_y = 7, 5
    w, h = tw + 2 * pad_x, th + 2 * pad_y
    if bg is None:
        cv2.rectangle(img, (x, y), (x + w, y + h), fg, -1)
        cv2.putText(img, text, (x + pad_x, y + pad_y + th - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (255, 255, 255), 1, cv2.LINE_AA)
    else:
        _blend_rect(img, x, y, w, h, bg, alpha)
        if border is not None:
            cv2.rectangle(img, (x, y), (x + w, y + h), border, 1)
        cv2.putText(img, text, (x + pad_x, y + pad_y + th - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.46, fg, 1, cv2.LINE_AA)
    return w


def _brackets(img: np.ndarray, x: int, y: int, w: int, h: int, color, length: int, thickness: int = 2) -> None:
    """Corner-bracket rectangle (targeting style)."""
    x2, y2 = x + w, y + h
    for cx, cy, dx, dy in ((x, y, 1, 1), (x2, y, -1, 1), (x, y2, 1, -1), (x2, y2, -1, -1)):
        cv2.line(img, (cx, cy), (cx + dx * length, cy), color, thickness, cv2.LINE_AA)
        cv2.line(img, (cx, cy), (cx, cy + dy * length), color, thickness, cv2.LINE_AA)


def _dashed_line(img: np.ndarray, pt1, pt2, color, thickness: int = 2, dash: int = 18, gap: int = 12) -> None:
    x1, y1 = pt1
    x2, y2 = pt2
    length = float(np.hypot(x2 - x1, y2 - y1))
    if length < 1:
        return
    ux, uy = (x2 - x1) / length, (y2 - y1) / length
    d = 0.0
    while d < length:
        s, e = d, min(d + dash, length)
        cv2.line(img, (int(x1 + ux * s), int(y1 + uy * s)), (int(x1 + ux * e), int(y1 + uy * e)), color, thickness, cv2.LINE_AA)
        d += dash + gap


def _hud_panel(img: np.ndarray, hud_lines: list[str]) -> None:
    """Dark translucent telemetry panel with a title row and KEY: value rows."""
    rows: list[tuple[str, str]] = []
    for line in hud_lines:
        if ":" in line:
            key, _, val = line.partition(":")
            rows.append((key.strip().upper(), val.strip()))
        else:
            rows.append(("", line.strip()))
    if not rows:
        return

    h_img, w_img = img.shape[:2]
    scale = max(0.75, min(1.25, w_img / 1280.0))

    title = "RIVERFLOW MONITOR"
    t_scale, r_scale = 0.52 * scale, 0.46 * scale
    pad = int(12 * scale)
    label_w = int(max((cv2.getTextSize(k, cv2.FONT_HERSHEY_SIMPLEX, r_scale, 1)[0][0] for k, _ in rows), default=80) + 14 * scale)
    value_w = int(max((cv2.getTextSize(v, cv2.FONT_HERSHEY_SIMPLEX, r_scale, 1)[0][0] for _, v in rows), default=60))
    panel_w = min(int(w_img * 0.42), pad * 2 + label_w + value_w + 8)
    title_h = int(30 * scale)
    row_h = int(24 * scale)
    panel_h = title_h + pad + row_h * len(rows) + int(6 * scale)

    px, py = int(14 * scale), int(14 * scale)
    _blend_rect(img, px, py, panel_w, panel_h, BG_DARK, 0.66, radius=int(8 * scale))
    cv2.rectangle(img, (px, py), (px + panel_w, py + panel_h), BORDER, 1)
    cv2.rectangle(img, (px, py), (px + 3, py + panel_h), EMERALD, -1)

    # Title + status dot
    ty = py + pad + int(10 * scale)
    cv2.circle(img, (px + pad + 4, ty - 4), 4, EMERALD, -1)
    cv2.putText(img, title, (px + pad + 16, ty), cv2.FONT_HERSHEY_SIMPLEX, t_scale, TEXT_MAIN, 1, cv2.LINE_AA)
    cv2.line(img, (px + pad, ty + int(9 * scale)), (px + panel_w - pad, ty + int(9 * scale)), BORDER, 1)

    vx = px + pad + label_w
    for i, (key, val) in enumerate(rows):
        ry = ty + int(9 * scale) + pad + row_h * i + int(15 * scale)
        if key:
            cv2.putText(img, key, (px + pad, ry), cv2.FONT_HERSHEY_SIMPLEX, r_scale, TEXT_MUTED, 1, cv2.LINE_AA)
        color = TEXT_MAIN
        v = val
        if "FPS" in key:
            color = SKY
        elif "MOTION" in key or "DIR" in key:
            color = AMBER
        elif "DEBRIS" in key:
            n = "".join(c for c in val.split()[0] if c.isdigit()) if val else ""
            color = ROSE if n and n != "0" else TEXT_MAIN
        cv2.putText(img, v, (vx, ry), cv2.FONT_HERSHEY_SIMPLEX, r_scale, color, 1, cv2.LINE_AA)


def _warn_chip(img: np.ndarray, warn_line: str) -> None:
    h_img, w_img = img.shape[:2]
    scale = max(0.75, min(1.25, w_img / 1280.0))
    (tw, th), _ = cv2.getTextSize(warn_line, cv2.FONT_HERSHEY_SIMPLEX, 0.46 * scale, 1)
    w, h = tw + 26, th + 14
    x, y = int(14 * scale), h_img - h - int(14 * scale)
    _blend_rect(img, x, y, w, h, BG_DARK, 0.72, radius=6)
    cv2.rectangle(img, (x, y), (x + w, y + h), AMBER, 1)
    cv2.circle(img, (x + 12, y + h // 2), 3, AMBER, -1)
    cv2.putText(img, warn_line, (x + 20, y + h // 2 + th // 2 - 1), cv2.FONT_HERSHEY_SIMPLEX, 0.46 * scale, AMBER, 1, cv2.LINE_AA)


def draw_overlays(
    frame: np.ndarray,
    roi: tuple[int, int, int, int] | None,
    vectors: list[list[float]] | None,
    debris: list[dict[str, Any]] | None,
    water_edge: dict[str, Any] | None,
    hud_lines: list[str] | None,
    flags: dict[str, bool],
    warn_line: str | None = None,
) -> np.ndarray:
    out = frame
    h_img, w_img = out.shape[:2]
    scale = max(0.75, min(1.25, w_img / 1280.0))
    x0 = y0 = 0
    # Vector/water-edge coordinates are ROI-relative: anchor them to the ROI
    # origin regardless of whether the ROI outline itself is displayed.
    if roi is not None:
        x0, y0 = roi[0], roi[1]

    # ── ROI: translucent tint + corner brackets + label chip ──────────────
    if flags.get("roi", True) and roi is not None:
        rx, ry, rw, rh = roi
        _blend_rect(out, rx, ry, rw, rh, EMERALD, 0.05, radius=0)
        blen = int(np.clip(min(rw, rh) * 0.16, 18, 40))
        _brackets(out, rx, ry, rw, rh, EMERALD, blen, max(2, int(2 * scale)))
        _chip(out, rx + 10, ry + 10, "ROI", EMERALD, bg=BG_DARK, alpha=0.7, border=EMERALD)
        x0, y0 = rx, ry

    # ── Flow vectors: adaptive-length, speed-coloured arrows ─────────────
    # Real per-interval displacements are often just 1-3 px, which would be
    # invisible if drawn 1:1. Arrows are length-normalised for readability
    # (mean motion maps to ~26 px) while direction and colour stay truthful.
    if flags.get("flow_vectors", True) and vectors:
        mags = [float(np.hypot(u, v)) for _, _, u, v in vectors]
        live = [m for m in mags if m > 0.15]
        if live:
            mean_mag = sum(live) / len(live)
            gain = float(np.clip((26.0 * scale) / max(mean_mag, 1e-6), 1.0, 18.0))
            for (vx, vy, u, v), mag in zip(vectors, mags):
                if mag <= 0.15:
                    continue
                length = float(np.clip(mag * gain, 6.0 * scale, 64.0 * scale))
                ux, uy = u / mag, v / mag
                pt1 = (int(x0 + vx), int(y0 + vy))
                pt2 = (int(x0 + vx + ux * length), int(y0 + vy + uy * length))
                cv2.circle(out, pt1, 2, TEXT_MUTED, -1, cv2.LINE_AA)
                cv2.arrowedLine(out, pt1, pt2, _speed_color(mag), 1, cv2.LINE_AA, tipLength=0.28)

    # ── Debris: corner brackets + solid label chip + crosshair ────────────
    if flags.get("debris_boxes", True) and debris:
        for det in debris:
            x, y = int(det["x"]), int(det["y"])
            w, h = int(det["width"]), int(det["height"])
            _brackets(out, x, y, w, h, ROSE, int(np.clip(min(w, h) * 0.3, 12, 26)), 2)
            cx, cy = x + w // 2, y + h // 2
            cv2.line(out, (cx - 5, cy), (cx + 5, cy), ROSE, 1, cv2.LINE_AA)
            cv2.line(out, (cx, cy - 5), (cx, cy + 5), ROSE, 1, cv2.LINE_AA)
            label = f"{str(det.get('class', 'DEBRIS')).upper()} {int(det.get('confidence', 0) * 100)}%"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.46, 1)
            lx, ly = x, max(0, y - th - 14)
            cv2.rectangle(out, (lx, ly), (lx + tw + 14, ly + th + 10), ROSE, -1)
            cv2.putText(out, label, (lx + 7, ly + th + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (255, 255, 255), 1, cv2.LINE_AA)

    # ── Water edge: dashed sky line with soft glow + tag chip ─────────────
    if flags.get("water_edge", True) and water_edge and water_edge.get("detected") and water_edge.get("edge_y") is not None:
        ey = int(y0 + water_edge["edge_y"]) if water_edge.get("roi_relative", True) else int(water_edge["edge_y"])
        if 0 <= ey < h_img:
            _blend_rect(out, 0, max(0, ey - 3), w_img, 6, SKY, 0.18, radius=0)
            _dashed_line(out, (0, ey), (w_img, ey), SKY, 2, dash=18, gap=12)
            conf = water_edge.get("confidence")
            tag = "WATER EDGE" + (f"  {conf * 100:.0f}%" if isinstance(conf, (int, float)) and 0 < conf <= 1 else "")
            (tw, th), _ = cv2.getTextSize(tag, cv2.FONT_HERSHEY_SIMPLEX, 0.46, 1)
            tx, ty = x0 + 10, max(18, ey - th - 22)
            _chip(out, tx, ty, tag, SKY, bg=BG_DARK, alpha=0.75, border=SKY)
            tri = np.array([[tx + 16, ty + th + 12], [tx + 22, ty + th + 12], [tx + 19, ty + th + 18]], dtype=np.int32)
            cv2.fillPoly(out, [tri], SKY)

    # ── HUD panel + warning chip ──────────────────────────────────────────
    if flags.get("hud", True) and hud_lines:
        _hud_panel(out, hud_lines)
    if warn_line:
        _warn_chip(out, warn_line)

    return out


def placeholder_frame(message: str, sub_message: str = "", width: int = 960, height: int = 540) -> bytes:
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:] = (16, 15, 12)
    for row in range(height):
        t = row / height
        img[row, :] = (int(14 + 8 * t), int(16 + 6 * t), int(20 + 10 * t))
    cv2.putText(img, "RIVERFLOW MONITOR", (24, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (95, 105, 125), 1, cv2.LINE_AA)
    cv2.line(img, (width // 2 - 34, height // 2 - 52), (width // 2 + 34, height // 2 - 52), SKY, 2)
    cv2.putText(img, message, (width // 2 - 190, height // 2), cv2.FONT_HERSHEY_SIMPLEX, 0.8, TEXT_MAIN, 2, cv2.LINE_AA)
    if sub_message:
        cv2.putText(img, sub_message, (width // 2 - 230, height // 2 + 40), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (130, 138, 152), 1, cv2.LINE_AA)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return buf.tobytes() if ok else b""


def encode_jpeg(frame: np.ndarray, quality: int = 82) -> bytes | None:
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buf.tobytes() if ok else None


def timestamp_str() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")
