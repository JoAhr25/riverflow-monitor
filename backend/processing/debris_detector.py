"""Floating debris detection.

Modular detector architecture for a YOLO-family model. The detector NEVER
fabricates detections: if no model is configured, or the inference library is
not installed, detect() returns an empty list and status explains why.
"""
import time
from typing import Any


class DebrisDetector:
    STATUS_NOT_CONFIGURED = "not_configured"
    STATUS_LIBRARY_MISSING = "library_missing"
    STATUS_ERROR = "error"
    STATUS_READY = "ready"

    def __init__(self, config: dict[str, Any] | None = None) -> None:
        cfg = config or {}
        self.enabled = bool(cfg.get("enabled", True))
        self.model_path = cfg.get("model_path")
        self.confidence_threshold = float(cfg.get("confidence_threshold", 0.5))
        self.classes = list(cfg.get("classes", ["debris"]))
        self._model: Any = None
        self._model_names: dict[int, str] | None = None
        self.status = self.STATUS_NOT_CONFIGURED
        self.status_detail = "No debris detection model configured."
        self._load_attempted = False

    def configure(self, config: dict[str, Any]) -> None:
        cfg = config or {}
        self.enabled = bool(cfg.get("enabled", True))
        self.model_path = cfg.get("model_path")
        self.confidence_threshold = float(cfg.get("confidence_threshold", 0.5))
        self.classes = list(cfg.get("classes", ["debris"]))
        self._model = None
        self._model_names = None
        self._load_attempted = False
        self.status = self.STATUS_NOT_CONFIGURED
        self.status_detail = "No debris detection model configured."

    def _try_load(self) -> None:
        self._load_attempted = True
        if not self.enabled:
            self.status = self.STATUS_NOT_CONFIGURED
            self.status_detail = "Debris AI disabled in settings."
            return
        if not self.model_path:
            self.status = self.STATUS_NOT_CONFIGURED
            self.status_detail = (
                "Model not configured. Train the YOLO debris model and set its path in Settings > Debris AI."
            )
            return
        try:
            from ultralytics import YOLO  # type: ignore
        except Exception as exc:
            self.status = self.STATUS_LIBRARY_MISSING
            self.status_detail = (
                f"ultralytics is not installed ({exc.__class__.__name__}). "
                "Install it and provide a trained model to enable debris detection."
            )
            return
        try:
            self._model = YOLO(self.model_path)
            names = getattr(self._model, "names", None)
            if isinstance(names, dict):
                self._model_names = {int(k): str(v) for k, v in names.items()}
            self.status = self.STATUS_READY
            self.status_detail = f"Model loaded: {self.model_path}"
        except Exception as exc:
            self.status = self.STATUS_ERROR
            self.status_detail = f"Failed to load model {self.model_path}: {exc}"

    def ensure_loaded(self) -> None:
        if not self._load_attempted:
            self._try_load()

    def detect(self, frame) -> list[dict[str, Any]]:
        self.ensure_loaded()
        if self.status != self.STATUS_READY or self._model is None:
            return []
        try:
            results = self._model.predict(frame, verbose=False, conf=self.confidence_threshold)
        except Exception:
            return []
        detections: list[dict[str, Any]] = []
        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue
            for box in boxes:
                cls_id = int(box.cls.item()) if box.cls is not None else -1
                cls_name = (self._model_names or {}).get(cls_id, f"class_{cls_id}")
                if self.classes and cls_name not in self.classes:
                    continue
                x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
                detections.append(
                    {
                        "class": cls_name,
                        "confidence": round(float(box.conf.item()), 3),
                        "x": x1,
                        "y": y1,
                        "width": x2 - x1,
                        "height": y2 - y1,
                        "timestamp": time.time(),
                    }
                )
        return detections

    def info(self) -> dict[str, Any]:
        self.ensure_loaded()
        return {
            "status": self.status,
            "detail": self.status_detail,
            "model_path": self.model_path,
            "confidence_threshold": self.confidence_threshold,
            "classes": self.classes,
            "enabled": self.enabled,
        }
