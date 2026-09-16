"""Debris object tracking.

Distinguishes "detections in the current frame" from "unique debris objects".
Simple centroid tracker: detections are matched to existing tracks by center
proximity. This allows counting unique objects over time instead of counting
every per-frame detection as new debris.
"""
from collections import deque
from typing import Any

import numpy as np


class CentroidTracker:
    def __init__(self, max_distance: float = 80.0, max_missing: int = 15) -> None:
        self.max_distance = float(max_distance)
        self.max_missing = int(max_missing)
        self.reset()

    def reset(self) -> None:
        self._next_id = 1
        self._tracks: dict[int, dict[str, Any]] = {}
        self.unique_total = 0
        self._recent_ids: deque[int] = deque(maxlen=200)

    def update(self, detections: list[dict[str, Any]]) -> list[dict[str, Any]]:
        detection_centers = []
        for det in detections:
            cx = det["x"] + det["width"] / 2.0
            cy = det["y"] + det["height"] / 2.0
            detection_centers.append((cx, cy))

        assigned_dets: set[int] = set()
        assigned_tracks: set[int] = set()

        track_ids = list(self._tracks.keys())
        pairs: list[tuple[float, int, int]] = []
        for ti, tid in enumerate(track_ids):
            tc = self._tracks[tid]["center"]
            for di, (cx, cy) in enumerate(detection_centers):
                dist = float(np.hypot(tc[0] - cx, tc[1] - cy))
                if dist <= self.max_distance:
                    pairs.append((dist, ti, di))
        pairs.sort(key=lambda p: p[0])

        for _, ti, di in pairs:
            if ti in assigned_tracks or di in assigned_dets:
                continue
            tid = track_ids[ti]
            cx, cy = detection_centers[di]
            self._tracks[tid]["center"] = (cx, cy)
            self._tracks[tid]["missing"] = 0
            self._tracks[tid]["frames"] += 1
            assigned_tracks.add(ti)
            assigned_dets.add(di)
            self._recent_ids.append(tid)

        for di, (cx, cy) in enumerate(detection_centers):
            if di in assigned_dets:
                continue
            tid = self._next_id
            self._next_id += 1
            self._tracks[tid] = {"center": (cx, cy), "missing": 0, "frames": 1}
            self.unique_total += 1
            assigned_dets.add(di)
            self._recent_ids.append(tid)

        for tid in list(self._tracks.keys()):
            if tid not in assigned_tracks:
                self._tracks[tid]["missing"] += 1
                if self._tracks[tid]["missing"] > self.max_missing:
                    del self._tracks[tid]

        active = []
        for di, det in enumerate(detections):
            tracked = dict(det)
            tracked["track_total_unique"] = self.unique_total
            active.append(tracked)

        return active

    @property
    def active_count(self) -> int:
        return len(self._tracks)

    def stats(self) -> dict[str, Any]:
        return {
            "unique_total": self.unique_total,
            "active_tracks": len(self._tracks),
            "note": "Per-frame detections are re-counted every frame; unique tracked objects accumulate over time.",
        }
