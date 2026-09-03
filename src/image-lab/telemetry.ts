// Image Security Lab · 匿名遥测客户端
// 复用 NetworkView 相同的中继地址推导逻辑，连接 /ws 后订阅 telemetry 频道。
// 发布者调用 send()，大屏调用 subscribe。事件经服务端回显，保证单一数据源。

import { useCallback, useEffect, useRef, useState } from "react";
import { defaultRelayUrl } from "../network/connection";
import type { TelemetryEvent, TelemetryRecord } from "./types";

export type TelemetryStatus = "connecting" | "online" | "offline";

const MAX_RECORDS = 60;

export interface UseTelemetryOptions {
  // 大屏需要接收事件流；纯发布端可关闭以省流量。
  subscribe?: boolean;
}

export interface TelemetryHandle {
  status: TelemetryStatus;
  events: TelemetryRecord[];
  send: (event: TelemetryEvent) => void;
  clear: () => void;
}

export function useTelemetry(options: UseTelemetryOptions = {}): TelemetryHandle {
  const subscribe = options.subscribe ?? true;
  const [status, setStatus] = useState<TelemetryStatus>("connecting");
  const [events, setEvents] = useState<TelemetryRecord[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<TelemetryEvent[]>([]);
  const seqRef = useRef(0);
  const closedRef = useRef(false);

  const flush = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const pending = queueRef.current;
    queueRef.current = [];
    pending.forEach((event) => socket.send(JSON.stringify({ type: "telemetry", event })));
  }, []);

  const send = useCallback((event: TelemetryEvent) => {
    queueRef.current.push(event);
    flush();
  }, [flush]);

  const clear = useCallback(() => setEvents([]), []);

  useEffect(() => {
    closedRef.current = false;
    let reconnectTimer = 0;

    const connect = () => {
      if (closedRef.current) return;
      let endpoint: string;
      try {
        endpoint = defaultRelayUrl(location.href);
      } catch {
        setStatus("offline");
        return;
      }
      setStatus("connecting");
      const socket = new WebSocket(endpoint);
      socketRef.current = socket;
      const current = () => socketRef.current === socket;

      socket.onopen = () => {
        if (!current()) return;
        if (subscribe) socket.send(JSON.stringify({ type: "telemetry-subscribe" }));
        setStatus("online");
        flush();
      };
      socket.onmessage = (raw) => {
        if (!current()) return;
        let data: { type?: string; event?: TelemetryEvent; serverTime?: number };
        try {
          data = JSON.parse(String(raw.data));
        } catch {
          return;
        }
        if (data.type === "telemetry" && data.event) {
          const record: TelemetryRecord = { id: seqRef.current++, event: data.event, at: data.serverTime || Date.now() };
          setEvents((prev) => [record, ...prev].slice(0, MAX_RECORDS));
        }
      };
      socket.onclose = () => {
        if (current()) socketRef.current = null;
        setStatus("offline");
        if (!closedRef.current) reconnectTimer = window.setTimeout(connect, 2500);
      };
      socket.onerror = () => socket.close();
    };

    connect();
    return () => {
      closedRef.current = true;
      window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [subscribe, flush]);

  return { status, events, send, clear };
}

// 生成一个匿名会话标识（不含用户信息），用于 session.online。
export function anonymousSessionId(): string {
  return `S-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
