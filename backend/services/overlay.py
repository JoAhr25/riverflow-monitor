"""Frame overlay rendering (all overlays derive from actual processing output)."""
import time
from typing import Any

import cv2
import numpy as np

COLOR_ROI = (80, 220, 100)
COLOR_VECTOR = (255, 210, 60)
COLOR_DEBRIS = (60, 80, 255)
COLOR_EDGE = (230, 140, 60)
COLOR_HUD_BG = (24, 28, 34)
COLOR_HUD_TEXT = (235, 238, 242)
COLOR_WARN = (60, 140, 255)


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
    x0 = y0 = 0

    if flags.get("roi", True) and roi is not None:
        rx, ry, rw, rh = roi
        cv2.rectangle(out, (rx, ry), (rx + rw, ry + rh), COLOR_ROI, 2)
        cv2.putText(out, "ROI", (rx + 6, ry + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.6, COLOR_ROI, 2)
        x0, y0 = rx, ry

    if flags.get("flow_vectors", True) and vectors:
        for vx, vy, u, v in vectors:
            pt1 = (int(x0 + vx), int(y0 + vy))
            pt2 = (int(x0 + vx + u * 2), int(y0 + vy + v * 2))
            cv2.arrowedLine(out, pt1, pt2, COLOR_VECTOR, 1, tipLength=0.35)

    if flags.get("debris_boxes", True) and debris:
        for det in debris:
            x, y = int(det["x"]), int(det["y"])
            w, h = int(det["width"]), int(det["height"])
            cv2.rectangle(out, (x, y), (x + w, y + h), COLOR_DEBRIS, 2)
            label = f"{str(det.get('class', 'DEBRIS')).upper()} {int(det.get('confidence', 0) * 100)}%"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
            cv2.rectangle(out, (x, max(0, y - th - 10)), (x + tw + 8, y), COLOR_DEBRIS, -1)
            cv2.putText(out, label, (x + 4, max(12, y - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

    if flags.get("water_edge", True) and water_edge and water_edge.get("detected") and water_edge.get("edge_y") is not None:
        ey = int(y0 + water_edge["edge_y"]) if water_edge.get("roi_relative", True) else int(water_edge["edge_y"])
        h = out.shape[0]
        if 0 <= ey < h:
            cv2.line(out, (x0, ey), (out.shape[1], ey), COLOR_EDGE, 2)
            cv2.putText(out, "WATER EDGE", (x0 + 8, max(16, ey - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, COLOR_EDGE, 2)

    if flags.get("hud", True) and hud_lines:
        pad = 8
        line_h = 24
        width = out.shape[1]
        max_w = max([cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)[0][0] for line in hud_lines] + [200]) + 2 * pad
        box_h = line_h * len(hud_lines) + 2 * pad + (26 if warn_line else 0)
        overlay = out.copy()
        cv2.rectangle(overlay, (0, 0), (min(max_w, width), box_h), COLOR_HUD_BG, -1)
        cv2.addWeighted(overlay, 0.72, out, 0.28, 0, out)
        for i, line in enumerate(hud_lines):
            cv2.putText(out, line, (pad, pad + 16 + i * line_h), cv2.FONT_HERSHEY_SIMPLEX, 0.55, COLOR_HUD_TEXT, 1, cv2.FONT_HERSHEY_SIMPLEX)
        if warn_line:
            cv2.putText(out, warn_line, (pad, box_h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.55, COLOR_WARN, 1, cv2.FONT_HERSHEY_SIMPLEX)

    return out


def placeholder_frame(message: str, sub_message: str = "", width: int = 960, height: int = 540) -> bytes:
    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:] = (18, 22, 28)
    cv2.putText(img, "RIVERFLOW MONITOR", (width // 2 - 220, height // 2 - 60), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (90, 110, 140), 2)
    cv2.putText(img, message, (width // 2 - 190, height // 2), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 205, 215), 2)
    if sub_message:
        cv2.putText(img, sub_message, (width // 2 - 230, height // 2 + 44), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (120, 130, 150), 1)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return buf.tobytes() if ok else b""


def encode_jpeg(frame: np.ndarray, quality: int = 82) -> bytes | None:
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buf.tobytes() if ok else None


def timestamp_str() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")
