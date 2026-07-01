# DESIGN.md — AutoClaimsTech Release Planning

## Overview
AutoClaimsTech's design system is built for dense information dashboards. An indigo primary anchors interactive affordances; neutral grays create hierarchy without visual noise. The system supports both a light mode (default) and a dark mode toggle. Typography is compact and utilitarian — optimized for scanning sprint boards and backlog tables rather than reading prose.

## Colors

### Light Mode

| Token | Hex | Usage |
|-------|-----|-------|
| `color-bg` | `#F9FAFB` | Page background |
| `color-surface` | `#FFFFFF` | Cards, modals, panels |
| `color-surface2` | `#F3F4F6` | Alternate surface, table rows |
| `color-text` | `#111827` | Primary text |
| `color-text-muted` | `#6B7280` | Labels, placeholders, secondary text |
| `color-border` | `#E5E7EB` | Dividers, card outlines |
| `color-primary` | `#4F46E5` | Buttons, active tabs, accent |
| `color-primary-light` | `#E0E7FF` | Badges, hover states on primary |
| `color-danger` | `#DC2626` | Delete actions, error states |
| `color-danger-light` | `#FEE2E2` | Danger badge backgrounds |
| `color-warning` | `#D97706` | Warning callouts, deadlines |
| `color-warning-light` | `#FEF3C7` | Warning badge backgrounds |
| `color-success` | `#16A34A` | Done states, sprint complete |
| `color-success-light` | `#DCFCE7` | Success badge backgrounds |
| `color-gray` | `#6B7280` | Neutral icons, muted elements |
| `color-gray-light` | `#F3F4F6` | Neutral background fills |

### Dark Mode

| Token | Hex | Usage |
|-------|-----|-------|
| `color-bg-dark` | `#111827` | Page background (dark) |
| `color-surface-dark` | `#1F2937` | Cards, modals (dark) |
| `color-surface2-dark` | `#111827` | Alternate surface (dark) |
| `color-text-dark` | `#F9FAFB` | Primary text (dark) |
| `color-text-muted-dark` | `#9CA3AF` | Secondary text (dark) |
| `color-border-dark` | `#374151` | Dividers (dark) |
| `color-primary-dark` | `#818CF8` | Accent (dark) |
| `color-primary-light-dark` | `#1E1B4B` | Primary light fill (dark) |
| `color-danger-dark` | `#F87171` | Danger (dark) |
| `color-warning-dark` | `#FBBF24` | Warning (dark) |
| `color-success-dark` | `#4ADE80` | Success (dark) |

### Semantic / RAG

| Token | Hex | Usage |
|-------|-----|-------|
| `color-rag-red` | `#DC2626` | RAG red — sprint at risk |
| `color-rag-orange` | `#D97706` | RAG orange — lagging |
| `color-rag-green` | `#16A34A` | RAG green — on track |

## Typography

| Role | Family | Size | Weight | Line Height |
|------|--------|------|--------|-------------|
| App name | Segoe UI, system-ui, sans-serif | 15px | 700 | 1.3 |
| Section heading | Segoe UI, system-ui, sans-serif | 15px | 700 | 1.3 |
| Body / table | Segoe UI, system-ui, sans-serif | 12px | 400 | 1.5 |
| Label / badge | Segoe UI, system-ui, sans-serif | 11px | 600 | 1.4 |
| Caption / tag | Segoe UI, system-ui, sans-serif | 10px | 700 | 1.3 |
| Stat value | Segoe UI, system-ui, sans-serif | 22px | 800 | 1.2 |

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Inline gaps, icon-label |
| `space-2` | 8px | Small component gaps |
| `space-3` | 12px | Card internal padding |
| `space-4` | 16px | Section padding |
| `space-6` | 24px | Page horizontal padding |
| `space-8` | 32px | Major section separation |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-xs` | 4px | Small buttons, icon actions |
| `radius-sm` | 7px | Sprint items, small cards |
| `radius-md` | 8px | Inputs, modal inner elements |
| `radius-lg` | 11px | Sprint cards, main modals |
| `radius-pill` | 20px | Client tags, filter chips, badges |

## Elevation

| Level | Value | Usage |
|-------|-------|-------|
| `shadow-xs` | `0 1px 4px rgba(0,0,0,0.05)` | Header, sticky nav |
| `shadow-sm` | `0 2px 8px rgba(0,0,0,0.08)` | Cards at rest |
| `shadow-md` | `0 4px 16px rgba(0,0,0,0.10)` | Cards on hover |
| `shadow-lg` | `0 4px 18px rgba(0,0,0,0.22)` | Toasts |
| `shadow-xl` | `0 20px 60px rgba(0,0,0,0.18)` | Modals |

## Components

### Sprint Card
- Width ~260px, border-radius 11px
- Colored top border per sprint goal
- Capacity bar at bottom (color shifts red when overloaded)
- Active sprint: primary-color border + subtle primary-light glow

### Backlog Item
- Row height ~34px in table view
- Client tag pill (colored per client), SP badge, priority icon
- Drag handle appears on hover

### Client Tag / Badge
- Pill shape (border-radius pill), font-size 9–11px, font-weight 700
- Background = client color at 20% opacity, text = client color

### Kanban Column
- Min-width 220px, dashed drop target on drag-over
- Column header shows done/total count + SP sum

### Modal
- Max-width 680px, border-radius 11px, shadow-xl
- Tab bar at top with box-shadow underline (not border)
- Active tab: primary color indicator flush to bottom

### Dashboard Stats
- Stat value 22px/800 weight, label 10px muted below

## Do's and Don'ts

### Do
- Use indigo (`#4F46E5`) exclusively for interactive affordances — buttons, active states, links
- Keep typography small (10–12px for body) — this is a power-user dashboard, not a reading app
- Use pill badges for client tags — the rounded shape signals "filterable"
- Prefer muted colors for secondary information; let the primary data breathe

### Don't
- Don't introduce new accent colors — the semantic palette (danger, warning, success) is already saturated
- Don't use font sizes below 10px
- Don't add heavy shadows to cards at rest — elevation is reserved for interactive/floating elements
- Don't change the indigo primary without also updating the dark-mode variant
