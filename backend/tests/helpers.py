"""Shared test helpers: synthetic moving-pattern video generation."""
import cv2
import numpy as np


def make_moving_pattern_video(path, width=320, height=240, fps=30.0, frames=60, shift=(2, 1)):
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(path), fourcc, fps, (width, height))
    if not writer.isOpened():
        fourcc = cv2.VideoWriter_fourcc(*"XVID")
        writer = cv2.VideoWriter(str(path.with_suffix(".avi")), fourcc, fps, (width, height))
        path = path.with_suffix(".avi")
    rng = np.random.default_rng(42)
    base = rng.integers(0, 255, size=(height, width), dtype=np.uint8)
    try:
        for i in range(frames):
            dx = (shift[0] * i) % width
            dy = (shift[1] * i) % height
            pattern = np.roll(np.roll(base, dy, axis=0), dx, axis=1)
            frame = cv2.cvtColor(pattern, cv2.COLOR_GRAY2BGR)
            cv2.rectangle(frame, (dx % width, (dy + 60) % height), ((dx + 40) % width, (dy + 90) % height), (0, 0, 220), -1)
            writer.write(frame)
    finally:
        writer.release()
    return path
