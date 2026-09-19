# Raspberry Pi Deployment

Turn a Raspberry Pi 3/4/5 into the river-station edge node that runs the
RiverFlow Monitor backend 24/7.

## 1. Base setup

```bash
sudo apt update && sudo apt upgrade -y
# Enable the camera interface (Pi camera) via raspi-config
sudo raspi-config   # Interface Options → Camera → Enable
python3 -m pip install --upgrade pip
```

## 2. Install the backend

```bash
git clone https://github.com/JoAhr25/riverflow-monitor.git
cd riverflow-monitor/backend
python3 -m pip install -r requirements.txt
# Hardware integrations (install on the Pi):
python3 -m pip install pyserial          # TF-Luna LiDAR + LoRa serial
# optional, only if a debris model is trained:
# python3 -m pip install ultralytics
```

Quick verification (serves API on :8000, no camera needed yet):

```bash
python3 main.py --host 0.0.0.0
```

Open `http://<pi-ip>:8000/docs` from a laptop on the same network.

## 3. Autostart with systemd

Copy the service file and enable it:

```bash
sudo cp deploy/raspberry-pi/riverflow-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now riverflow-backend
sudo systemctl status riverflow-backend     # should be active (running)
journalctl -u riverflow-backend -f          # live logs
```

The unit starts the backend on boot and restarts it after crashes
(`Restart=always`). Uploads, the SQLite database and logs live in the
repository folders exactly like on a laptop.

## 4. Expose it to the internet (dashboard from anywhere)

The Pi sits on the riverbank LAN — pick one:

- **Cloudflare quick tunnel** (free, URL changes on reboot):
  `cloudflared tunnel --url http://127.0.0.1:8000`
- **Cloudflare named tunnel + your own domain** (permanent URL — recommended
  for a real station)
- Point the hosted dashboard at the URL via **Settings → Remote Backend** or
  bake it into the build with `VITE_API_BASE_URL`.

## 5. Hardware wiring

See [docs/hardware.md](../../docs/hardware.md) for the TF-Luna LiDAR and LoRa
module wiring, ports and configuration.
