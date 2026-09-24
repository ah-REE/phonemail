"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

/**
 * One Socket.io connection for the screen that uses it, with the 30s polling
 * fallback the Day 3 brief requires.
 *
 * The socket carries the tab's own JWT, so two tabs are two different users —
 * that is what makes the organisers' two-tab evaluation work.
 *
 * `onNewEmail` fires for every inbound "new-email" event; `onFallbackPoll` fires
 * on the poll interval while the socket is unavailable. Screens decide what to
 * do with each (refetch, or append in place).
 */

export type RealtimeStatus = "connecting" | "socket" | "polling";

export const POLL_INTERVAL_MS = 30_000;

interface Options {
  token: string | null;
  onNewEmail?: (payload: unknown) => void;
  onFallbackPoll?: () => void;
}

export function useRealtime({ token, onNewEmail, onFallbackPoll }: Options): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  // Keep the latest handlers without re-opening the socket on every render.
  const handlers = useRef({ onNewEmail, onFallbackPoll });
  handlers.current = { onNewEmail, onFallbackPoll };

  useEffect(() => {
    if (!token) {
      return;
    }

    let socket: Socket | null = null;
    let pollTimer: number | undefined;

    const startPolling = () => {
      if (pollTimer !== undefined) {
        return;
      }
      pollTimer = window.setInterval(() => handlers.current.onFallbackPoll?.(), POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };

    try {
      socket = io({ auth: { token }, path: "/socket.io", transports: ["websocket"] });

      socket.on("connect", () => {
        stopPolling();
        setStatus("socket");
      });
      socket.on("new-email", (payload: unknown) => {
        handlers.current.onNewEmail?.(payload);
      });
      socket.on("connect_error", (error: Error) => {
        console.warn("[realtime] socket unavailable, polling instead:", error.message);
        setStatus("polling");
        startPolling();
      });
      socket.on("disconnect", () => {
        console.warn("[realtime] socket disconnected, polling instead");
        setStatus("polling");
        startPolling();
      });
    } catch (error) {
      console.warn("[realtime] socket setup failed, polling instead", error);
      setStatus("polling");
      startPolling();
    }

    return () => {
      stopPolling();
      socket?.close();
    };
  }, [token]);

  return status;
}
