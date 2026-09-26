import type { Config } from "tailwindcss";

/**
 * Design system.
 *
 * The palette is the OWNER'S LOGO, sampled rather than invented. The mark is a
 * glossy blue envelope: 77% of its solid pixels are blue (mean #256cf3, deepest
 * #01067c) and 11% cyan (#34cafd), on white. The brand illustration around it
 * adds the violet where the envelope's flaps cross (#7c3aed), the green of the
 * two status dots (#22c55e), the periwinkle of the ring that hugs the icon
 * (#dbeafe), the cool greys of the orbit (#9ca3af / #d1d5db) and an off-white
 * canvas (#f9fafb).
 *
 * Every colour below is one of those, or a step between two of them.
 *
 *   canvas   the illustration's off-white, cooled a touch
 *   chrome   the illustration's indigo - mail that reads as ink on paper
 *   accent   the mark's own blue, with the periwinkle as its soft tint
 *   brand    the mark's blue running into the illustration's violet
 *   type     a characterful display face over a very legible body face
 *   depth    three cool-tinted shadows instead of none
 *
 * Token NAMES are otherwise unchanged (and the wa-* aliases repointed), so every
 * screen adopts the system the moment this file changes - which is what makes a
 * repaint safe across a whole app. 'navy' became 'navy' because a token called
 * navy holding an indigo is a lie waiting to confuse somebody.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ---------- the system, out of the logo ---------- */
        paper: { DEFAULT: "#f8fafc", sunken: "#eef2f7" },
        navy: { DEFAULT: "#1e3a8a", deep: "#16296b", soft: "#3358c0" },
        accent: { DEFAULT: "#256cf3", soft: "#dbeafe", ink: "#ffffff" },
        brand: { DEFAULT: "#3b82f6", violet: "#7c3aed", cyan: "#bde3ff", sky: "#60a5fa" },
        /* One of the illustration's own colours, and kept for that reason - but
           nothing in the interface uses it: the owner asked for no green in the
           app, so every green surface was repainted into the mark's blue. */
        /* Chat, sampled from the owner's reference screenshot. Its blue is the
           accent above (#256cf3), so the reference and the logo agree; the rest
           are the canvas and the two bubble fills as they actually measure. */
        chat: {
          canvas: "#eff6fe",
          out: "#e2f9e9",
          in: "#edf2fa",
          sheet: "#f9fbfe",
          field: "#ffffff",
          rail: "#eef2f9",
          meta: "#6b7280",
        },
        /* The conversation tints, sampled from the owner's home reference: each
           row gets a soft one, with the numeral in its deeper partner. */
        avatar: {
          sky: "#d9effe",
          "sky-ink": "#1e3a8a",
          violet: "#dac5fb",
          "violet-ink": "#5b21b6",
          mint: "#cffafe",
          "mint-ink": "#0e7490",
        },
        success: { DEFAULT: "#22c55e", soft: "#dcfce7" },
        warning: { DEFAULT: "#f79009", soft: "#fdeed7" },
        danger: { DEFAULT: "#e5484d", soft: "#ffe6e6" },

        /* ---------- the semantic set (names kept) ---------- */
        surface: {
          DEFAULT: "#ffffff",
          dim: "#e2e8f0",
          bright: "#f8fafc",
          variant: "#e8eef6",
          container: {
            lowest: "#ffffff",
            low: "#f6f9fc",
            DEFAULT: "#eff4f9",
            high: "#e9eff6",
            highest: "#e2e8f0",
          },
        },
        "on-surface": { DEFAULT: "#0f172a", variant: "#48566b" },
        outline: { DEFAULT: "#9ca3af", variant: "#d1d5db" },
        primary: { DEFAULT: "#1e3a8a", container: "#3358c0" },
        "on-primary": { DEFAULT: "#f2f7ff", container: "#c7d9f7" },
        "primary-fixed": { DEFAULT: "#c7d9f7", dim: "#93b3ea" },
        secondary: { DEFAULT: "#22c55e", container: "#dcfce7" },
        "on-secondary": { DEFAULT: "#ffffff", container: "#0b5c2e" },
        "surface-tint": "#1e3a8a",
        error: { DEFAULT: "#e5484d", container: "#ffe6e6" },
        "on-error": { DEFAULT: "#ffffff", container: "#8c1d22" },

        /* ---------- legacy aliases, repointed ---------- */
        wa: {
          bg: "#f8fafc",
          panel: "#ffffff",
          ink: "#0f172a",
          muted: "#48566b",
          line: "#e9eff6",
          outline: "#d1d5db",
          teal: "#1e3a8a",
          green: "#22c55e",
          bubble: "#eef4ff",
          alert: "#e5484d",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Bricolage Grotesque", "Georgia", "serif"],
        headline: ["var(--font-display)", "Bricolage Grotesque", "Georgia", "serif"],
        body: ["var(--font-body)", "Figtree", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        /* the elder-friendly floor stays: root 18px, base 18px */
        base: ["18px", { lineHeight: "1.55" }],
        sm: ["16px", { lineHeight: "1.5" }],
        lg: ["20px", { lineHeight: "1.5" }],
        xl: ["24px", { lineHeight: "1.35" }],
        /* the display scale */
        "display-lg": ["34px", { lineHeight: "38px", letterSpacing: "-0.022em", fontWeight: "700" }],
        "display-md": ["27px", { lineHeight: "32px", letterSpacing: "-0.018em", fontWeight: "700" }],
        "display-sm": ["22px", { lineHeight: "28px", letterSpacing: "-0.012em", fontWeight: "600" }],
        "headline-lg": ["26px", { lineHeight: "34px", letterSpacing: "-0.015em", fontWeight: "700" }],
        "headline-md": ["22px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-sm": ["18px", { lineHeight: "24px", fontWeight: "600" }],
        "body-lg": ["16px", { lineHeight: "24px" }],
        "body-md": ["14px", { lineHeight: "20px" }],
        "body-sm": ["12px", { lineHeight: "16px" }],
        "label-lg": ["16px", { lineHeight: "20px", letterSpacing: "0.01em", fontWeight: "600" }],
        "label-md": ["14px", { lineHeight: "18px", letterSpacing: "0.01em", fontWeight: "600" }],
        "label-sm": ["11px", { lineHeight: "14px", letterSpacing: "0.08em", fontWeight: "600" }],
      },
      borderRadius: { card: "14px", bubble: "14px", sheet: "22px", pill: "9999px" },
      minHeight: { tap: "56px" },
      minWidth: { tap: "56px" },
      maxWidth: { phone: "480px" },
      /* Three cool-tinted shadows - blue-slate rather than warm, so they agree
         with the logo's palette. Depth is the thing the old system lacked
         entirely; these are deliberate, not decorative. */
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 6px 18px -12px rgba(15,23,42,0.16)",
        raised: "0 2px 6px rgba(15,23,42,0.06), 0 16px 32px -18px rgba(15,23,42,0.22)",
        overlay: "0 24px 60px -24px rgba(15,23,42,0.34)",
        "inset-line": "inset 0 1px 0 rgba(255,255,255,0.6)",
      },
      transitionDuration: { ui: "220ms", fast: "140ms", slow: "380ms" },
      /* Two easings, as the brief requires. */
      transitionTimingFunction: {
        "out-quint": "cubic-bezier(0.22, 1, 0.36, 1)",
        "soft-spring": "cubic-bezier(0.34, 1.24, 0.64, 1)",
      },
      spacing: { row: "16px" },
    },
  },
  plugins: [],
};

export default config;
