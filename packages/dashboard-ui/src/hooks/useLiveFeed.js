import { useEffect, useRef, useState, useCallback } from "react";
import { getToken } from "../api";

function wsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const token = getToken();
  return `${proto}//${window.location.host}/api/ws?token=${encodeURIComponent(token || "")}`;
}

export function useLiveFeed({ botId = null, maxEvents = 50 } = {}) {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const wsRef = useRef(null);
  const retryRef = useRef(null);

  const push = useCallback(
    (event) => {
      setEvents((prev) => [event, ...prev].slice(0, maxEvents));
    },
    [maxEvents]
  );

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        retryRef.current = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (msg) => {
        let data;
        try {
          data = JSON.parse(msg.data);
        } catch {
          return;
        }
        if (data.type === "connected") return;
        if (botId && data.botId && data.botId !== botId) return;
        if (botId && data.event?.botId && data.event.botId !== botId) {
          if (data.type !== "bots_snapshot") return;
        }
        push(data);
      };
    }

    connect();
    return () => {
      clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [botId, push]);

  return { connected, events, clear: () => setEvents([]) };
}
