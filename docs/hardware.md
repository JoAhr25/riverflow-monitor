# Hardware Integration Guide

Status: the services below are implemented and mock-tested. Real-hardware
bring-up happens on the river-station Raspberry Pi; every value coming from
a mock is flagged as DEMO MODE in the UI and database.

## TF-Luna ToF LiDAR (primary water-level sensor)

| Item | Value |
|---|---|
| Interface | UART 115200 baud (default) |
| Wiring | LiDAR TX → Pi RX (GPIO15), LiDAR RX → Pi TX (GPIO14), 5V, GND |
| Pi side | Enable the serial port with `sudo raspi-config` (Interface Options → Serial → console *off*, port *on*); use `/dev/serial0` |
| Config | Settings → Sensors → LiDAR: port, baudrate, **mounting height (m)**, datum offset |
| Measurement | `water level = mounting height − measured distance` (plus datum offset) |

The serial service requires `pyserial` (`pip install pyserial`). Without
serial hardware the service honestly reports `not_connected` — or serves
clearly-labeled mock values when demo mode + mock are enabled.

## LoRa uplink (future gateway integration)

| Item | Value |
|---|---|
| Interface | UART 9600 baud (module-dependent, e.g. REYAX RYLR890/RAK3172) |
| Wiring | Module TX → Pi RX, module RX → Pi TX, 3.3V, GND |
| Payloads | `communication/lora.py` → `build_payload()` produces compact measurement frames |
| Config | Settings → Communication → LoRa: enabled, port, baudrate, gateway endpoint |

Architecture: Pi → LoRa node → gateway → internet → cloud backend →
dashboard. The browser never touches LoRa hardware directly.

## Camera

| Item | Value |
|---|---|
| Recommended | Pi NoIR Camera Module 3 (works day/night near the water) |
| Access | OpenCV/V4L2 — device index 0 by default (Live Camera tab) |
| Resolution | 1080p recommended; inputs above 1920 px are auto-downscaled for real-time processing |
| Alternatives | Any RTSP/HTTP IP camera via the Stream tab |

## Debris AI model

See [docs/debris-model.md](debris-model.md) for training and attaching a
YOLO model. Until a model is configured, debris detection honestly reports
"Model not configured".
