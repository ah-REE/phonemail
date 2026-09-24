import type { Config } from "tailwindcss";

/**
 * Design system (PROJECT.md section 3: Tailwind + a tokens layer).
 *
 * Tokens are semantic, not decorative: the designed palette and the
 * elder-friendly sizing live here, so screens never hard-code a colour or size.
 *
 * Day 6 visual refresh: the token layer moved FIRST, before any screen, so every
 * screen adopts the designed language the moment it is styled and an untouched
 * screen is already on-colour.
 *
 * Source of truth: the Stitch export itself - design/safe_clean_messenger/
 * DESIGN.md (front-matter) and the mockup markup under design/<screen>/code.html.
 * Where DESIGN.md's PROSE disagrees with the mockup markup (the prose carries an
 * older WhatsApp-like palette: #EFEAE2 canvas, #DAE1E3 borders, #667781 muted),
 * the MOCKUP MARKUP WINS. Recorded in PROJECT.md section 9.
 *
 * Two deliberate deviations, both reported:
 *  - the root font size stays 18px (the elder-friendly floor agreed in
 *    PROJECT.md section 3) instead of the mockups' 16px body text
 *  - the `wa-*` names survive as aliases pointing at the new palette, so screens
 *    can migrate one at a time without a flag day
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ---------------- designed palette (mockup-derived) ---------------- */
        surface: {
          DEFAULT: "#ffffff",
          dim: "#d1dbe4",
          bright: "#f5faff",
          variant: "#d9e4ec",
          container: {
            lowest: "#ffffff",
            low: "#eaf5fe",
            DEFAULT: "#e5eff8",
            high: "#dfeaf2",
            highest: "#d9e4ec",
          },
        },
        "on-surface": { DEFAULT: "#131d23", variant: "#3f4946" },
        outline: { DEFAULT: "#6f7976", variant: "#bec9c5" },
        primary: { DEFAULT: "#00453d", container: "#075e54" },
        "on-primary": { DEFAULT: "#ffffff", container: "#8dd5c8" },
        "primary-fixed": { DEFAULT: "#a8f0e3", dim: "#8cd4c7" },
        secondary: { DEFAULT: "#006d2f", container: "#5dfd8a" },
        "on-secondary": { DEFAULT: "#ffffff", container: "#007232" },
        "surface-tint": "#1c695f",
        error: { DEFAULT: "#ba1a1a", container: "#ffdad6" },
        "on-error": { DEFAULT: "#ffffff", container: "#93000a" },

        /* ------------- legacy aliases, repointed at that palette ------------- */
        wa: {
          bg: "#f5faff",
          panel: "#ffffff",
          ink: "#131d23",
          // Muted text must still clear 4.5:1 on white and on #f5faff.
          muted: "#3f4946",
          // Soft divider; input outlines use wa-outline (#bec9c5) as the design does.
          line: "#dfeaf2",
          outline: "#bec9c5",
          teal: "#075e54",
          green: "#25d366",
          bubble: "#d9fdd3",
          alert: "#ba1a1a",
        },
      },
      fontFamily: {
        // Wired through next/font in app/layout.tsx, which self-hosts the files:
        // no runtime CDN, so the app still works offline.
        headline: ["var(--font-headline)", "Inter", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        /* the app's own scale - elder-friendly, driven by the 18px root */
        base: ["18px", { lineHeight: "1.55" }],
        sm: ["16px", { lineHeight: "1.5" }],
        lg: ["20px", { lineHeight: "1.5" }],
        xl: ["24px", { lineHeight: "1.35" }],
        /* the designed scale (DESIGN.md typography), mobile sizes */
        "headline-lg": ["26px", { lineHeight: "34px", letterSpacing: "-0.015em" }],
        "headline-md": ["22px", { lineHeight: "28px", letterSpacing: "-0.01em" }],
        "headline-sm": ["18px", { lineHeight: "24px" }],
        "body-lg": ["16px", { lineHeight: "24px" }],
        "body-md": ["14px", { lineHeight: "20px" }],
        "body-sm": ["12px", { lineHeight: "16px" }],
        "label-lg": ["16px", { lineHeight: "20px", letterSpacing: "0.01em" }],
        "label-md": ["14px", { lineHeight: "18px", letterSpacing: "0.01em" }],
        "label-sm": ["11px", { lineHeight: "14px", letterSpacing: "0.04em" }],
      },
      // Pill controls, 16px cards, 24px sheets: the design's shape language.
      borderRadius: {
        card: "16px",
        bubble: "10px",
        sheet: "24px",
        pill: "9999px",
      },
      // The design's touch floor is 56px (the app's was 48px).
      minHeight: { tap: "56px" },
      minWidth: { tap: "56px" },
      // DESIGN.md: fluid single column, max content width 480px.
      maxWidth: { phone: "480px" },
      // Restrained motion only: 150-200ms, nothing bouncing.
      transitionDuration: { ui: "180ms" },
      spacing: { row: "14px" },
    },
  },
  plugins: [],
};

export default config;
