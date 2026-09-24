import type { Config } from "tailwindcss";

/**
 * Mobile-first design system (PROJECT.md §3: Tailwind + a tokens layer).
 * Tokens are semantic, not decorative: elder-friendly defaults live here so
 * screens never hard-code sizes.
 *
 * Day 4 polish: the radius, transition and elevation scales live here too, so
 * "even spacing / consistent radii / restrained motion" is a token decision
 * rather than something each screen re-invents.
 *
 *  - base font 18px (comfortable for first-time smartphone users)
 *  - every interactive target >= 48px via the `tap` scale
 *  - high-contrast WhatsApp-like greens/neutrals (one accent, no gradients)
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        wa: {
          bg: "#efeae2",
          panel: "#ffffff",
          ink: "#111b21",
          // Darkened from #5b6b74: muted text should still clear 4.5:1 on white.
          muted: "#4d5b63",
          line: "#e2e5e7",
          teal: "#075e54",
          green: "#25d366",
          bubble: "#d9fdd3",
          alert: "#b3261e",
        },
      },
      fontSize: {
        base: ["18px", { lineHeight: "1.55" }],
        sm: ["16px", { lineHeight: "1.5" }],
        lg: ["20px", { lineHeight: "1.5" }],
        xl: ["24px", { lineHeight: "1.35" }],
      },
      // One card radius everywhere; bubbles stay slightly tighter.
      borderRadius: {
        card: "12px",
        bubble: "10px",
      },
      minHeight: { tap: "48px" },
      minWidth: { tap: "48px" },
      maxWidth: { phone: "430px" },
      // Restrained motion only: 150-200ms, nothing bouncing.
      transitionDuration: { ui: "180ms" },
      spacing: { row: "14px" },
    },
  },
  plugins: [],
};

export default config;
