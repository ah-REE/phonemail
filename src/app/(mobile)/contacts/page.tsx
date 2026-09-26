"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { Avatar } from "@/components/avatar";
import { BottomBar } from "@/components/bottom-bar";
import { Spinner } from "@/components/spinner";
import { UserSheet } from "@/components/user-sheet";
import { useAuth } from "@/lib/useAuth";

/**
 * Contacts - the address book screen.
 *
 * The list is the user's own: one row per address, with the name THEY gave it.
 * A row without a name shows the account's own name if it has one, and otherwise
 * the address itself - never an invented placeholder.
 *
 * Adding goes through the same resolution the send path uses, so a number that
 * cannot receive mail cannot be saved either: the server answers 404 with the
 * reason and this screen shows it verbatim rather than paraphrasing.
 *
 * TAPPING A CONTACT OPENS THE CONVERSATION, not a compose screen. That is the
 * app's chat-first pattern: mail between two people lives in one thread, so the
 * door into it should be the thread - and a compose screen with the recipient
 * already filled is a step that only exists to be dismissed. The detail sheet is
 * one tap away on its own button, for renaming and removing.
 *
 * Removing and renaming live in that sheet, which is also where a person is saved
 * from a conversation - one component, one source of truth for what "saved" means.
 * The row's own remove button is immediate: the row goes as you tap it, and the
 * server is told afterwards.
 */

interface Contact {
  id: string;
  address: string;
  displayName: string | null;
  accountName: string | null;
  accountPhone: string | null;
  createdAt: string;
}

function phoneOf(address: string): string {
  return address.replace(/@.*$/, "");
}

export default function ContactsPage() {
  const router = useRouter();
  const { status, token, authorizedFetch } = useAuth();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addAddress, setAddAddress] = useState("");
  const [addName, setAddName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [openPhone, setOpenPhone] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch("/api/contacts");
      if (response.status === 401) {
        router.replace("/onboarding");
        return;
      }
      if (!response.ok) {
        setError("Could not load your contacts.");
        return;
      }
      const body = (await response.json()) as { contacts?: Contact[] };
      setContacts(body.contacts ?? []);
      setError(null);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [authorizedFetch, router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/onboarding");
    }
  }, [status, router]);

  useEffect(() => {
    if (token) {
      void load();
    }
  }, [token, load]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!addAddress.trim()) {
      setError("Enter a number or an alias to add.");
      return;
    }

    setBusy(true);
    try {
      const response = await authorizedFetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: addAddress.trim(),
          ...(addName.trim() ? { displayName: addName.trim() } : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(body.error ?? "Could not add that contact.");
        return;
      }

      setNotice(`Saved ${addName.trim() || addAddress.trim()} to your contacts.`);
      setAddAddress("");
      setAddName("");
      await load();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Immediate removal: the row disappears on the tap, and the server is told
   * afterwards. Nothing waits on a round trip, and nothing shows an intermediate
   * state - if the delete fails the list is re-read, so the row coming back is
   * itself the error report.
   */
  async function handleRemove(contact: Contact) {
    setError(null);
    setNotice(null);
    setContacts((current) => current.filter((row) => row.id !== contact.id));
    try {
      const response = await authorizedFetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      if (!response.ok) {
        setError("Could not remove that contact.");
        await load();
        return;
      }
      setNotice("Removed from your contacts.");
    } catch {
      setError("Network error. Please try again.");
      await load();
    }
  }

  if (status !== "authenticated") {
    return (
      <main className="flex flex-1 flex-col">
        <AppBar title="Contacts" backHref="/" />
        <div className="p-4">
          <span className="skeleton h-14 w-full rounded-card" />
        </div>
        <BottomBar active="contacts" />
      </main>
    );
  }

  const openContact = contacts.find((contact) => phoneOf(contact.address) === openPhone) ?? null;

  // The whole address book is already in memory, so the search is a filter and not
  // a request: name or address, case-insensitive, as you type.
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? contacts.filter((contact) => {
        const name = (contact.displayName?.trim() || contact.accountName?.trim() || "").toLowerCase();
        return name.includes(needle) || contact.address.toLowerCase().includes(needle);
      })
    : contacts;

  return (
    <main className="flex flex-1 flex-col pb-16">
      <AppBar title="Contacts" backHref="/" />

      {/* Search the address book as you type. */}
      <div className="px-4 pt-3">
        <div className="flex h-12 w-full items-center rounded-full bg-surface-container px-4">
          <span className="mr-3 shrink-0 text-outline" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </svg>
          </span>
          <input
            className="w-full bg-transparent p-0 text-sm text-on-surface outline-none placeholder:text-outline"
            placeholder="Search contacts"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search contacts"
          />
        </div>
      </div>

      {addOpen && (
      <form className="flex flex-col gap-2 px-4 py-4" onSubmit={handleAdd} noValidate>
        <label className="text-[13px] font-semibold text-chat-meta" htmlFor="contact-address">
          Add a contact by number or alias
        </label>
        <div className="flex gap-2">
          <input
            id="contact-address"
            className="min-w-0 flex-1 rounded-full border border-outline-variant bg-chat-field px-4 py-3 text-base text-on-surface outline-none placeholder:text-outline"
            inputMode="tel"
            placeholder="Number or alias"
            value={addAddress}
            onChange={(event) => setAddAddress(event.target.value)}
          />
          <button
            type="submit"
            className="flex h-12 shrink-0 items-center justify-center rounded-full bg-accent px-5 text-sm font-bold text-white disabled:opacity-60"
            disabled={busy}
          >
            {busy ? <Spinner label="Saving" /> : "Add"}
          </button>
        </div>
        <label className="sr-only" htmlFor="contact-name">
          Name
        </label>
        <input
          id="contact-name"
          className="rounded-full border border-outline-variant bg-chat-field px-4 py-3 text-base text-on-surface outline-none placeholder:text-outline"
          placeholder="Name (optional)"
          value={addName}
          onChange={(event) => setAddName(event.target.value)}
        />
        <p className="text-xs text-chat-meta">
          Only a number that can receive PhoneMail mail can be saved - the same rule the send screen
          uses.
        </p>
      </form>
      )}

      {notice && <p className="px-4 pb-2 text-sm text-accent">{notice}</p>}
      {error && (
        <p className="px-4 pb-2 text-sm text-wa-alert" role="alert">
          {error}
        </p>
      )}

      {loading && <p className="px-4 text-sm text-chat-meta">Loading…</p>}

      {!loading && visible.length === 0 && !error && (
        <div className="flex flex-col items-center gap-2 px-6 py-7 text-center">
          <p className="text-lg font-semibold">
            {contacts.length === 0 ? "No contacts yet" : "Nothing matches that search"}
          </p>
          <p className="text-sm text-on-surface-variant">
            {contacts.length === 0
              ? "Add one with the + button, or open a conversation and tap the person's name to save them."
              : "Try a different name or number."}
          </p>
        </div>
      )}

      <div className="flex w-full flex-col">
        {visible.map((contact) => {
          const phone = contact.accountPhone ?? phoneOf(contact.address);
          const name = contact.displayName?.trim() || contact.accountName?.trim() || phone;

          return (
            <div
              key={contact.id}
              className="flex min-h-[64px] w-full items-center gap-3 border-b border-outline-variant px-4"
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
                onClick={() => router.push(`/thread/${phone}`)}
                aria-label={`Open the conversation with ${name}`}
              >
                <Avatar size={44} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-base font-semibold text-on-surface">{name}</span>
                  <span className="mt-0.5 select-all truncate text-[13px] text-chat-meta">
                    {contact.address}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="shrink-0 rounded-full px-3 py-2 text-sm font-semibold text-chat-meta"
                aria-label={`Details for ${name}`}
                onClick={() => setOpenPhone(phone)}
              >
                Details
              </button>
              <button
                type="button"
                className="shrink-0 rounded-full px-3 py-2 text-sm font-semibold text-wa-alert"
                aria-label={`Remove ${name} from contacts`}
                onClick={() => void handleRemove(contact)}
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>

      {/* The plus: the add form lives behind it rather than taking the top of the
          screen from the list, which is what you came here for. */}
      <button
        type="button"
        aria-label={addOpen ? "Close the add form" : "Add a contact"}
        aria-expanded={addOpen}
        onClick={() => setAddOpen((open) => !open)}
        className="fixed bottom-[92px] right-6 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_10px_24px_-8px_rgba(37,99,235,0.55)] transition-all duration-ui ease-out-quint active:scale-[0.96]"
      >
        {addOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        )}
      </button>

      <BottomBar active="contacts" />

      {openContact && (
        <UserSheet
          subject={{
            phone: openContact.accountPhone ?? phoneOf(openContact.address),
            name: openContact.displayName,
            accountName: openContact.accountName,
            address: openContact.address,
          }}
          onClose={() => setOpenPhone(null)}
          onSaved={() => void load()}
        />
      )}
    </main>
  );
}
