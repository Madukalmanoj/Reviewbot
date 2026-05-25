import { useEffect, useState } from "react";

export interface LogEvent {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  repo?: string;
  pr?: number;
}

export type SSEStatus = "connecting" | "connected" | "disconnected" | "unavailable";

export function useSSE(url: string) {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<SSEStatus>("connecting");

  useEffect(() => {
    // First check if the endpoint is available (handles Vercel serverless 503)
    let eventSource: EventSource | null = null;
    let cancelled = false;

    fetch(url, { method: "GET", headers: { Accept: "text/event-stream" } })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          // 503 = serverless mode, SSE not supported
          setStatus("unavailable");
          setIsConnected(false);
          return;
        }
        // Endpoint is available — open the real EventSource
        eventSource = new EventSource(url);

        eventSource.onopen = () => {
          if (!cancelled) {
            setIsConnected(true);
            setStatus("connected");
          }
        };

        eventSource.onmessage = (event) => {
          if (cancelled) return;
          try {
            const data = JSON.parse(event.data) as LogEvent;
            setEvents((prev) => [...prev, data]);
          } catch (err) {
            console.error("Failed to parse SSE data", err);
          }
        };

        eventSource.onerror = () => {
          if (!cancelled) {
            setIsConnected(false);
            setStatus("disconnected");
          }
          eventSource?.close();
        };
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("disconnected");
          setIsConnected(false);
        }
      });

    return () => {
      cancelled = true;
      eventSource?.close();
    };
  }, [url]);

  return { events, isConnected, status };
}
