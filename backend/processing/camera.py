"""Camera source abstraction.

Three source modes are supported:
- VideoFileSource: development video files (e.g. IMG_9373 (1).MOV) played back paced at their native frame rate
- LiveCameraSource: locally attached camera (e.g. Raspberry Pi Camera Module via OpenCV/V4L2 or a webcam)
- RemoteStreamSource: RTSP/HTTP video stream URL
"""
import time
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np


@dataclass
class SourceMeta:
    source_type: str
    label: str
    width: int | None = None
    height: int | None = None
    fps: float | None = None
    frame_count: int | None = None
    duration_s: float | None = None
    detail: dict[str, Any] = field(default_factory=dict)


class CameraSource:
    source_type = "base"

    def __init__(self, label: str) -> None:
        self.label = label
        self._cap: cv2.VideoCapture | None = None

    def open(self) -> bool:
        raise NotImplementedError

    def read(self) -> tuple[bool, np.ndarray | None]:
        if self._cap is None:
            return False, None
        return self._cap.read()

    def release(self) -> None:
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    def meta(self) -> SourceMeta:
        raise NotImplementedError

    def rewind(self) -> bool:
        return False

    @property
    def paced(self) -> bool:
        return False


class VideoFileSource(CameraSource):
    source_type = "upload"

    def __init__(self, path: str, label: str | None = None, playback_speed: float = 1.0) -> None:
        from pathlib import Path

        self.path = Path(path)
        super().__init__(label or self.path.name)
        self.playback_speed = max(0.1, float(playback_speed))
        self._loop = False

    def open(self) -> bool:
        self._cap = cv2.VideoCapture(str(self.path))
        return self._cap.isOpened()

    def meta(self) -> SourceMeta:
        if self._cap is None:
            return SourceMeta(self.source_type, self.label)
        fps = self._cap.get(cv2.CAP_PROP_FPS) or 30.0
        frames = int(self._cap.get(cv2.CAP_PROP_FRAME_COUNT))
        return SourceMeta(
            source_type=self.source_type,
            label=self.label,
            width=int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            height=int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            fps=float(fps),
            frame_count=frames,
            duration_s=(frames / fps) if fps and frames > 0 else None,
            detail={"path": str(self.path), "playback_speed": self.playback_speed},
        )

    def rewind(self) -> bool:
        if self._cap is not None:
            self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            return True
        return False

    def pace(self, video_fps: float) -> None:
        if video_fps and video_fps > 0:
            delay = 1.0 / (video_fps * self.playback_speed)
            time.sleep(delay)

    @property
    def paced(self) -> bool:
        return True


class LiveCameraSource(CameraSource):
    source_type = "camera"

    def __init__(self, device_index: int = 0, width: int | None = None, height: int | None = None, fps: int | None = None) -> None:
        super().__init__(f"Live camera (device {device_index})")
        self.device_index = int(device_index)
        self.width = width
        self.height = height
        self.fps = fps

    def open(self) -> bool:
        self._cap = cv2.VideoCapture(self.device_index)
        if not self._cap.isOpened():
            return False
        if self.width and self.height:
            self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
            self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        if self.fps:
            self._cap.set(cv2.CAP_PROP_FPS, self.fps)
        return True

    def meta(self) -> SourceMeta:
        if self._cap is None:
            return SourceMeta(self.source_type, self.label)
        return SourceMeta(
            source_type=self.source_type,
            label=self.label,
            width=int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            height=int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            fps=float(self._cap.get(cv2.CAP_PROP_FPS) or 0.0),
            detail={"device_index": self.device_index},
        )


class RemoteStreamSource(CameraSource):
    source_type = "stream"

    def __init__(self, url: str) -> None:
        super().__init__(f"Remote stream")
        self.url = url

    def open(self) -> bool:
        self._cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG)
        return self._cap.isOpened()

    def meta(self) -> SourceMeta:
        if self._cap is None:
            return SourceMeta(self.source_type, self.label)
        return SourceMeta(
            source_type=self.source_type,
            label=self.label,
            width=int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            height=int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            fps=float(self._cap.get(cv2.CAP_PROP_FPS) or 0.0),
            detail={"url": self.url},
        )


def probe_video_file(path: str) -> dict[str, Any]:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError(f"OpenCV could not open video: {path}")
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        return {
            "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            "fps": float(fps) if fps else None,
            "frame_count": frames if frames > 0 else None,
            "duration_s": (frames / fps) if fps and frames > 0 else None,
        }
    finally:
        cap.release()
