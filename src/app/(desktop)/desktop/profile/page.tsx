"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/useAuth";

/** Desktop profile: the identity and the address it maps to. Read-only for now. */
export default function DesktopProfilePage() {
  const router = useRouter();
  const { status, user, signOut } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/desktop");
    }
  }, [status, router]);

  if (status !== "authenticated") {
    return <p className="p-10 text-wa-muted">Loading…</p>;
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="surface p-5">
          <dt className="text-sm text-wa-muted">Phone number</dt>
          <dd className="text-lg font-semibold">{user?.phoneNumber ?? "—"}</dd>
        </div>
        <div className="surface p-5">
          <dt className="text-sm text-wa-muted">Your address</dt>
          <dd className="text-lg">{user ? `${user.phoneNumber}@phonemail.com` : "—"}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="btn-quiet mt-6"
        onClick={() => {
          signOut();
          router.replace("/desktop");
        }}
      >
        Sign out
      </button>
    </main>
  );
}