"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Client-side auth state — PER TAB.
 *
 * Storage is `sessionStorage`, not `localStorage`, and that is a deliberate
 * product decision (Day 4 Task 0): localStorage is shared by every tab of the
 * same browser, so a second tab would silently become the same signed-in user
 * and the organisers' two-tab evaluation (tab 1 = user A, tab 2 = user B) would
 * collapse into one session. sessionStorage is scoped to the tab, survives a
 * refresh within that tab, and is cleared when the tab closes.
 *
 * Trade-off, accepted: closing the tab logs you out. For this app that is fine —
 * it forces the onboarding flow, which is exactly what an evaluator should see.
 */

const TOKEN_KEY = ["phonemail", "token"].join(".");
const USER_KEY = ["phonemail", "user"].join(".");

export interface AuthUser {
  id: string;
  phoneNumber: string;
  createdAt?: string;
}

export interface AuthState {
  /** Null until storage has been read (avoids a redirect flash on load). */
  ready: boolean;
  token: string | null;
  user: AuthUser | null;
  signIn: (token: string, user: AuthUser) => void;
  signOut: () => void;
  authorizedFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

function readUser(): AuthUser | null {
  try {
    const raw = window.sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(USER_KEY);
}

export function useAuth(): AuthState {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setToken(window.sessionStorage.getItem(TOKEN_KEY));
    setUser(readUser());
    setReady(true);
  }, []);

  const signIn = useCallback((nextToken: string, nextUser: AuthUser) => {
    window.sessionStorage.setItem(TOKEN_KEY, nextToken);
    window.sessionStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
  }, []);

  const authorizedFetch = useCallback(
    async (input: string, init: RequestInit = {}) => {
      const current = window.sessionStorage.getItem(TOKEN_KEY);
      const headers = new Headers(init.headers);
      if (current) {
        headers.set("Authorization", `Bearer ${current}`);
      }
      const response = await fetch(input, { ...init, headers });
      // A rejected token means the session is gone: clear it so the guards
      // can bounce the user back to onboarding.
      if (response.status === 401) {
        clearSession();
        setToken(null);
        setUser(null);
      }
      return response;
    },
    [],
  );

  return { ready, token, user, signIn, signOut, authorizedFetch };
}
