"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/avatar";
import { Spinner } from "@/components/spinner";
import { useAuth } from "@/lib/useAuth";

/**
 * The user detail sheet.
 *
 * Opened by tapping a person - the counterpart in a pairwise thread, or any
 * member in a group - this is the app's answer to "who is this?". It shows the
 * name, the number and the mail address, and it is where a person is SAVED:
 * "Add to contacts" pre-fills the name field from what the sheet already knows,
 * so the common case is one tap.
 *
 * "Address(es)" is honest about what exists: there are two, the number and its
 * <number>@phonemail.com mail id. Their aliases are NOT shown - no endpoint
 * exposes another account's aliases, and inventing a list here would be fiction.
 *
 * The sheet asks /api/contacts rather than trusting a flag from the thread,
 * because the contact list is the single source of truth for "is this person
 * saved" and it is already the screen that mutates it. One GET per open.
 */

export interface UserSheetSubject {
  /** Canonical 10-digit number - the key contacts are matched on. */
  phone: string;
  /** The best name known: a contact name, or the account's own, or null. */
  name: string | null;
  /** The account's own display name, when it differs from `name`. */
  accountName?: string | null;
  /** "<number>@phonemail.com". */
  address: string;
}

interface SavedContact {
  id: string;
  address: string;
  displayName: string | null;
  accountName: string | null;
  accountPhone: string | null;
}

function phoneOf(address: string): string {
  return address.replace(/@.*$/, "");
}

/**
 * How long the save confirmation is held before the sheet closes.
 *
 * 600ms is long enough to read one word and see the check, short enough that it
 * never feels like waiting - and the reader can still dismiss the sheet during
 * it, because the sheet's own close control stays live.
 */
export const SAVE_MORPH_HOLD_MS = 600;

/**
 * ROUND 9: the save block, morphed into its confirmation.
 *
 * A green disc with a white check mark, the word "Saved" beside it, on the design
 * system's own `success` token and the established easing (cubic-bezier(0.22, 1,
 * 0.36, 1) - the curve the sheets enter on, via .save-morph in globals.css). No
 * bounce: `soft-spring` is for things that arrive, not for things that confirm.
 *
 * `role="status"` makes it announce itself, so the confirmation is not only a
 * visual one.
 */
function SavedMorph() {
  return (
    <div
      className="save-morph flex min-h-0 h-12 items-center justify-center gap-2 rounded-full bg-success-soft px-5"
      role="status"
      aria-live="polite"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="#ffffff"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <span className="text-sm font-bold text-success">Saved</span>
    </div>
  );
}

export function UserSheet({
  onDeleteChat,
  subject,
  onClose,
  onSaved,
}: {
  subject: UserSheetSubject;
  onClose: () => void;
  /**
   * ROUND 4: called with the name that now applies the moment a save succeeds,
   * so the screen underneath can show it WITHOUT a reload - the thread adopts the
   * name immediately, which is the whole point of having saved it. The sheet then
   * closes itself: the save is the end of the interaction, and leaving the sheet
   * open just makes the reader dismiss it.
   */
  onSaved?: (name: string | null) => void;
  /**
   * Day 9: delete this chat, from the sheet that already owns the person. Present
   * only where the caller can act on it, so the action never appears as a dead end.
   */
  onDeleteChat?: () => Promise<void> | void;
}) {
  const { authorizedFetch } = useAuth();

  const [contacts, setContacts] = useState<SavedContact[] | null>(null);
  const [nameDraft, setNameDraft] = useState(subject.name?.trim() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /**
   * ROUND 9: the animated save confirmation. "saving" is the network phase,
   * "saved" is the morph on screen - the block becomes the green disc, holds,
   * then the sheet closes. Two pieces of state rather than one because the
   * spinner and the confirmation are different things to look at.
   */
  const [savePhase, setSavePhase] = useState<"idle" | "saving" | "saved">("idle");
  const closeTimer = useRef<number | null>(null);

  // A sheet dismissed from the outside while the morph is holding must not leave
  // a timer pointing at an unmounted component.
  useEffect(
    () => () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
      }
    },
    [],
  );

  /**
   * Holds the confirmation, then closes. The hold is the point: the reader has to
   * SEE that it saved. Reduced-motion readers get the same outcome without the
   * wait, because for them the animation is not the feedback.
   */
  function scheduleCloseAfterMorph() {
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closeTimer.current = window.setTimeout(
      () => {
        onClose();
      },
      reduceMotion ? 0 : SAVE_MORPH_HOLD_MS,
    );
  }

  const loadContacts = useCallback(async () => {
    try {
      const response = await authorizedFetch("/api/contacts");
      if (!response.ok) {
        setContacts([]);
        return;
      }
      const body = (await response.json()) as { contacts?: SavedContact[] };
      setContacts(body.contacts ?? []);
    } catch {
      // A failed read must not block the add form, so the state falls back to
      // "unknown, not saved" and the POST will still be the source of truth.
      setContacts([]);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const saved = (contacts ?? []).find((contact) => phoneOf(contact.address) === subject.phone) ?? null;

  async function addContact() {
    setBusy(true);
    setError(null);
    setNotice(null);
    setSavePhase("saving");
    try {
      const response = await authorizedFetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: subject.phone,
          ...(nameDraft.trim() ? { displayName: nameDraft.trim() } : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        updated?: boolean;
      };
      if (!response.ok) {
        setError(body.error ?? "Could not save that contact.");
        setSavePhase("idle");
        return;
      }
      // The name is handed up FIRST, while this component is still mounted, so the
      // chat behind the sheet shows it immediately - the confirmation must not be
      // what the reader waits on to see the name change.
      onSaved?.(nameDraft.trim() || null);
      // ROUND 9: the confirmation is no longer a line of text. The save block MORPHS
      // into a green disc with a white check and the word "Saved", holds ~600ms, and
      // then the sheet closes itself - one smooth transition, nothing to dismiss.
      setSavePhase("saved");
      scheduleCloseAfterMorph();
      // The contact-list refresh is deliberately NOT awaited: it must not hold the
      // morph, and the sheet has already decided to close.
      void loadContacts();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeContact(id: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authorizedFetch(`/api/contacts/${id}`, { method: "DELETE" });
      if (!response.ok) {
        setError("Could not remove that contact.");
        return;
      }
      setNotice("Removed from your contacts.");
      await loadContacts();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const shownName = saved?.displayName?.trim() || subject.name?.trim() || subject.phone;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" role="dialog" aria-modal="true" aria-label={`Details for ${shownName}`}>
      <button
        type="button"
        aria-label="Close details"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
      />

      <div className="relative z-10 flex w-full max-w-phone flex-col rounded-t-[28px] bg-chat-sheet px-5 pb-8 pt-3 shadow-overlay">
        <span className="mx-auto mb-4 h-1 w-10 shrink-0 rounded-full bg-outline-variant" aria-hidden="true" />

        <div className="flex items-center gap-4">
          <Avatar size={64} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-headline text-[19px] font-bold leading-tight text-on-surface">
              {shownName}
            </p>
            <p className="mt-0.5 truncate text-[13px] text-chat-meta">
              {saved ? "In your contacts" : subject.accountName?.trim() ? "PhoneMail account" : "Not in your contacts"}
            </p>
          </div>
        </div>

        <dl className="mt-5 flex flex-col gap-3 border-t border-outline-variant pt-5">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-[13px] font-semibold text-chat-meta">Number</dt>
            <dd className="select-all truncate text-[15px] text-on-surface">{subject.phone}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-[13px] font-semibold text-chat-meta">Address</dt>
            <dd className="select-all truncate text-[15px] text-on-surface">
              {subject.address || `${subject.phone}@phonemail.com`}
            </dd>
          </div>
          {subject.accountName?.trim() && subject.accountName.trim() !== shownName && (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-[13px] font-semibold text-chat-meta">Their own name</dt>
              <dd className="truncate text-[15px] text-on-surface">{subject.accountName.trim()}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6">
          {saved ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-chat-meta">
                Saved in your contacts{saved.displayName ? ` as ${saved.displayName}` : " (no name yet)"}.
              </p>
              <div className="flex gap-2">
                <label className="sr-only" htmlFor="sheet-contact-name">
                  Contact name
                </label>
                <input
                  id="sheet-contact-name"
                  className="flex-1 rounded-full border border-outline-variant bg-chat-field px-4 py-3 text-base text-on-surface outline-none placeholder:text-outline"
                  placeholder="Name this contact"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                />
                <button
                  type="button"
                  className="shrink-0 rounded-full bg-accent-soft px-5 text-sm font-semibold text-accent disabled:opacity-50"
                  onClick={() => void addContact()}
                  disabled={busy || savePhase === "saved"}
                >
                  Save
                </button>
              </div>
              {savePhase === "saved" && <SavedMorph />}
              <button
                type="button"
                className="self-start text-sm font-semibold text-wa-alert disabled:opacity-50"
                onClick={() => void removeContact(saved.id)}
                disabled={busy || savePhase === "saved"}
              >
                Remove from contacts
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-semibold text-chat-meta" htmlFor="sheet-contact-name">
                Add to contacts
              </label>
              <div className="flex gap-2">
                <input
                  id="sheet-contact-name"
                  className="flex-1 rounded-full border border-outline-variant bg-chat-field px-4 py-3 text-base text-on-surface outline-none placeholder:text-outline"
                  placeholder="Name this contact"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                />
                <button
                  type="button"
                  className="flex min-h-0 h-12 shrink-0 items-center justify-center rounded-full bg-accent px-5 text-sm font-bold text-white disabled:opacity-60"
                  onClick={() => void addContact()}
                  disabled={busy || savePhase === "saved"}
                >
                  {savePhase === "saving" ? <Spinner label="Saving" /> : "Add"}
                </button>
              </div>
              {savePhase === "saved" && <SavedMorph />}
              <p className="text-xs text-chat-meta">
                The name is pre-filled from this conversation. Leave it empty to save the number alone.
              </p>
            </div>
          )}

          {notice && <p className="mt-3 text-sm text-accent">{notice}</p>}
          {error && (
            <p className="mt-3 text-sm text-wa-alert" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* DELETE CHAT: two steps, because it is destructive and one tap is not a
            decision. The wording says exactly what happens - their copy is not touched
            - because "delete" in a chat app usually implies the opposite. */}
        {onDeleteChat && (
          <div className="mt-6">
            {confirmingDelete ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-wa-alert/40 bg-wa-alert/[0.04] p-3">
                <p className="text-sm text-on-surface">
                  Delete this chat for you? Only your side of the conversation disappears - their
                  copy stays exactly as it is, and a new mail starts it again.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex min-h-0 h-11 flex-1 items-center justify-center rounded-full bg-wa-alert text-sm font-bold text-white disabled:opacity-60"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void onDeleteChat();
                    }}
                  >
                    {busy ? <Spinner label="Deleting" /> : "Delete chat"}
                  </button>
                  <button
                    type="button"
                    className="min-h-0 h-11 flex-1 rounded-full bg-chat-rail text-sm font-semibold text-on-surface"
                    disabled={busy}
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="min-h-0 h-12 w-full rounded-full bg-chat-rail text-sm font-semibold text-wa-alert"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete chat
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          className="mt-6 min-h-0 h-12 w-full rounded-full bg-chat-rail text-sm font-semibold text-on-surface"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
