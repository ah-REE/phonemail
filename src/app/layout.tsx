import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

/**
 * Fonts come from next/font, which downloads and SELF-HOSTS the files at build
 * time. That is deliberate: the design uses Plus Jakarta Sans for headlines and
 * Inter for body/labels, and wiring them through a CDN at runtime would break
 * the offline/`docker compose up -d` guarantee the whole project is built on.
 */
const bodyFont = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});

const headlineFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["600", "700"],
  variable: "--font-headline",
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
  // The design's primary: the Android/browser chrome colour matches the app.
  themeColor: "#075e54",
  width: "device-width",
  initialScale: 1,
  // The mobile screens are a fixed app frame; zoom stays available for
  // accessibility because the base font is already large.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headlineFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
