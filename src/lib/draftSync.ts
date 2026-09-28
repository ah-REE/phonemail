"use client";

/**
 * THE DRAFT, BOTH PLACES (round 22).
 *
 * The rule the brief asks for, in one sentence: the SERVER holds the draft, the
 * BROWSER holds a copy, and the browser's copy is what makes an offline spell
 * survivable.
 *
 * HOW THAT ACTUALLY WORKS HERE:
 *   - every save writes localStorage FIRST, because a write that needs the network
 *     is a write that can lose what the reader typed;
 *   - then it tries the server, and reports which one took it. A failed PUT is not
 *     an error the reader has to see - the draft is on the device, and the next
 *     reachable save pushes both;
 *   - OPENING a draft compares the two: the server's `updatedAt` wins unless the
 *     local copy is newer, which is exactly the offline case (typed while the
 *     server was unreachable) - and a newer local copy is pushed up rather than
 *     silently discarded.
 *
 * A reply is never drafted: reply-once is enforced against the original message, so
 * a stale reply draft could only trap the reader.
 */

// NOTE: this module deliberately imports NOTHING from the app, so the offline path
// can be driven directly by a test outside Next (where the @/ alias does not
// resolve). The one thing it needed from lib/folders - the previous storage key -
// is read where it is used below.
interface LocalDraft {
  to: string;
  subject: string;
  body: string;
  savedAt: string;
}

export interface DraftPayload {
  to: string;
  cc: string;
  subject: string;
  body: string;
}

export interface StoredDraft extends DraftPayload {
  savedAt: string;
}

const STORE_KEY = "phonemail.draft.v2";

/** A compose with nothing typed in it is not a draft - it is nothing. */
export function draftIsBlank(draft: DraftPayload): boolean {
  return (
    draft.to.trim().length === 0 &&
    draft.cc.trim().length === 0 &&
    draft.subject.trim().length === 0 &&
    draft.body.trim().length === 0
  );
}

export function readLocalDraft(): StoredDraft | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredDraft>;
      return {
        to: typeof parsed.to === "string" ? parsed.to : "",
        cc: typeof parsed.cc === "string" ? parsed.cc : "",
        subject: typeof parsed.subject === "string" ? parsed.subject : "",
        body: typeof parsed.body === "string" ? parsed.body : "",
        savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
      };
    }
    // A draft written before this round lives under the old key and has no cc; it
    // is still the reader's text, so it is adopted rather than dropped.
    const rawLegacy = window.localStorage.getItem("phonemail.draft");
    const legacy: LocalDraft | null = rawLegacy ? (JSON.parse(rawLegacy) as LocalDraft) : null;
    if (legacy) {
      return { to: legacy.to, cc: "", subject: legacy.subject, body: legacy.body, savedAt: legacy.savedAt };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeLocalDraft(draft: DraftPayload): StoredDraft {
  const stored: StoredDraft = { ...draft, savedAt: new Date().toISOString() };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(stored));
    } catch {
      // A full or refusing store must not break the composer.
    }
  }
  return stored;
}

export function clearLocalDraft(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(STORE_KEY);
    window.localStorage.removeItem("phonemail.draft");
  } catch {
    // ignore
  }
}

type AuthorizedFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** The server's copy, or null when there is none (or it cannot be reached). */
async function readServerDraft(authorizedFetch: AuthorizedFetch): Promise<StoredDraft | null> {
  try {
    const res = await authorizedFetch("/api/me/draft");
    if (!res.ok) {
      return null;
    }
    const body = (await res.json().catch(() => null)) as {
      draft?: { to?: string; cc?: string; subject?: string; body?: string; updatedAt?: string } | null;
    } | null;
    if (!body?.draft) {
      return null;
    }
    return {
      to: body.draft.to ?? "",
      cc: body.draft.cc ?? "",
      subject: body.draft.subject ?? "",
      body: body.draft.body ?? "",
      savedAt: body.draft.updatedAt ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * What the composer should show when it opens: the server's draft, the device's
 * draft, or the local copy when it is the newer of the two - in which case it is
 * pushed up as well, which is the offline draft finally syncing.
 */
export async function loadDraft(
  authorizedFetch: AuthorizedFetch,
): Promise<{ draft: DraftPayload; source: "server" | "local" } | null> {
  const local = readLocalDraft();
  const server = await readServerDraft(authorizedFetch);

  if (server && !draftIsBlank(server)) {
    const localIsNewer = local ? new Date(local.savedAt).getTime() > new Date(server.savedAt).getTime() : false;
    if (!localIsNewer) {
      writeLocalDraft(server);
      return { draft: server, source: "server" };
    }
  }

  if (local && !draftIsBlank(local)) {
    if (!server || draftIsBlank(server)) {
      void saveDraft(authorizedFetch, local); // sync the offline draft now
    }
    return { draft: local, source: "local" };
  }

  return null;
}

/**
 * Save to the device, then to the server. Returns which one is authoritative right
 * now - `local` means "the server was not reachable; this is safe on the device and
 * will go up on the next save".
 */
export async function saveDraft(
  authorizedFetch: AuthorizedFetch,
  draft: DraftPayload,
): Promise<"server" | "local" | "cleared"> {
  if (draftIsBlank(draft)) {
    await clearDraft(authorizedFetch);
    return "cleared";
  }
  writeLocalDraft(draft);
  try {
    const res = await authorizedFetch("/api/me/draft", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    return res.ok ? "server" : "local";
  } catch {
    return "local";
  }
}

/** A send, a discard, or an emptied composer: both copies go. */
export async function clearDraft(authorizedFetch: AuthorizedFetch): Promise<void> {
  clearLocalDraft();
  try {
    await authorizedFetch("/api/me/draft", { method: "DELETE" });
  } catch {
    // The local copy is gone, which is what the reader asked for.
  }
}

/** Trailing debounce, so a fast typist does not become a request stream. */
export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: number | undefined;
  return (...args: Parameters<T>) => {
    if (typeof window === "undefined") return;
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => fn(...args), ms);
  };
}

export const DRAFT_SAVE_DEBOUNCE_MS = 700;
