"""Live smoke test against a running backend (python main.py).

Run:  python tests/smoke_live.py
"""
import asyncio
import json
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tests.helpers import make_moving_pattern_video  # noqa: E402

BASE = "http://127.0.0.1:8000"
BOUNDARY = "----RiverFlowSmoke"


def post(path, payload):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}
    )
    return json.loads(urllib.request.urlopen(req).read())


def get(path):
    return json.loads(urllib.request.urlopen(BASE + path).read())


def upload(path: Path):
    body = (
        f"--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\n"
        f"Content-Type: video/mp4\r\n\r\n"
    ).encode() + path.read_bytes() + f"\r\n--{BOUNDARY}--\r\n".encode()
    req = urllib.request.Request(
        BASE + "/api/video/upload", data=body, headers={"Content-Type": f"multipart/form-data; boundary={BOUNDARY}"}
    )
    return json.loads(urllib.request.urlopen(req).read())


def jpeg_bytes(url):
    resp = urllib.request.urlopen(url)
    return resp.read(), resp.headers.get("Content-Type")


async def listen_ws(stop_after_flow=True):
    import websockets

    got = []
    async with websockets.connect("ws://127.0.0.1:8000/ws/live") as ws:
        snap = json.loads(await ws.recv())
        print(f"[ws] snapshot type={snap.get('type')}")
        deadline = time.time() + 30
        while time.time() < deadline:
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=20))
            if msg.get("flow"):
                got.append(msg)
                if stop_after_flow:
                    break
    return got


def main():
    video = Path(__file__).parent / "smoke_video.mp4"
    make_moving_pattern_video(video, frames=450)
    print(f"[video] {video.stat().st_size} bytes")

    info = upload(video)
    print(f"[upload] {info['video_id']} {info['width']}x{info['height']} fps={info['fps']} frames={info['frame_count']}")

    start = post("/api/analysis/start", {
        "source_type": "upload", "video_id": info["video_id"],
        "playback_speed": 8.0, "roi": [0.1, 0.1, 0.8, 0.8],
    })
    print(f"[start] {start}")

    ws_messages = asyncio.run(listen_ws())
    assert ws_messages, "no flow message over websocket"
    flow = ws_messages[0]["flow"]
    print(f"[ws] flow image_motion={flow['image_motion']} px, calibrated={flow['calibrated']}, value={flow['value']}, status={flow['status']}")
    assert flow["calibrated"] is False and flow["value"] is None and flow["image_motion"] > 0

    jpeg, ctype = jpeg_bytes(f"{BASE}/api/video/frame")
    print(f"[frame] {len(jpeg)} bytes, {ctype}")
    assert len(jpeg) > 1000 and "image/jpeg" in ctype

    latest = get("/api/latest")
    print(f"[latest] live={latest['live']} ts={latest['measurement']['timestamp']}")

    hist = get("/api/history?hours=1&limit=100")
    print(f"[history] {hist['count']} rows stored")
    assert hist["count"] > 0

    time.sleep(1.0)
    print("[stop]", post("/api/analysis/stop", {}))
    video.unlink(missing_ok=True)
    for avi in Path(__file__).parent.glob("smoke_video.avi"):
        avi.unlink(missing_ok=True)
    print("SMOKE TEST OK")


if __name__ == "__main__":
    main()
