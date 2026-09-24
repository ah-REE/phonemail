"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Client-side auth state — PER TAB, with an explicit three-phase lifecycle.
 *
 * Storage is `sessionStorage`, not `localStorage` (Day 4 Task 0): localStorage
 * is shared by every tab, so a second tab would silently become the same
 * signed-in user and the organisers' two-tab evaluation would collapse into one
 * account. sessionStorage is scoped to the tab, survives a refresh within it,
 * and is cleared when the tab closes. Trade-off accepted: closing a tab signs
 * you out, which forces the onboarding flow an evaluator should see.
 *
 * PHASES (the refresh-race fix):
 *   loading         -> the session has not been confirmed on this client yet
 *   authenticated   -> a token was found
 *   unauthenticated -> no token
 *
 * The session is read SYNCHRONOUSLY in the state initializer, so the moment the
 * client is mounted there is no ambiguity left to act on. Until then the phase
 * is `loading`, and the rule every screen follows is: never redirect while
 * loading. A brief skeleton on first paint is acceptable; a flash of onboarding
 * is not.
 */

const TOKEN_KEY = "phonemail.token";
const USER_KEY = "phonemail.user";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthUser {
  id: string;
  phoneNumber: string;
  createdAt?: string;
}

export interface AuthState {
  status: AuthStatus;
  token: string | null;
  user: AuthUser | null;
  signIn: (token: string, user: AuthUser) => void;
  signOut: () => void;
  authorizedFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

interface Session {
  token: string | null;
  user: AuthUser | null;
}

/** Synchronous read. There is no storage on the server, so it returns empty. */
function readSession(): Session {
  if (typeof window === "undefined") {
    return { token: null, user: null };
  }
  try {
    const token = window.sessionStorage.getItem(TOKEN_KEY);
    const raw = window.sessionStorage.getItem(USER_KEY);
    return {
      token: token && token.length > 0 ? token : null,
      user: raw ? (JSON.parse(raw) as AuthUser) : null,
    };
  } catch {
    return { token: null, user: null };
  }
}

function clearSession() {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(USER_KEY);
}

export function useAuth(): AuthState {
  // Read once, synchronously: the session is known before the first paint.
  const [session, setSession] = useState<Session>(() => readSession());
  // `hydrated` is false on the server AND on the first client render, so the
  // markup matches during hydration and the first paint is a skeleton.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Re-read after mount in case another instance wrote while we rendered.
    setSession(readSession());
    setHydrated(true);
  }, []);

  const status: AuthStatus = !hydrated
    ? "loading"
    : session.token
      ? "authenticated"
      : "unauthenticated";

  const signIn = useCallback((nextToken: string, nextUser: AuthUser) => {
    window.sessionStorage.setItem(TOKEN_KEY, nextToken);
    window.sessionStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setSession({ token: nextToken, user: nextUser });
    setHydrated(true);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setSession({ token: null, user: null });
    setHydrated(true);
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
      // can send the user back to onboarding.
      if (response.status === 401) {
        clearSession();
        setSession({ token: null, user: null });
        setHydrated(true);
      }
      return response;
    },
    [],
  );

  return { status, token: session.token, user: session.user, signIn, signOut, authorizedFetch };
}
