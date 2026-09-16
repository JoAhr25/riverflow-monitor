"""WebSocket broadcast manager.

The processing loop runs in a worker thread; WebSocket clients live on the
asyncio event loop. publish() is thread-safe: it schedules the broadcast on
the loop captured at application startup (lifespan).
"""
import asyncio
import json
import threading
from typing import Any

from fastapi import WebSocket


class WSManager:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = threading.RLock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        with self._lock:
            self._clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        with self._lock:
            self._clients.discard(ws)

    @property
    def client_count(self) -> int:
        with self._lock:
            return len(self._clients)

    def publish(self, payload: dict[str, Any]) -> None:
        if self._loop is None or self.client_count == 0:
            return
        data = json.dumps(payload, default=str)
        try:
            asyncio.run_coroutine_threadsafe(self._broadcast(data), self._loop)
        except RuntimeError:
            pass

    async def _broadcast(self, data: str) -> None:
        with self._lock:
            clients = list(self._clients)
        for ws in clients:
            try:
                await ws.send_text(data)
            except Exception:
                self.disconnect(ws)

    async def send_to(self, ws: WebSocket, payload: dict[str, Any]) -> None:
        await ws.send_text(json.dumps(payload, default=str))
