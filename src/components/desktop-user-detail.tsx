"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/avatar";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
import { Spinner } from "@/components/spinner";
import { SAVE_MORPH_HOLD_MS, SavedMorph } from "@/components/user-sheet";
import { describeAccountAge } from "@/lib/credibility";
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

/** ROUND 30: /api/users/[phone]/credibility, as the modal consumes it. */
interface Credibility {
  memberSince: string;
  sentCount: number;
  receivedCount: number;
  reportCount: number;
  viewerReported: boolean;
}

function phoneOf(address: string): string {
  return address.replace(/@.*$/, "");
}

export function DesktopUserDetail({
  subject,
  onClose,
  onSaved,
  onChatDeleted,
}: {
  subject: DesktopUserDetailSubject;
  onClose: () => void;
  /**
   * ROUND 31: called after this chat's DELETE succeeds, before the modal exits -
   * the reading pane and the middle column act on it (row collapse, empty pane).
   */
  onChatDeleted?: () => void;
  /**
   * Called with the name that now applies the moment a save succeeds, so the
   * screen underneath can show it without a reload - the sheet's own contract,
   * and the reason the reading pane's header can update while this closes.
   */
  onSaved?: (name: string | null) => void;
}) {
  const { authorizedFetch, user } = useAuth();

  const [contacts, setContacts] = useState<SavedContact[] | null>(null);
  const [nameDraft, setNameDraft] = useState(subject.name?.trim() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** ROUND 30: the trust signals + the report flow's phase. */
  const [credibility, setCredibility] = useState<Credibility | null>(null);
  const [reportPhase, setReportPhase] = useState<"idle" | "confirming" | "reported">("idle");
  /**
   * The save confirmation, the sheet's way: "saving" is the network phase,
   * "saved" is the morph on screen - the block becomes the green disc, holds,
   * then the modal closes itself.
   */
  const [savePhase, setSavePhase] = useState<"idle" | "saving" | "saved">("idle");
  /** ROUND 31: the modal's exit is animated; this is the flag it plays under. */
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
        beginClose();
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

  const loadCredibility = useCallback(async () => {
    try {
      const response = await authorizedFetch(`/api/users/${subject.phone}/credibility`);
      if (!response.ok) {
        setCredibility(null);
        return;
      }
      const body = (await response.json()) as Credibility;
      setCredibility(body);
      if (body.viewerReported) {
        setReportPhase("reported");
      }
    } catch {
      // A failed read hides the section; the report action still works and
      // the server stays the source of truth.
      setCredibility(null);
    }
  }, [authorizedFetch, subject.phone]);

  useEffect(() => {
    void loadCredibility();
  }, [loadCredibility]);

  const saved = (contacts ?? []).find((contact) => phoneOf(contact.address) === subject.phone) ?? null;

  /**
   * Holds the confirmation, then closes. Reduced-motion readers get the same
   * outcome without the wait, because for them the animation is not the feedback.
   */
  /**
   * ROUND 31: every close walks through here - the modal exits ON the curve
   * (scale 0.98 + fade, 220ms) and only then tells its owner it is gone.
   */
  function beginClose() {
    if (closingRef.current) {
      return;
    }
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(() => onClose(), prefersReducedMotion() ? 0 : MOTION.sheetExitDesktop);
  }

  function scheduleCloseAfterMorph() {
    const reduceMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closeTimer.current = window.setTimeout(
      () => {
        beginClose();
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

  /**
   * ROUND 30: file the report - the sheet's contract exactly (signal only, the
   * server keeps the pair unique), drawn for the desktop.
   */
  async function submitReport() {
    setBusy(true);
    setError(null);
    try {
      const response = await authorizedFetch(`/api/users/${subject.phone}/report`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not send that report.");
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { duplicate?: boolean };
      setReportPhase("reported");
      setCredibility((current) =>
        current
          ? { ...current, viewerReported: true, reportCount: current.reportCount + (body.duplicate ? 0 : 1) }
          : current,
      );
      // ROUND 31: the morph is seen, held, and then the modal exits on the curve.
      scheduleCloseAfterMorph();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /** ROUND 30: your own sheet shows the stats without the report action. */
  const isSelf = Boolean(user && user.phoneNumber === subject.phone);
  const accountAge = credibility ? describeAccountAge(credibility.memberSince) : null;

  const shownName = saved?.displayName?.trim() || subject.name?.trim() || subject.phone;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-on-surface/45 p-4 ${closing ? "overlay-exit" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${shownName}`}
    >
      <button
        type="button"
        aria-label="Close details"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={beginClose}
      />

      <div className={`relative z-10 flex w-full max-w-md flex-col rounded-card border border-outline-variant bg-surface px-6 py-5 shadow-overlay ${closing ? "modal-exit" : ""}`}>
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

        {/* ROUND 30: the trust signals, the sheet's section drawn on the
            desktop's card language. */}
        {credibility && accountAge && (
          <section className="mt-5 rounded-card border border-outline-variant bg-surface-container-low px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Trust</p>
            <p className="mt-2 text-sm text-on-surface">
              Member since {accountAge.since} · {accountAge.ago}
            </p>
            <p className="mt-1 text-sm text-on-surface">
              Sent {credibility.sentCount} · Received {credibility.receivedCount}
            </p>
            {credibility.reportCount > 0 && (
              <p className="mt-1 text-sm font-semibold text-wa-alert">
                Reported by {credibility.reportCount} {credibility.reportCount === 1 ? "user" : "users"}
              </p>
            )}
          </section>
        )}

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
                  className="press field min-h-0 flex-1 py-2.5"
                  placeholder="Name this contact"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                />
                <button
                  type="button"
                  className="btn-quiet press min-h-0 shrink-0 px-5 py-2 text-sm"
                  onClick={() => void addContact()}
                  disabled={busy || savePhase === "saved"}
                >
                  Save
                </button>
              </div>
              {savePhase === "saved" && <SavedMorph />}
              <button
                type="button"
                className="press self-start text-sm font-semibold text-wa-alert disabled:opacity-50"
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
                  className="press field min-h-0 flex-1 py-2.5"
                  placeholder="Name this contact"
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                />
                <button
                  type="button"
                  className="btn-brand press min-h-0 shrink-0 px-5 py-2 text-sm"
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

        {/* ROUND 30: REPORT SPAM - two steps and a settled state, the sheet's
            exact flow in the desktop's card language. Hidden on your own sheet. */}
        {!isSelf && (
          <div className="mt-4">
            {reportPhase === "reported" ? (
              <div
                className="report-morph flex min-h-0 h-10 w-full items-center justify-center gap-2 rounded-full bg-success-soft text-sm font-bold text-success"
                role="status"
              >
                Reported ✓
              </div>
            ) : reportPhase === "confirming" ? (
              <div className="flex flex-col gap-2 rounded-card border border-wa-alert/40 bg-wa-alert/[0.04] p-3">
                <p className="text-sm text-on-surface">Report this sender? Their future messages may be flagged</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="press flex min-h-0 h-10 flex-1 items-center justify-center rounded-full bg-wa-alert text-sm font-bold text-white disabled:opacity-60"
                    disabled={busy}
                    onClick={() => void submitReport()}
                  >
                    {busy ? <Spinner label="Reporting" /> : "Report"}
                  </button>
                  <button
                    type="button"
                    className="press min-h-0 h-10 flex-1 rounded-full bg-surface-container text-sm font-semibold text-on-surface"
                    disabled={busy}
                    onClick={() => setReportPhase("idle")}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="press min-h-0 h-10 w-full rounded-full bg-surface-container-low text-sm font-semibold text-wa-alert hover:bg-surface-container"
                onClick={() => setReportPhase("confirming")}
              >
                Report spam
              </button>
            )}
          </div>
        )}

        {/* ROUND 31: DELETE CHAT lands on the desktop with this session (the
            parity rule) - the phone sheet's destructive pair, same wording, and
            the same promise: only YOUR side of the conversation disappears. */}
        {!isSelf && (
          <div className="mt-4">
            {confirmingDelete ? (
              <div className="flex flex-col gap-2 rounded-card border border-wa-alert/40 bg-wa-alert/[0.04] p-3">
                <p className="text-sm text-on-surface">
                  Delete this chat for you? Only your side of the conversation disappears - their
                  copy stays exactly as it is, and a new mail starts it again.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="press flex min-h-0 h-10 flex-1 items-center justify-center rounded-full bg-wa-alert text-sm font-bold text-white disabled:opacity-60"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      setError(null);
                      void (async () => {
                        try {
                          const response = await authorizedFetch(
                            `/api/conversations/${encodeURIComponent(subject.phone)}`,
                            { method: "DELETE" },
                          );
                          if (!response.ok) {
                            throw new Error("refused");
                          }
                          setBusy(false);
                          onChatDeleted?.();
                          beginClose();
                        } catch {
                          setBusy(false);
                          setError("Could not delete that chat.");
                        }
                      })();
                    }}
                  >
                    {busy ? <Spinner label="Deleting" /> : "Delete chat"}
                  </button>
                  <button
                    type="button"
                    className="press min-h-0 h-10 flex-1 rounded-full bg-surface-container text-sm font-semibold text-on-surface"
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
                className="press min-h-0 h-10 w-full rounded-full bg-surface-container-low text-sm font-semibold text-wa-alert hover:bg-surface-container"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete chat
              </button>
            )}
          </div>
        )}

        <button type="button" className="btn-quiet mt-6 min-h-0 w-full py-2.5 text-sm" onClick={beginClose}>
          Close
        </button>
      </div>
    </div>
  );
}
