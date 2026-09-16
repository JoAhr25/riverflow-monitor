"""LoRa communication service.

The final system transmits summarized measurements over LoRa to a gateway and
then to the cloud dashboard. During development the gateway is typically not
connected: the service then honestly reports "not_connected" and never
simulates a real connection. A mock mode exists ONLY under app-wide DEMO MODE
and is explicitly flagged.

The service is modular so the real LoRa modem (serial AT command modem, e.g.
RAK/LoRaStick/RFM95 bridge) or an HTTP gateway ingest API can be attached
later without touching the rest of the backend.
"""
import threading
import time
from typing import Any


class LoRaService:
    def __init__(self, config: dict[str, Any], demo_mode: bool) -> None:
        self._cfg = dict(config or {})
        self._demo_mode = bool(demo_mode)
        self._lock = threading.Lock()
        self.state: dict[str, Any] = {
            "status": "not_connected",
            "mock": False,
            "last_packet": None,
            "packets_sent": 0,
            "signal": None,
            "message": "LoRa not enabled. Configure the LoRa modem/gateway in Settings.",
        }

    @property
    def mock_enabled(self) -> bool:
        return bool(self._demo_mode and self._cfg.get("mock"))

    def restart(self, config: dict[str, Any], demo_mode: bool) -> dict[str, Any]:
        self._cfg = dict(config or {})
        self._demo_mode = bool(demo_mode)
        if not self._cfg.get("enabled"):
            self.state = {
                "status": "not_connected",
                "mock": False,
                "last_packet": None,
                "packets_sent": self.state.get("packets_sent", 0),
                "signal": None,
                "message": "LoRa not enabled. Configure the LoRa modem/gateway in Settings.",
            }
            return self.state
        if self.mock_enabled:
            self.state = {
                "status": "mock",
                "mock": True,
                "last_packet": None,
                "packets_sent": self.state.get("packets_sent", 0),
                "signal": "simulated (DEMO)",
                "message": "DEMO MODE: simulated LoRa link (clearly labeled, not a real connection).",
            }
            return self.state
        port = self._cfg.get("port")
        endpoint = self._cfg.get("gateway_endpoint")
        if not port and not endpoint:
            self.state = {
                "status": "not_connected",
                "mock": False,
                "last_packet": self.state.get("last_packet"),
                "packets_sent": self.state.get("packets_sent", 0),
                "signal": None,
                "message": "LoRa enabled but no serial port or gateway endpoint configured.",
            }
            return self.state
        try:
            import serial  # type: ignore

            self._serial: Any = serial.Serial(port, int(self._cfg.get("baudrate", 9600)), timeout=1.0)
        except Exception as exc:
            self.state = {
                "status": "not_connected",
                "mock": False,
                "last_packet": self.state.get("last_packet"),
                "packets_sent": self.state.get("packets_sent", 0),
                "signal": None,
                "message": f"Could not open LoRa serial port {port}: {exc}",
            }
            return self.state
        self.state = {
            "status": "connected",
            "mock": False,
            "last_packet": self.state.get("last_packet"),
            "packets_sent": self.state.get("packets_sent", 0),
            "signal": None,
            "message": f"LoRa modem serial port open: {port}",
        }
        return self.state

    def build_payload(self, measurement: dict[str, Any]) -> dict[str, Any]:
        water = measurement.get("water_level") or {}
        flow = measurement.get("flow") or {}
        debris = measurement.get("debris") or {}
        return {
            "timestamp": measurement.get("timestamp"),
            "water_level_m": water.get("value"),
            "flow": flow.get("value") if flow.get("calibrated") else None,
            "image_motion_px": flow.get("image_motion"),
            "calibrated": bool(flow.get("calibrated")),
            "debris_count": debris.get("count"),
        }

    def send(self, measurement: dict[str, Any]) -> dict[str, Any]:
        payload = self.build_payload(measurement)
        if self.state.get("status") == "connected" and getattr(self, "_serial", None) is not None:
            try:
                data = (str(payload) + "\n").encode("utf-8")
                self._serial.write(data)
                with self._lock:
                    self.state["last_packet"] = time.time()
                    self.state["packets_sent"] = int(self.state.get("packets_sent", 0)) + 1
                return {"sent": True, "mock": False, "payload": payload}
            except Exception as exc:
                self.state["status"] = "error"
                self.state["message"] = f"LoRa send failed: {exc}"
                return {"sent": False, "mock": False, "error": str(exc), "payload": payload}
        if self.state.get("status") == "mock":
            with self._lock:
                self.state["last_packet"] = time.time()
                self.state["packets_sent"] = int(self.state.get("packets_sent", 0)) + 1
            return {"sent": True, "mock": True, "payload": payload}
        return {"sent": False, "mock": False, "error": "LoRa not connected", "payload": payload}
