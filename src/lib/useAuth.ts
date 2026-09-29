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

/**
 * ROUND 22: whether THIS TAB has satisfied the app PIN.
 *
 * sessionStorage, so the lifetime is exactly the one the feature wants: a fresh
 * tab, a reopened PWA and a new browser session all start locked, while a reload
 * inside the tab the reader already unlocked does not ask again.
 */
export const PIN_UNLOCKED_STORAGE_KEY = "phonemail.pin.unlocked";

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
  /**
   * The same authorized call, but over XMLHttpRequest - because `fetch` cannot
   * report UPLOAD progress, and a 20MB attachment needs to show one. Resolves with
   * the status and the parsed body instead of a Response, since XHR gives text.
   */
  authorizedUpload: (
    input: string,
    body: FormData,
    onProgress?: (percent: number) => void,
  ) => Promise<{ status: number; body: unknown }>;
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

/**
 * ROUND 26: the same-tab broadcast. sessionStorage's own `storage` event fires
 * only in OTHER tabs, so a tab that signs in (or out) must tell its OWN components
 * itself - otherwise every useAuth() instance mounted before the change keeps its
 * stale phase for the life of the tab, which is how the desktop rail went missing
 * after a sign-in until a reload.
 */
const AUTH_CHANGED_EVENT = "phonemail:auth-changed";

function announceAuthChange() {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  } catch {
    // A browser that refuses events simply keeps the old behaviour: correct after
    // the next mount, as before.
  }
}

function clearSession() {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(PIN_UNLOCKED_STORAGE_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(USER_KEY);
  // ROUND 26: a session that ENDS must reach every instance too - a 401 in one
  // screen used to leave every other mounted component believing it was signed in.
  announceAuthChange();
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

  // ROUND 26: and re-read whenever ANOTHER instance in this tab changes the
  // session - the sign-in page announcing a token, a 401 clearing it. Without this,
  // a component mounted before the change (the desktop shell is the one that was
  // reported) never learns about it.
  useEffect(() => {
    const refresh = () => {
      setSession(readSession());
      setHydrated(true);
    };
    window.addEventListener(AUTH_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, refresh);
  }, []);

  const status: AuthStatus = !hydrated
    ? "loading"
    : session.token
      ? "authenticated"
      : "unauthenticated";

  const signIn = useCallback((nextToken: string, nextUser: AuthUser) => {
    // ROUND 22: signing in IS the proof - the reader just read a code off their own
  // SIM, so a fresh sign-in must not then be met by the PIN pad as well.
  window.sessionStorage.setItem(PIN_UNLOCKED_STORAGE_KEY, "1");
  window.sessionStorage.setItem(TOKEN_KEY, nextToken);
    window.sessionStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setSession({ token: nextToken, user: nextUser });
    setHydrated(true);
    // ROUND 26: every OTHER instance in this tab must see it too - the shell, the
    // gate, the screens already mounted. This is the line that was missing.
    announceAuthChange();
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

  const authorizedUpload = useCallback(
    (input: string, body: FormData, onProgress?: (percent: number) => void) =>
      new Promise<{ status: number; body: unknown }>((resolve, reject) => {
        const current = window.sessionStorage.getItem(TOKEN_KEY);
        const request = new XMLHttpRequest();
        request.open("POST", input);
        if (current) {
          request.setRequestHeader("Authorization", `Bearer ${current}`);
        }

        request.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        });

        request.addEventListener("load", () => {
          // Same session rule as authorizedFetch: a rejected token means the
          // session is gone, so it is cleared and the guards can act.
          if (request.status === 401) {
            clearSession();
            setSession({ token: null, user: null });
            setHydrated(true);
          }
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(request.responseText);
          } catch {
            parsed = null;
          }
          resolve({ status: request.status, body: parsed });
        });
        request.addEventListener("error", () => reject(new Error("Network error.")));
        request.addEventListener("abort", () => reject(new Error("Upload cancelled.")));

        request.send(body);
      }),
    [],
  );

  return { status, token: session.token, user: session.user, signIn, signOut, authorizedFetch, authorizedUpload };
}
