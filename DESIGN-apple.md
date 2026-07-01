# DESIGN.md — Apple

## Overview
Apple's web design system is defined by restraint and precision. Pure white canvases, near-black type, and a single blue accent carry the entire visual language. Space is the primary design element — generous padding replaces decorative borders. Typography scales dramatically between hero (96px+) and body (17px). Dark mode inverts to pure black backgrounds with near-white text, maintaining identical contrast ratios.

## Colors

### Light Mode

| Token | Hex | Usage |
|-------|-----|-------|
| `color-bg` | `#FFFFFF` | Page background |
| `color-surface` | `#FFFFFF` | Cards, panels |
| `color-surface2` | `#F5F5F7` | Section alternating background |
| `color-text` | `#1D1D1F` | Primary text (slightly warm near-black) |
| `color-text-muted` | `#6E6E73` | Secondary text, captions |
| `color-border` | `#D2D2D7` | Dividers (subtle, barely visible) |
| `color-primary` | `#0071E3` | CTA buttons, links, interactive elements |
| `color-primary-light` | `#E3F0FC` | Hover tints, badge backgrounds |
| `color-danger` | `#FF3B30` | Error states |
| `color-danger-light` | `#FFF2F1` | Error backgrounds |
| `color-warning` | `#FF9F0A` | Warning states |
| `color-warning-light` | `#FFF8EC` | Warning backgrounds |
| `color-success` | `#34C759` | Success states |
| `color-success-light` | `#F0FBF3` | Success backgrounds |
| `color-gray` | `#6E6E73` | Neutral icons, placeholders |
| `color-gray-light` | `#F5F5F7` | Neutral fills |

### Dark Mode

| Token | Hex | Usage |
|-------|-----|-------|
| `color-bg-dark` | `#000000` | Page background (pure black) |
| `color-surface-dark` | `#1D1D1F` | Cards, panels |
| `color-surface2-dark` | `#161617` | Alternate surface |
| `color-text-dark` | `#F5F5F7` | Primary text |
| `color-text-muted-dark` | `#86868B` | Secondary text |
| `color-border-dark` | `#424245` | Dividers |
| `color-primary-dark` | `#2997FF` | CTA (lighter blue for black bg) |

## Typography

| Role | Family | Size | Weight | Line Height |
|------|--------|------|--------|-------------|
| Hero | SF Pro Display, system-ui, -apple-system, sans-serif | 96px | 700 | 1.05 |
| Section Title | SF Pro Display, system-ui, -apple-system, sans-serif | 48px | 700 | 1.1 |
| Headline | SF Pro Display, system-ui, -apple-system, sans-serif | 28px | 600 | 1.2 |
| Body | SF Pro Text, system-ui, -apple-system, sans-serif | 17px | 400 | 1.47 |
| Caption | SF Pro Text, system-ui, -apple-system, sans-serif | 12px | 400 | 1.33 |

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Inline gaps |
| `space-2` | 8px | Component gaps |
| `space-4` | 16px | Inner card padding |
| `space-6` | 24px | Section horizontal padding |
| `space-8` | 40px | Section vertical padding |
| `space-12` | 80px | Major section separation |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 4px | Small elements |
| `radius-md` | 12px | Cards, tiles |
| `radius-lg` | 18px | Large cards, modals |
| `radius-pill` | 980px | CTA buttons (fully rounded) |

## Elevation

| Level | Value | Usage |
|-------|-------|-------|
| `shadow-sm` | `none` | Apple avoids shadows — space creates separation |
| `shadow-md` | `0 2px 12px rgba(0,0,0,0.08)` | Floating menus only |
| `shadow-lg` | `0 8px 32px rgba(0,0,0,0.12)` | Modals (rare) |

## Components

### Button (CTA)
- Background `#0071E3`, white text, border-radius 980px (pill)
- No border, no shadow
- Hover: background `#0077ED`

### Section
- Alternates between `#FFFFFF` and `#F5F5F7`
- No visible borders between sections — spacing alone creates separation

### Navigation (Global Nav)
- Background: `rgba(255,255,255,0.85)` with backdrop-filter blur
- Height: 44px
- Font: 12px, regular weight, `#1D1D1F`

## Do's and Don'ts

### Do
- Let white space do the heavy lifting — Apple uses extreme padding
- Keep the palette to 3 colors maximum: near-black, light gray, blue
- Use the pill button shape for all primary CTAs
- Use `system-ui` or `-apple-system` as font fallback for SF Pro

### Don't
- Don't add decorative borders — Apple uses none
- Don't use shadows on cards at rest
- Don't use colors other than `#0071E3` blue for interactive affordances
- Don't drop below 17px for body text
