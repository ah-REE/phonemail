---
name: Safe Clean Messenger
colors:
  surface: '#f5faff'
  surface-dim: '#d1dbe4'
  surface-bright: '#f5faff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eaf5fe'
  surface-container: '#e5eff8'
  surface-container-high: '#dfeaf2'
  surface-container-highest: '#d9e4ec'
  on-surface: '#131d23'
  on-surface-variant: '#3f4946'
  inverse-surface: '#283238'
  inverse-on-surface: '#e8f2fb'
  outline: '#6f7976'
  outline-variant: '#bec9c5'
  surface-tint: '#1c695f'
  primary: '#00453d'
  on-primary: '#ffffff'
  primary-container: '#075e54'
  on-primary-container: '#8dd5c8'
  inverse-primary: '#8cd4c7'
  secondary: '#006d2f'
  on-secondary: '#ffffff'
  secondary-container: '#5dfd8a'
  on-secondary-container: '#007232'
  tertiary: '#622d1b'
  on-tertiary: '#ffffff'
  tertiary-container: '#7e4330'
  on-tertiary-container: '#ffb69f'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#a8f0e3'
  primary-fixed-dim: '#8cd4c7'
  on-primary-fixed: '#00201c'
  on-primary-fixed-variant: '#005047'
  secondary-fixed: '#66ff8e'
  secondary-fixed-dim: '#3de273'
  on-secondary-fixed: '#002109'
  on-secondary-fixed-variant: '#005322'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#ffb59e'
  on-tertiary-fixed: '#380d02'
  on-tertiary-fixed-variant: '#6f3725'
  background: '#f5faff'
  on-background: '#131d23'
  surface-variant: '#d9e4ec'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.25rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers an instantly recognizable, dependable, and highly secure onboarding experience. Grounded in utilitarian messaging patterns, the aesthetic merges clear structural honesty with approachable ergonomics. The interface prioritizes clarity, rapid legibility, and high-contrast usability over decorative trends.

The visual style is strictly flat:
- Zero drop shadows, glow effects, or ambient lighting.
- Pure solid fills without gradients.
- Crisp boundary delineation using tonal contrast and hairline containment borders.
- Generous 56px minimum touch targets optimized for one-handed mobile ergonomic zones.
- Welcoming, fully rounded pill geometry for interactive controls set against disciplined functional typography.

## Colors

The color palette emphasizes familiarity, verification, and uncompromised legibility:

- **Primary (`#075E54`)**: Deep teal-green anchored for header navigation bars, primary active states, and grounding structural anchors.
- **Secondary / Action (`#25D366`)**: High-contrast bright green reserved for primary action buttons, positive progress ticks, verification badges, and primary interactive CTAs.
- **Canvas Background (`#EFEAE2`)**: Warm neutral off-white providing soft contrast without the stark harshness of pure white backdrops.
- **Surface (`#FFFFFF`)**: Pure crisp white surfaces dedicated to floating cards, message bubbles, input fields, and bottom sheet containers.
- **On-Surface Primary (`#111B21`)**: Dark charcoal text ensuring maximum contrast and strict WCAG AAA compliance across all backgrounds.
- **Muted (`#667781`)**: Subdued secondary text, helper captions, inactive iconography, and unselected indicator dots.
- **Border / Divider (`#DAE1E3`)**: Ultra-fine solid borders providing crisp boundary definitions in the absence of shadows.

## Typography

Typography establishes clear visual hierarchy between instructions, critical inputs, and legal reassurance:

- **Headlines (`Plus Jakarta Sans`)**: Soft, rounded geometric sans-serif that balances modern digital interfaces with approachable character. Used strictly for onboarding titles, verification headers, and modal headings.
- **Body & Labels (`Inter`)**: Utilitarian, highly legible workhorse typeface designed for micro-reading and maximum clarity on mobile screens. Used for instructions, OTP readouts, inputs, and contextual disclosures.
- **Weights**: Strictly limited to Regular (400), SemiBold (600), and Bold (700) to keep cognitive load low.
- **Mobile Scale**: Headlines step down to 26px on compact mobile devices to guarantee that verification titles remain within two readable lines without overflowing.

## Layout & Spacing

The layout uses a fluid single-column mobile viewport model constrained to a maximum content width of 480px when displayed on wider surfaces:

- **Touch Baseline**: All interactive rows, buttons, and input fields adhere to a strict minimum vertical height of 56px (`3.5rem`).
- **Outer Canvas Margins**: 16px (`1rem`) on standard mobile devices; expands to 20px (`1.25rem`) on larger screens.
- **Vertical Flow**:
  - Sticky or pinned bottom bar for primary CTAs ensuring thumb reachability without finger repositioning.
  - Generous top margin (32px / `space-xl`) between status bar and headline to prevent visual congestion.
  - Step-based progress indicators placed persistently within the top navigation bar.

## Elevation & Depth

This design system is strictly 100% flat. It contains zero box-shadows, zero blur filters, and no pseudo-3D gradients:

- **Depth via Tonal Separation**: Contrast is achieved strictly through surface layer hierarchy:
  - Base canvas: `#EFEAE2`
  - Floating card containers / Content blocks: `#FFFFFF`
  - Inactive UI backgrounds: `#E9EDEF`
- **Low-Contrast Hairline Outlines**: Visual separation between pure white elements and light backgrounds is managed using a crisp 1px solid border (`#DAE1E3`).
- **Focus & Selection**: Interactive focus is indicated by an inner or outer 2px solid ring using `#075E54` or `#25D366`, never a diffused glowing halo.

## Shapes

The interface balances welcoming, friendly interactions with clean, structural containment:

- **Buttons and Chips**: Full pill curvature (`roundedness: 3` / 9999px) to invite direct touch interaction and emphasize tap targets.
- **Surface Cards & Sheets**: Consistent 16px to 24px corner radius for container cards and onboarding prompt sheets, softening structural edges while keeping layouts orderly.
- **Inputs & Fields**: Large 16px to 28px pill or rounded-pill radius, matching button ergonomics to provide a unified visual cadence throughout the onboarding form flow.

## Components

### Buttons
- **Primary CTA**: Fixed 56px height, full pill shape (`rounded-full`), solid `#25D366` background, `#111B21` or `#075E54` bold typography. Hover/Active state darkens to `#20BA5A` with zero elevation shift.
- **Secondary Button**: 56px height, full pill shape, solid `#FFFFFF` surface with a 1px solid border (`#DAE1E3`), and `#075E54` label text.
- **Text Button**: Borderless, pill padding, transparent background with `#075E54` label text for dismissive or secondary actions (e.g., "Skip for now", "Resend code").

### Input Fields & Country Selectors
- **Container**: 56px height, pure white surface (`#FFFFFF`), 1px solid border (`#DAE1E3`). Focus state transitions border to 2px solid `#075E54`.
- **Phone Prefix Selector**: Left-docked pill or segmented container featuring country flag, ISO dial code (`#111B21`), and a subtle down chevron (`#667781`). Separated by an internal 1px vertical divider.
- **OTP Verification Blocks**: Individual 56px × 56px square-rounded cards (`rounded-xl`), centered 24px bold typography, white fill, 1px border. Active box highlighted with a 2px `#25D366` border.

### Chips & Selection Pills
- **State**: Unselected chips feature `#FFFFFF` background with 1px `#DAE1E3` border and `#111B21` text. Selected chips fill with `#075E54`, shifting typography to pure white `#FFFFFF`.
- **Dimensions**: 36px to 44px height, full pill radius, horizontal padding of 16px (`space-md`).

### Cards & Onboarding Containers
- **Surface**: Solid `#FFFFFF` fill, 16px corner radius, 1px solid `#DAE1E3` border.
- **Spacing**: 20px interior padding, strictly no drop shadow.
- **List Items**: Clean 56px to 64px row items separated by 1px solid borders indented to align with text margins.

### Verification & Progress Indicators
- **Step Dots**: Horizontal pill indicators where active is an elongated 24px × 6px pill in `#25D366`, and inactive are 6px × 6px dots in `#667781` with 30% opacity.
- **Security Badges**: End-to-end encryption confirmation rows featuring a centered inline padlock glyph, 12px muted text (`#667781`), and zero distracting borders.