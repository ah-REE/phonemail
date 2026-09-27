import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";

import { FONT_SIZE_BOOTSTRAP } from "@/lib/fontSize";

import "./globals.css";

/**
 * Type, self-hosted at build time through next/font.
 *
 * The pairing is the redesign's voice: Bricolage Grotesque gives headings real
 * character without becoming a display gimmick, Figtree carries the UI at large
 * sizes with high legibility (this app is read by first-time smartphone users),
 * and JetBrains Mono is reserved for ids and metadata.
 *
 * Self-hosting is deliberate: the project's whole promise is `docker compose up
 * -d` with nothing fetched at runtime, so no font CDN is involved.
 */
const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  weight: ["600", "700"],
  variable: "--font-display",
});

const bodyFont = Figtree({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "PhoneMail",
  description: "Your phone number is your email address.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "PhoneMail",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  // The chrome colour matches the deep-navy bars.
  themeColor: "#1e3a8a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`}
    >
      {/* THE FONT SIZE PREFERENCE, APPLIED BEFORE ANYTHING PAINTS. Every size in the
          app is in rem, so the chosen level is one number on this element - and doing
          it here rather than in an effect is what stops the text jumping from 18px to
          22px after hydration. No storage (or a private-mode refusal) simply leaves
          the design's own size in place. */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: FONT_SIZE_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
