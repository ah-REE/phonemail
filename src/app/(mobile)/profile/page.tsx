"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { AppBar } from "@/components/app-bar";
import { useAuth } from "@/lib/useAuth";

/**
 * Profile stub: shows the signed-in identity, alias placeholder and the two
 * settings the UI already implies (language, sign out). Day 4-5 build the real
 * settings surface.
 */
export default function ProfilePage() {
  const router = useRouter();
  const { status, token, user, signOut } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/onboarding");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <main className="flex flex-1 flex-col">
        <AppBar title="Profile" backHref="/" />
        <div className="p-4">
          <span className="skeleton h-20 w-full rounded-card" />
        </div>
      </main>
    );
  }

  const address = user ? `${user.phoneNumber}@phonemail.com` : "—";

  return (
    <main className="flex flex-1 flex-col">
      <AppBar title="Profile & settings" backHref="/" />

      <section className="flex flex-col gap-4 p-4">
        <div className="surface flex items-center gap-4 p-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-wa-teal text-2xl font-semibold text-white">
            {user?.phoneNumber?.slice(0, 1) ?? "?"}
          </span>
          <div>
            <p className="text-lg font-semibold">{user?.phoneNumber ?? "Unknown"}</p>
            <p className="text-sm text-wa-muted">{address}</p>
          </div>
        </div>

        <div className="surface p-4">
          <p className="text-sm text-wa-muted">Alias IDs</p>
          <p className="text-lg">Not set — alias management arrives Day 6.</p>
        </div>

        <div className="surface p-4">
          <p className="text-sm text-wa-muted">Language</p>
          <p className="text-lg">English (more languages land later).</p>
        </div>

        <button
          type="button"
          className="btn-quiet w-full"
          onClick={() => {
            signOut();
            router.replace("/onboarding");
          }}
        >
          Sign out
        </button>
      </section>
    </main>
  );
}
