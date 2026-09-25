import type { Config } from "tailwindcss";

/**
 * Design system.
 *
 * Redesign (Refinement): the structure, flows and content are untouched; the
 * visual system is rebuilt. The previous layer was a correct but characterless
 * Material/WhatsApp pastiche - a cool blue-white canvas, mid-teal chrome, one
 * type size and no depth. This one is built around a single idea: digital mail
 * that feels like paper.
 *
 *   canvas   warm paper, not a cool white
 *   chrome   deep pine, so the bars read as ink on paper rather than plastic
 *   accent   ONE electric violet, reserved for the action the screen wants
 *   type     a characterful display face over a very legible body face
 *   depth    three warm-tinted shadows instead of none
 *
 * Token NAMES are unchanged (and the wa-* aliases repointed), so every screen
 * adopts the new system the moment this file changes - which is what makes a
 * Refinement safe across a whole app.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ---------- the new system ---------- */
        paper: { DEFAULT: "#faf7f3", sunken: "#f4efe8" },
        pine: { DEFAULT: "#0c3b36", deep: "#082926", soft: "#14514a" },
        accent: { DEFAULT: "#4b3df5", soft: "#edebff", ink: "#ffffff" },
        success: { DEFAULT: "#12b76a", soft: "#d6f5e5" },
        warning: { DEFAULT: "#f79009", soft: "#fdeed7" },
        danger: { DEFAULT: "#e5484d", soft: "#ffe6e6" },

        /* ---------- the semantic set (names kept) ---------- */
        surface: {
          DEFAULT: "#ffffff",
          dim: "#ded7cb",
          bright: "#faf7f3",
          variant: "#e7dfd4",
          container: {
            lowest: "#ffffff",
            low: "#f6f1ea",
            DEFAULT: "#f2ece4",
            high: "#efe8df",
            highest: "#e7dfd4",
          },
        },
        "on-surface": { DEFAULT: "#101a17", variant: "#4c5a55" },
        outline: { DEFAULT: "#8a8279", variant: "#dcd5cc" },
        primary: { DEFAULT: "#0c3b36", container: "#14514a" },
        "on-primary": { DEFAULT: "#f3fbf8", container: "#a8e0d2" },
        "primary-fixed": { DEFAULT: "#a8e0d2", dim: "#7cc4b3" },
        secondary: { DEFAULT: "#12b76a", container: "#c9f5de" },
        "on-secondary": { DEFAULT: "#ffffff", container: "#065f36" },
        "surface-tint": "#0c3b36",
        error: { DEFAULT: "#e5484d", container: "#ffe6e6" },
        "on-error": { DEFAULT: "#ffffff", container: "#8c1d22" },

        /* ---------- legacy aliases, repointed ---------- */
        wa: {
          bg: "#faf7f3",
          panel: "#ffffff",
          ink: "#101a17",
          muted: "#4c5a55",
          line: "#efe8df",
          outline: "#dcd5cc",
          teal: "#0c3b36",
          green: "#12b76a",
          bubble: "#eef7f1",
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
      /* Three warm-tinted shadows. Depth is the thing the old system lacked
         entirely; these are deliberate, not decorative. */
      boxShadow: {
        card: "0 1px 2px rgba(16,26,23,0.04), 0 6px 18px -12px rgba(16,26,23,0.16)",
        raised: "0 2px 6px rgba(16,26,23,0.06), 0 16px 32px -18px rgba(16,26,23,0.22)",
        overlay: "0 24px 60px -24px rgba(16,26,23,0.34)",
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
