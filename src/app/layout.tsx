import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";

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
  // The chrome colour matches the deep-pine bars.
  themeColor: "#0c3b36",
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
      <body>{children}</body>
    </html>
  );
}
