# DESIGN.md — macOS 27 Golden Gate

## Overview
macOS 27 Golden Gate introduces two defining characteristics: **Liquid Glass** (translucent surfaces with frosted-glass refraction) and a **warm amber-gold** accent inspired by the International Orange of the Golden Gate Bridge. The palette moves away from cool grays and indigo blue toward creamy warm whites and deep burnished amber. Dark mode channels the Space Black MacBook Pro — near-absolute black with warm-tinted glass panels. Typography remains San Francisco (system-ui), compact and confident.

## Colors

### Light Mode

| Token | Hex | Usage |
|-------|-----|-------|
| `color-bg` | `#FAFAF8` | Page background (warm white, slight cream tint) |
| `color-surface` | `#FFFFFF` | Cards, panels, modals |
| `color-surface2` | `#F2F0EB` | Alternate surface (warm light gray) |
| `color-text` | `#1D1D1F` | Primary text (Apple near-black) |
| `color-text-muted` | `#8A8A8E` | Secondary text, labels (warm gray) |
| `color-border` | `#E0DDD8` | Dividers (warm-tinted, barely visible) |
| `color-primary` | `#C2621C` | Accent — Golden Gate amber-orange |
| `color-primary-light` | `#FFF3E0` | Tint for badges, hover states |
| `color-danger` | `#D93025` | Error, destructive actions |
| `color-danger-light` | `#FEF0EE` | Error badge background |
| `color-warning` | `#F59E0B` | Warnings (warm amber, distinct from primary) |
| `color-warning-light` | `#FFFBEB` | Warning badge background |
| `color-success` | `#2A9D5C` | Done states, sprint complete |
| `color-success-light` | `#EDFAF4` | Success badge background |
| `color-gray` | `#8A8A8E` | Neutral icons, placeholders |
| `color-gray-light` | `#F2F0EB` | Neutral fills |

### Dark Mode

| Token | Hex | Usage |
|-------|-----|-------|
| `color-bg-dark` | `#0D0D0D` | Page background (Space Black) |
| `color-surface-dark` | `#1C1C1E` | Cards, modals (system dark) |
| `color-surface2-dark` | `#2C2C2E` | Alternate surface (system grouped dark) |
| `color-text-dark` | `#F5F5F7` | Primary text |
| `color-text-muted-dark` | `#98989D` | Secondary text (warm gray) |
| `color-border-dark` | `#38383A` | Dividers |
| `color-primary-dark` | `#FF9F44` | Accent (Golden Gate, lighter for dark bg) |

## Typography

| Role | Family | Size | Weight | Line Height |
|------|--------|------|--------|-------------|
| App title | SF Pro, system-ui, -apple-system, sans-serif | 15px | 700 | 1.3 |
| Section heading | SF Pro, system-ui, -apple-system, sans-serif | 14px | 600 | 1.3 |
| Body | SF Pro, system-ui, -apple-system, sans-serif | 13px | 400 | 1.5 |
| Label | SF Pro, system-ui, -apple-system, sans-serif | 11px | 500 | 1.4 |
| Badge | SF Pro, system-ui, -apple-system, sans-serif | 10px | 600 | 1.3 |

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Inline gaps |
| `space-2` | 8px | Component gaps |
| `space-4` | 16px | Card inner padding |
| `space-6` | 24px | Section horizontal padding |
| `space-8` | 32px | Section vertical padding |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 6px | Small tags, mini buttons |
| `radius-md` | 10px | Inputs, list items |
| `radius-lg` | 14px | Cards, modals (Liquid Glass panels) |
| `radius-pill` | 980px | CTA buttons |

## Elevation

| Level | Value | Usage |
|-------|-------|-------|
| `shadow-sm` | `0 1px 3px rgba(0,0,0,0.06)` | Resting cards |
| `shadow-md` | `0 4px 16px rgba(0,0,0,0.10)` | Floating panels, dropdowns |
| `shadow-lg` | `0 12px 40px rgba(0,0,0,0.14)` | Modals (Liquid Glass depth) |

## Do's and Don'ts

### Do
- Use the warm amber `#C2621C` exclusively for interactive affordances (buttons, active tabs, links)
- Keep backgrounds warm — `#FAFAF8` instead of pure white, `#F2F0EB` for alternate surfaces
- Trust the system font stack — `system-ui, -apple-system` renders SF Pro on Mac automatically
- Use generous border-radius (10–14px) to evoke the rounded Liquid Glass window shapes

### Don't
- Don't use cool grays or indigo — the Golden Gate palette is warm throughout
- Don't confuse `color-warning` (amber `#F59E0B`) with `color-primary` (deeper amber `#C2621C`) — they're intentionally close but distinct
- Don't add heavy shadows to resting elements — Liquid Glass relies on translucency, not depth
