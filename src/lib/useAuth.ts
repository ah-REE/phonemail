"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Client-side auth state.
 *
 * The JWT lives in localStorage (Day 3 decision, revised on Day 6 when refresh
 * tokens land). Everything that talks to the API goes through `authorizedFetch`
 * so the Authorization header is never forgotten.
 */

const TOKEN_KEY = "phonemail.token";
const USER_KEY = "phonemail.user";

export interface AuthUser {
  id: string;
  phoneNumber: string;
  createdAt?: string;
}

export interface AuthState {
  /** Null until localStorage has been read (avoids a redirect flash on load). */
  ready: boolean;
  token: string | null;
  user: AuthUser | null;
  signIn: (token: string, user: AuthUser) => void;
  signOut: () => void;
  authorizedFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

function readUser(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function useAuth(): AuthState {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
    setUser(readUser());
    setReady(true);
  }, []);

  const signIn = useCallback((nextToken: string, nextUser: AuthUser) => {
    window.localStorage.setItem(TOKEN_KEY, nextToken);
    window.localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const authorizedFetch = useCallback(
    async (input: string, init: RequestInit = {}) => {
      const current = window.localStorage.getItem(TOKEN_KEY);
      const headers = new Headers(init.headers);
      if (current) {
        headers.set("Authorization", `Bearer ${current}`);
      }
      const response = await fetch(input, { ...init, headers });
      // A rejected token means the session is gone: clear it so the guards
      // can bounce the user back to onboarding.
      if (response.status === 401) {
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(USER_KEY);
        setToken(null);
        setUser(null);
      }
      return response;
    },
    [],
  );

  return { ready, token, user, signIn, signOut, authorizedFetch };
}
