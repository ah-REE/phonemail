"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/avatar";
import { Spinner } from "@/components/spinner";
import { SAVE_MORPH_HOLD_MS, SavedMorph } from "@/components/user-sheet";
import { useAuth } from "@/lib/useAuth";

/**
 * THE DESKTOP USER DETAIL (round 28).
 *
 * The phone's user detail sheet, drawn for the desktop reading pane: the same
 * question ("who is this?") and the same data paths, with the desktop client's
 * own chrome. Semantics are the sheet's, exactly - components/user-sheet.tsx is
 * the behavioural twin and a change to one must consider the other; only the
 * PRESENTATION is desktop, which is this codebase's parity rule (the desktop
 * composer states the same about the phone's compose screen).
 *
 * Presentation: the desktop client's overlay language is a centred card on the
 * token surface - the composer established it - so this is a centred modal, not
 * a side panel, which would introduce a second overlay pattern the desktop
 * client does not otherwise have.
 *
 * It asks /api/contacts rather than trusting a flag from the thread, because the
 * contact list is the single source of truth for "is this person saved", and one
 * GET per open is what the sheet pays too.
 */

export interface DesktopUserDetailSubject {
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

export function DesktopUserDetail({
  subject,
  onClose,
  onSaved,
}: {
  subject: DesktopUserDetailSubject;
  onClose: () => void;
  /**
   * Called with the name that now applies the moment a save succeeds, so the
   * screen underneath can show it without a reload - the sheet's own contract,
   * and the reason the reading pane's header can update while this closes.
   */
  onSaved?: (name: string | null) => void;
}) {
  const { authorizedFetch } = useAuth();

  const [contacts, setContacts] = useState<SavedContact[] | null>(null);
  const [nameDraft, setNameDraft] = useState(subject.name?.trim() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * The save confirmation, the sheet's way: "saving" is the network phase,
   * "saved" is the morph on screen - the block becomes the green disc, holds,
   * then the modal closes itself.
   */
  const [savePhase, setSavePhase] = useState<"idle" | "saving" | "saved">("idle");
  const closeTimer = useRef<number | null>(null);

  // A modal dismissed while the morph is holding must not leave a timer pointing
  // at an unmounted component.
  useEffect(
    () => () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
      }
    },
    [],
  );

  // Escape closes - the contract every overlay in this client keeps.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
      // A failed read must not block the add form: fall back to "unknown, not
      // saved" and let the POST be the source of truth, exactly as the sheet does.
      setContacts([]);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  const saved = (contacts ?? []).find((contact) => phoneOf(contact.address) === subject.phone) ?? null;

  /**
   * Holds the confirmation, then closes. Reduced-motion readers get the same
   * outcome without the wait, because for them the animation is not the feedback.
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
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not save that contact.");
        setSavePhase("idle");
        return;
      }
      // The name is handed up FIRST, while this component is still mounted, so
      // the reading pane shows it immediately - the same order the sheet keeps.
      onSaved?.(nameDraft.trim() || null);
      setSavePhase("saved");
      scheduleCloseAfterMorph();
      // The contact-list refresh is deliberately NOT awaited: it must not hold
      // the morph, and the modal has already decided to close.
      void loadContacts();
    } catch {
      setError("Network error. Please try again.");
      setSavePhase("idle");
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${shownName}`}
    >
      <button
        type="button"
        aria-label="Close details"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
      />

      <div className="relative z-10 flex w-full max-w-md flex-col rounded-card border border-outline-variant bg-surface px-6 py-5 shadow-overlay">
        <div className="flex items-center gap-4">
          <Avatar size={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-headline text-lg font-bold leading-tight text-on-surface">
              {shownName}
            </p>
            <p className="mt-0.5 truncate text-sm text-on-surface-variant">
              {saved ? "In your contacts" : subject.accountName?.trim() ? "PhoneMail account" : "Not in your contacts"}
            </p>
          </div>
        </div>

        <dl className="mt-5 flex flex-col gap-3 border-t border-outline-variant pt-5">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-sm font-semibold text-on-surface-variant">Number</dt>
            <dd className="select-all truncate text-base text-on-surface">{subject.phone}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-sm font-semibold text-on-surface-variant">Address</dt>
            <dd className="select-all truncate text-base text-on-surface">
              {subject.address || `${subject.phone}@phonemail.com`}
            </dd>
          </div>
          {subject.accountName?.trim() && subject.accountName.trim() !== shownName && (
            <div className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0 text-sm font-semibold text-on-surface-variant">Their own name</dt>
              <dd className="truncate text-base text-on-surface">{subject.accountName.trim()}</dd>
            </div>
          )}
        </dl>

        <div className="mt-6">
          {saved ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-on-surface-variant">
                Saved in your contacts{saved.displayName ? ` as ${saved.displayName}` : " (no name yet)"}.
              </p>
              <div className="flex gap-2">
                <label className="sr-only" htmlFor="desktop-detail-contact-name">
                  Contact name
                </label>
                <input
                  id="desktop-detail-contact-name"
                  className="field min-h-0 flex-1 py-2.5"
                  placeholder="Name this contact"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                />
                <button
                  type="button"
                  className="btn-quiet min-h-0 shrink-0 px-5 py-2 text-sm"
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
              <label className="text-sm font-semibold text-on-surface-variant" htmlFor="desktop-detail-contact-name">
                Add to contacts
              </label>
              <div className="flex gap-2">
                <input
                  id="desktop-detail-contact-name"
                  className="field min-h-0 flex-1 py-2.5"
                  placeholder="Name this contact"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                />
                <button
                  type="button"
                  className="btn-brand min-h-0 shrink-0 px-5 py-2 text-sm"
                  onClick={() => void addContact()}
                  disabled={busy || savePhase === "saved"}
                >
                  {savePhase === "saving" ? <Spinner label="Saving" /> : "Add"}
                </button>
              </div>
              {savePhase === "saved" && <SavedMorph />}
              <p className="text-xs text-on-surface-variant">
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

        <button type="button" className="btn-quiet mt-6 min-h-0 w-full py-2.5 text-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
