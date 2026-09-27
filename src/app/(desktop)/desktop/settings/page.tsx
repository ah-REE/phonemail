"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Spinner } from "@/components/spinner";
import { Switch } from "@/components/switch";
import { FONT_SIZES, applyFontSize, readFontSize, type FontSizeId } from "@/lib/fontSize";
import { useAuth } from "@/lib/useAuth";

/**
 * Desktop settings - FULL PARITY WITH THE PHONE (round 9).
 *
 * Everything the phone's settings screen has lives here too, and none of it is a
 * second implementation: every control talks to the SAME endpoint the phone uses
 * (`/api/me`, `/api/aliases`, `/api/sessions`, `/api/auth/send-otp`,
 * `/api/me/delete`) and the display logic comes from the SAME modules
 * (lib/fontSize, lib/device). What differs is only the chrome, because a desktop
 * window is not a phone.
 *
 * The screen it replaces said of its two controls "visual only for now", which
 * was honest then and is not true now: the SMS switch writes real state the
 * delivery path reads (see lib/notify.ts), so it is a switch again.
 *
 * Rows, top to bottom: profile (name), aliases (add and remove), language,
 * SMS on new mail, font size, signed-in devices (with per-device logout), and
 * account deletion behind a one-time code.
 */

interface Alias {
  id: string;
  localPart: string;
  address: string;
}

interface Device {
  id: string;
  device: string;
  current: boolean;
  createdAt: string;
  lastActive: string;
}

function phoneOf(address: string): string {
  return address.replace(/@.*$/, "");
}

export default function DesktopSettingsPage() {
  const router = useRouter();
  const { status, user, authorizedFetch } = useAuth();

  const [nameDraft, setNameDraft] = useState("");
  const [savedName, setSavedName] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);

  const [aliases, setAliases] = useState<Alias[]>([]);
  const [aliasDraft, setAliasDraft] = useState("");
  const [aliasNotice, setAliasNotice] = useState<string | null>(null);
  const [aliasBusy, setAliasBusy] = useState(false);

  const [smsNotifications, setSmsNotifications] = useState(true);
  const [smsNotice, setSmsNotice] = useState<string | null>(null);
  const [smsBusy, setSmsBusy] = useState(false);

  const [fontSize, setFontSize] = useState<FontSizeId>("normal");

  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesNotice, setDevicesNotice] = useState<string | null>(null);
  const [devicesBusy, setDevicesBusy] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteOtp, setDeleteOtp] = useState("");
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [me, aliasList, sessionList] = await Promise.all([
        authorizedFetch("/api/me"),
        authorizedFetch("/api/aliases"),
        authorizedFetch("/api/sessions"),
      ]);
      if (me.ok) {
        const body = (await me.json()) as {
          user?: { displayName?: string | null; smsNotifications?: boolean };
        };
        setNameDraft(body.user?.displayName ?? "");
        setSavedName(body.user?.displayName ?? null);
        setSmsNotifications(body.user?.smsNotifications ?? true);
      }
      if (aliasList.ok) {
        const body = (await aliasList.json()) as { aliases?: Alias[] };
        setAliases(body.aliases ?? []);
      }
      if (sessionList.ok) {
        const body = (await sessionList.json()) as { sessions?: Device[] };
        setDevices(body.sessions ?? []);
      }
    } catch {
      // Each row reports its own failure; a dead read must not blank the screen.
    }
  }, [authorizedFetch]);

  useEffect(() => {
    setFontSize(readFontSize());
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      void load();
    }
  }, [status, load]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/desktop");
    }
  }, [status, router]);

  async function saveName() {
    setProfileBusy(true);
    setProfileNotice(null);
    try {
      const response = await authorizedFetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: nameDraft.trim() || null }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setProfileNotice(body.error ?? "Could not save your name.");
        return;
      }
      setSavedName(nameDraft.trim() || null);
      setProfileNotice("Saved.");
    } catch {
      setProfileNotice("Network error. Please try again.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function addAlias(event: React.FormEvent) {
    event.preventDefault();
    setAliasBusy(true);
    setAliasNotice(null);
    try {
      const response = await authorizedFetch("/api/aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localPart: aliasDraft }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; alias?: Alias };
      if (!response.ok) {
        setAliasNotice(body.error ?? "Could not create that alias.");
        return;
      }
      setAliasDraft("");
      setAliasNotice(`${body.alias?.address ?? "The alias"} is yours.`);
      await load();
    } catch {
      setAliasNotice("Network error. Please try again.");
    } finally {
      setAliasBusy(false);
    }
  }

  async function removeAlias(localPart: string) {
    setAliasBusy(true);
    setAliasNotice(null);
    try {
      const response = await authorizedFetch(`/api/aliases/${encodeURIComponent(localPart)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setAliasNotice("Could not remove that alias.");
        return;
      }
      setAliasNotice(`${localPart} removed.`);
      await load();
    } catch {
      setAliasNotice("Network error. Please try again.");
    } finally {
      setAliasBusy(false);
    }
  }

  async function toggleSms() {
    const next = !smsNotifications;
    setSmsBusy(true);
    setSmsNotice(null);
    try {
      const response = await authorizedFetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsNotifications: next }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        user?: { smsNotifications?: boolean };
      };
      if (!response.ok) {
        setSmsNotice(body.error ?? "Could not change that setting.");
        return;
      }
      setSmsNotifications(Boolean(body.user?.smsNotifications));
      setSmsNotice(
        body.user?.smsNotifications ? "New mail will be texted to you." : "New mail texts are off.",
      );
    } catch {
      setSmsNotice("Network error. Please try again.");
    } finally {
      setSmsBusy(false);
    }
  }

  async function logOutDevice(id: string) {
    setDevicesBusy(true);
    setDevicesNotice(null);
    try {
      const response = await authorizedFetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (!response.ok) {
        setDevicesNotice("Could not sign that device out.");
        return;
      }
      setDevicesNotice("That device has been signed out.");
      await load();
    } catch {
      setDevicesNotice("Network error. Please try again.");
    } finally {
      setDevicesBusy(false);
    }
  }

  /** Step one of deleting: the server texts a one-time code to this number. */
  async function beginDelete() {
    setDeleteNotice(null);
    setDeleteBusy(true);
    try {
      const response = await authorizedFetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: user?.phoneNumber }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        devHint?: string;
        error?: string;
        retryAfterSeconds?: number;
      };
      if (!response.ok) {
        setDeleteNotice(
          body.retryAfterSeconds
            ? `${body.error ?? "Please wait."} (${body.retryAfterSeconds}s)`
            : body.error ?? "Could not send a code.",
        );
        return;
      }
      setDeleteOpen(true);
      setDeleteNotice(
        body.devHint ? `Development code: ${body.devHint}.` : "A code is on its way to your phone.",
      );
    } catch {
      setDeleteNotice("Network error. Please try again.");
    } finally {
      setDeleteBusy(false);
    }
  }

  /** Step two: the code is verified server-side before anything is removed. */
  async function confirmDelete() {
    setDeleteNotice(null);
    setDeleteBusy(true);
    try {
      const response = await authorizedFetch("/api/me/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: deleteOtp }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setDeleteNotice(body.error ?? "Could not delete the account.");
        return;
      }
      router.replace("/desktop");
    } catch {
      setDeleteNotice("Network error. Please try again.");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (status !== "authenticated") {
    return <p className="p-10 text-on-surface-variant">Loading...</p>;
  }

  return (
    <main className="h-screen overflow-y-auto">
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="font-headline text-2xl font-bold tracking-[-0.015em] text-on-surface">Settings</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          The same account settings the phone client has - one account, two clients.
        </p>

        {/* Profile */}
        <section className="surface mt-6 p-5">
          <p className="font-semibold text-on-surface">Profile</p>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            {user?.phoneNumber ? `${user.phoneNumber}@phonemail.com` : "Your address"}
          </p>
          <div className="mt-3 flex gap-2">
            <input
              aria-label="Display name"
              className="field flex-1"
              placeholder="Your name"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
            />
            <button type="button" className="btn-primary min-h-0 px-5" onClick={() => void saveName()} disabled={profileBusy}>
              {profileBusy ? <Spinner label="Saving" /> : "Save"}
            </button>
          </div>
          {savedName && nameDraft.trim() === savedName && (
            <p className="mt-2 text-sm text-on-surface-variant">Saved as {savedName}.</p>
          )}
          {profileNotice && <p className="mt-2 text-sm text-accent">{profileNotice}</p>}
        </section>

        {/* Aliases */}
        <section className="surface mt-4 p-5">
          <p className="font-semibold text-on-surface">Aliases</p>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Extra addresses that deliver to this account. Mail to an alias arrives here.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {aliases.length === 0 && <li className="text-sm text-on-surface-variant">No aliases yet.</li>}
            {aliases.map((alias) => (
              <li key={alias.id} className="flex items-center justify-between gap-3 border-b border-outline-variant pb-2">
                <span className="min-w-0 truncate text-sm font-medium text-on-surface">{alias.address}</span>
                <button
                  type="button"
                  className="min-h-0 shrink-0 text-sm font-semibold text-wa-alert disabled:opacity-50"
                  onClick={() => void removeAlias(alias.localPart)}
                  disabled={aliasBusy}
                  aria-label={`Remove ${alias.localPart}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <form className="mt-3 flex gap-2" onSubmit={addAlias}>
            <input
              aria-label="New alias"
              className="field flex-1"
              placeholder="New alias (letters, digits, dots)"
              value={aliasDraft}
              onChange={(event) => setAliasDraft(event.target.value)}
              required
            />
            <button type="submit" className="btn-primary min-h-0 px-5" disabled={aliasBusy}>
              {aliasBusy ? <Spinner label="Adding" /> : "Add"}
            </button>
          </form>
          {aliasNotice && <p className="mt-2 text-sm text-accent">{aliasNotice}</p>}
        </section>

        {/* Language */}
        <section className="surface mt-4 flex items-center justify-between gap-6 p-5">
          <div>
            <p className="font-semibold text-on-surface">Language</p>
            <p className="text-sm text-on-surface-variant">
              English ships today; the other two say so rather than pretending.
            </p>
          </div>
          <select
            aria-label="Language"
            className="rounded-full border border-outline-variant bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface"
            defaultValue="en"
          >
            <option value="en">English (India)</option>
            <option value="hi" disabled>
              Hindi - coming soon
            </option>
            <option value="ta" disabled>
              Tamil - coming soon
            </option>
          </select>
        </section>

        {/* SMS */}
        <section className="surface mt-4 p-5">
          <div className="flex items-center justify-between gap-6">
            <div>
              <p className="font-semibold text-on-surface">Notify me about new mail by SMS</p>
              <p className="text-sm text-on-surface-variant">
                Only for accounts that did not register on the mobile app - the spec&apos;s own rule.
              </p>
            </div>
            <Switch
              checked={smsNotifications}
              onChange={() => void toggleSms()}
              disabled={smsBusy}
              label="Notify me about new mail by SMS"
            />
          </div>
          {smsNotice && <p className="mt-2 text-sm text-accent">{smsNotice}</p>}
        </section>

        {/* Font size */}
        <section className="surface mt-4 flex items-center justify-between gap-6 p-5">
          <div>
            <p className="font-semibold text-on-surface">Font size</p>
            <p className="text-sm text-on-surface-variant">
              Scales the whole interface. Remembered on this device.
            </p>
          </div>
          <select
            aria-label="Font size"
            className="rounded-full border border-outline-variant bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface"
            value={fontSize}
            onChange={(event) => {
              const next = event.target.value as FontSizeId;
              setFontSize(next);
              applyFontSize(next);
            }}
          >
            {FONT_SIZES.map((size) => (
              <option key={size.id} value={size.id}>
                {size.label}
              </option>
            ))}
          </select>
        </section>

        {/* Devices */}
        <section className="surface mt-4 p-5">
          <p className="font-semibold text-on-surface">Signed-in devices</p>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Every sign-in is a device. Logging one out ends only that device&apos;s token.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {devices.length === 0 && <li className="text-sm text-on-surface-variant">No devices listed.</li>}
            {devices.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-3 border-b border-outline-variant pb-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-on-surface">{device.device}</span>
                  <span className="block text-xs text-on-surface-variant">
                    Signed in {new Date(device.createdAt).toLocaleDateString()} - {device.lastActive}
                  </span>
                </span>
                {device.current ? (
                  <span className="shrink-0 text-xs font-semibold text-accent">This device</span>
                ) : (
                  <button
                    type="button"
                    className="min-h-0 shrink-0 text-sm font-semibold text-wa-alert disabled:opacity-50"
                    onClick={() => void logOutDevice(device.id)}
                    disabled={devicesBusy}
                    aria-label={`Log out ${device.device}`}
                  >
                    Log out
                  </button>
                )}
              </li>
            ))}
          </ul>
          {devicesNotice && <p className="mt-2 text-sm text-accent">{devicesNotice}</p>}
        </section>

        {/* Delete account */}
        <section className="surface mt-4 p-5">
          <p className="font-semibold text-on-surface">Delete account</p>
          <p className="mt-0.5 text-sm text-on-surface-variant">
            Removes your mail, aliases, contacts and the account itself. A one-time code is verified
            first. Your messages in other people&apos;s mailboxes are not touched.
          </p>
          {!deleteOpen ? (
            <button
              type="button"
              className="mt-3 min-h-0 rounded-full bg-wa-alert px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
              onClick={() => void beginDelete()}
              disabled={deleteBusy}
            >
              {deleteBusy ? <Spinner label="Sending" /> : "Send me a code"}
            </button>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <label className="text-sm font-medium text-on-surface" htmlFor="desktop-delete-otp">
                Enter the 6-digit code
              </label>
              <input
                id="desktop-delete-otp"
                className="field"
                inputMode="numeric"
                maxLength={6}
                value={deleteOtp}
                onChange={(event) => setDeleteOtp(event.target.value.replace(/\D/g, ""))}
              />
              <div className="flex gap-3">
                <button
                  type="button"
                  className="min-h-0 rounded-full bg-wa-alert px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                  onClick={() => void confirmDelete()}
                  disabled={deleteBusy || deleteOtp.length !== 6}
                >
                  {deleteBusy ? <Spinner label="Deleting" /> : "Delete my account"}
                </button>
                <button
                  type="button"
                  className="btn-quiet min-h-0"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteOtp("");
                    setDeleteNotice(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {deleteNotice && <p className="mt-2 text-sm text-on-surface-variant">{deleteNotice}</p>}
        </section>
      </div>
    </main>
  );
}
