import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

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
  themeColor: "#075e54",
  width: "device-width",
  initialScale: 1,
  // The mobile screens are a fixed app frame; zoom stays available for
  // accessibility because the base font is already large.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
