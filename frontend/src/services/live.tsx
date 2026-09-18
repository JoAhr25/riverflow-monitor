import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { LiveMeasurement, SystemStatus } from "../types";
import { api, getApiBase } from "./api";

const MAX_POINTS = 900;

interface LiveFeed {
  connected: boolean;
  measurements: LiveMeasurement[];
  latest: LiveMeasurement | null;
  status: SystemStatus | null;
  statusError: string | null;
  refreshStatus: () => void;
}

const LiveContext = createContext<LiveFeed>({
  connected: false,
  measurements: [],
  latest: null,
  status: null,
  statusError: null,
  refreshStatus: () => {},
});

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [measurements, setMeasurements] = useState<LiveMeasurement[]>([]);
  const [latest, setLatest] = useState<LiveMeasurement | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const lastTsRef = useRef<string | null>(null);

  // Single ingestion path for measurements: dedupes by timestamp so the
  // polling fallback never double-appends what the WebSocket already pushed.
  const ingest = useCallback((m: LiveMeasurement) => {
    if (lastTsRef.current === m.timestamp) return;
    lastTsRef.current = m.timestamp;
    setLatest(m);
    setMeasurements((prev) => [...prev.slice(-(MAX_POINTS - 1)), m]);
  }, []);

  const refreshStatus = useCallback(() => {
    api.getStatus()
      .then((data: SystemStatus) => {
        setStatus(data);
        setStatusError(null);
      })
      .catch((err: Error) => setStatusError(err.message));
  }, []);

  useEffect(() => {
    let closed = false;

    const connect = () => {
      if (closed) return;
      const base = getApiBase();
      let wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/live`;
      if (base) {
        try {
          const parsed = new URL(base);
          const proto = parsed.protocol === "https:" ? "wss" : "ws";
          wsUrl = `${proto}://${parsed.host}/ws/live`;
        } catch {
          /* ignore */
        }
      }
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "snapshot") {
            if (data.measurement) {
              ingest(data.measurement);
            }
          } else {
            ingest(data);
          }
        } catch {
          /* ignore malformed */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!closed) {
          const delay = Math.min(15000, 1000 * 2 ** Math.min(retryRef.current, 4));
          retryRef.current += 1;
          timerRef.current = window.setTimeout(connect, delay);
        }
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, []);

  useEffect(() => {
    refreshStatus();
    const id = window.setInterval(refreshStatus, 5000);
    // Immediately refresh when demo processing starts/stops
    const onDemoChange = () => refreshStatus();
    window.addEventListener("rf-demo-state-change", onDemoChange);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("rf-demo-state-change", onDemoChange);
    };
  }, [refreshStatus]);

  useEffect(() => {
    const fetchLatest = () => {
      // The WebSocket already pushes real-time updates when connected;
      // this poll is the fallback (demo mode / reconnect gaps) only.
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
      api.getLatest()
        .then((res) => {
          if (res?.measurement) ingest(res.measurement);
        })
        .catch(() => {});
    };
    fetchLatest();
    const intervalId = window.setInterval(fetchLatest, 1000);
    return () => window.clearInterval(intervalId);
  }, [ingest]);

  const value = useMemo(
    () => ({ connected, measurements, latest, status, statusError, refreshStatus }),
    [connected, measurements, latest, status, statusError, refreshStatus],
  );

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive() {
  return useContext(LiveContext);
}

export function useChartSeries(field: "image_motion" | "surfaceVelocity" | "waterLevel" | "debris") {
  const { measurements } = useLive();
  return useMemo(() => {
    return measurements
      .map((m) => {
        const ts = new Date(m.timestamp).getTime();
        if (Number.isNaN(ts)) return null;
        if (field === "image_motion") {
          const v = m.flow?.image_motion;
          return v == null ? null : { t: ts, v };
        }
        if (field === "surfaceVelocity") {
          const v = m.flow?.value;
          return v == null ? null : { t: ts, v };
        }
        if (field === "waterLevel") {
          const v = m.water_level?.value;
          return v == null ? null : { t: ts, v };
        }
        const v = m.debris?.count;
        return v == null ? null : { t: ts, v };
      })
      .filter((p): p is { t: number; v: number } => p !== null);
  }, [measurements, field]);
}
