"""Benewake TF-Luna ToF LiDAR sensor service (primary water-level sensor).

Reads the standard 9-byte TF-Luna UART frames:
  [0x59 0x59] dist_L dist_H strength_L strength_H temp_L temp_H checksum

Modes:
- Hardware mode: pyserial installed + serial port configured -> real readings.
- Offline (default): no port configured -> status offline, no measurements.
- Mock mode: ONLY active when app demo_mode AND lidar.mock are both enabled.
  Mock readings are explicitly flagged "mock": true and displayed as DEMO MODE.

Water level conversion (configurable, never hard-coded):
  water_level_m = mounting_height_m - distance_m + datum_offset_m
mounting_height_m must be measured on site; without it only the raw distance
is reported.
"""
import math
import random
import threading
import time
from typing import Any, Callable

FrameCallback = Callable[[dict[str, Any]], None]


def parse_tfluna_frame(buf: bytes) -> dict[str, Any] | None:
    """Parse the first complete TF-Luna frame from a buffer.

    Returns {"distance_cm", "strength", "temperature_c"} or None if no valid frame.
    """
    i = 0
    n = len(buf)
    while i + 9 <= n:
        if buf[i] == 0x59 and buf[i + 1] == 0x59:
            frame = buf[i : i + 9]
            checksum = sum(frame[:8]) & 0xFF
            if checksum == frame[8]:
                distance_cm = frame[2] | (frame[3] << 8)
                strength = frame[4] | (frame[5] << 8)
                temp_raw = frame[6] | (frame[7] << 8)
                temperature_c = (temp_raw / 8.0) - 256.0
                return {
                    "distance_cm": distance_cm,
                    "distance_m": distance_cm / 100.0,
                    "strength": strength,
                    "temperature_c": temperature_c,
                }
            i += 1
        else:
            i += 1
    return None


class TFLunaService:
    def __init__(self, config: dict[str, Any], demo_mode: bool, callback: FrameCallback | None = None) -> None:
        self._cfg = dict(config or {})
        self._demo_mode = bool(demo_mode)
        self._callback = callback
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._serial: Any = None
        self._mock_t = random.uniform(0, 2 * math.pi)
        self.state: dict[str, Any] = {
            "status": "offline",
            "mock": False,
            "distance_m": None,
            "water_level_m": None,
            "strength": None,
            "timestamp": None,
            "message": "No serial port configured.",
        }

    @property
    def mock_enabled(self) -> bool:
        return bool(self._demo_mode and self._cfg.get("mock"))

    @property
    def enabled(self) -> bool:
        return bool(self._cfg.get("enabled", True))

    def start(self) -> dict[str, Any]:
        if not self.enabled:
            self.state = {
                "status": "disabled",
                "mock": False,
                "distance_m": None,
                "water_level_m": None,
                "strength": None,
                "timestamp": None,
                "message": "LiDAR disabled in settings.",
            }
            return self.state
        if self.mock_enabled:
            self.state = {
                "status": "mock",
                "mock": True,
                "distance_m": None,
                "water_level_m": None,
                "strength": None,
                "timestamp": None,
                "message": "DEMO MODE: simulated TF-Luna readings (clearly labeled, not real measurements).",
            }
            self._stop.clear()
            self._thread = threading.Thread(target=self._mock_loop, name="tfluna-mock", daemon=True)
            self._thread.start()
            return self.state

        port = self._cfg.get("port")
        if not port:
            self.state = {
                "status": "offline",
                "mock": False,
                "distance_m": None,
                "water_level_m": None,
                "strength": None,
                "timestamp": None,
                "message": "No serial port configured. Connect the TF-Luna and set the port in Settings.",
            }
            return self.state
        try:
            import serial  # type: ignore
        except Exception:
            self.state = {
                "status": "offline",
                "mock": False,
                "distance_m": None,
                "water_level_m": None,
                "strength": None,
                "timestamp": None,
                "message": "pyserial is not installed; cannot read the TF-Luna hardware.",
            }
            return self.state
        try:
            self._serial = serial.Serial(port, int(self._cfg.get("baudrate", 115200)), timeout=1.0)
        except Exception as exc:
            self.state = {
                "status": "offline",
                "mock": False,
                "distance_m": None,
                "water_level_m": None,
                "strength": None,
                "timestamp": None,
                "message": f"Could not open serial port {port}: {exc}",
            }
            return self.state
        self._stop.clear()
        self._thread = threading.Thread(target=self._serial_loop, name="tfluna-serial", daemon=True)
        self._thread.start()
        return self.state

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None
        if self._serial is not None:
            try:
                self._serial.close()
            except Exception:
                pass
            self._serial = None

    def restart(self, config: dict[str, Any], demo_mode: bool) -> dict[str, Any]:
        self.stop()
        self._cfg = dict(config or {})
        self._demo_mode = bool(demo_mode)
        return self.start()

    def _compute_level(self, distance_m: float | None) -> float | None:
        if distance_m is None:
            return None
        mounting = self._cfg.get("mounting_height_m")
        if not isinstance(mounting, (int, float)):
            return None
        offset = self._cfg.get("datum_offset_m") or 0.0
        return float(mounting) - float(distance_m) + float(offset)

    def _publish(self, distance_m: float | None, strength: Any, mock: bool) -> None:
        self.state = {
            "status": "mock" if mock else "online",
            "mock": mock,
            "distance_m": round(distance_m, 4) if distance_m is not None else None,
            "water_level_m": self._compute_level(distance_m),
            "strength": strength,
            "timestamp": time.time(),
            "message": ("DEMO MODE simulated reading." if mock else "Reading from TF-Luna serial port."),
            "mounting_height_configured": isinstance(self._cfg.get("mounting_height_m"), (int, float)),
        }
        if self._callback is not None:
            try:
                self._callback(self.state)
            except Exception:
                pass

    def _mock_loop(self) -> None:
        while not self._stop.is_set():
            self._mock_t += 0.05
            base = 2.31 + 0.08 * math.sin(self._mock_t) + 0.015 * math.sin(3.1 * self._mock_t)
            noise = random.uniform(-0.004, 0.004)
            self._publish(max(0.1, base + noise), 1800 + random.randint(-40, 40), mock=True)
            self._stop.wait(0.5)

    def _serial_loop(self) -> None:
        buf = b""
        while not self._stop.is_set():
            try:
                chunk = self._serial.read(64)
            except Exception as exc:
                self.state = {**self.state, "status": "offline", "message": f"Serial read error: {exc}"}
                return
            if chunk:
                buf += chunk
                parsed = parse_tfluna_frame(buf)
                if parsed:
                    buf = b""
                    self._publish(parsed["distance_m"], parsed["strength"], mock=False)
