---
name: Kynd
description: AI-powered persona testing and behavioral insights
colors:
  background: oklch(0.12 0.01 265)
  foreground: oklch(0.95 0 0)
  card: oklch(0.14 0.01 265)
  card-foreground: oklch(0.95 0 0)
  primary: oklch(0.62 0.2 230)
  primary-foreground: oklch(0.98 0 0)
  secondary: oklch(0.16 0.01 265)
  secondary-foreground: oklch(0.95 0 0)
  muted: oklch(0.18 0.01 265)
  muted-foreground: oklch(0.52 0.01 265)
  accent: oklch(0.18 0.01 265)
  accent-foreground: oklch(0.95 0 0)
  destructive: oklch(0.58 0.2 28)
  border: oklch(0.2 0.01 265)
  input: oklch(0.2 0.01 265)
  ring: oklch(0.25 0 0)
  sidebar: oklch(0.1 0.01 265)
  sidebar-foreground: oklch(0.9 0 0)
  sidebar-border: oklch(0.16 0.01 265)
  chat-user-bubble: oklch(0.62 0.2 230 / 0.12)
  chat-assistant-bubble: oklch(0.16 0.01 265)
typography:
  display:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: clamp(2.5rem, 5vw, 4.5rem)
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.03em
  headline:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: clamp(1.5rem, 3vw, 2.25rem)
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.02em
  title:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: 1.125rem
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: -0.01em
  body:
    fontFamily: Geist, system-ui, sans-serif
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: Geist Mono, ui-monospace, monospace
    fontSize: 0.6875rem
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.08em
  mono:
    fontFamily: Geist Mono, ui-monospace, monospace
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 24px
  6: 32px
  7: 48px
  8: 64px
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '{rounded.md}'
    padding: 12px 24px
  button-secondary:
    backgroundColor: transparent
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: 12px 24px
  button-ghost:
    backgroundColor: transparent
    textColor: '{colors.muted-foreground}'
    rounded: '{rounded.md}'
    padding: 8px 16px
  card-default:
    backgroundColor: '{colors.card}'
    rounded: '{rounded.lg}'
    padding: '{spacing.5}'
  input-default:
    backgroundColor: transparent
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: 10px 14px
  sidebar-item:
    backgroundColor: transparent
    textColor: '{colors.muted-foreground}'
    rounded: '{rounded.md}'
    padding: 8px 12px
---

# Design System: Kynd

## 1. Overview

**Creative North Star: "The Instrument Panel"**

Kynd is a precise research instrument, not a dashboard. Like the cockpit of a high-end microscope or the control surface of a recording console, every element exists because it serves a function. The interface is a clear lens between the user and the behavioral data — when it works well, the user forgets it's there.

**Personality:** Sharp, confident, minimal. The visual system takes cues from Notion's editorial clarity, Arc's spatial conviction, and Raycast's keyboard-first precision. Warmth comes from craft, not from ornamentation.

This system explicitly rejects the Generic AI SaaS aesthetic — no gradient heroes, no glass-morphism cards, no hero-metric template, no decorative blur as default surface treatment. Color is rare and purposeful. Surfaces are flat. Motion is mechanical, not playful.

**Key Characteristics:**
- Dark mode primary, light mode secondary — the instrument lives in dim rooms at late hours
- One accent color (cerulean blue) used on ≤10% of any screen; its rarity is the point
- Flat surfaces with crisp, thin borders — no shadows at rest
- Snappy, mechanical motion — 150ms transitions, expo easing, zero bounce
- Typographic hierarchy driven by weight and scale contrast, not color

## 2. Colors

A restrained palette built around cool charcoal neutrals and a single cerulean blue accent. The strategy is deliberate scarcity: the accent exists to direct attention, not to decorate.

### Primary (Dark Mode — Primary Expression)

- **Instrument Charcoal** (`oklch(0.12 0.01 265)`): Background. Deep cool charcoal with a faint blue tilt — never pure black.
- **Panel Surface** (`oklch(0.14 0.01 265)`): Card and elevated surface backgrounds. One step above background, distinguishable by lightness, not shadow.
- **Raised Surface** (`oklch(0.16 0.01 265)`): Secondary surfaces, sidebar, hovered cards.
- **Cerulean Blue** (`oklch(0.62 0.2 230)`): Primary accent. A warm cerulean blue used sparingly for interactive elements, active states, and data highlights. Never decorative.
- **Instrument White** (`oklch(0.95 0 0)`): Primary text, headings, high-importance labels.
- **Instrument Grey** (`oklch(0.52 0.01 265)`): Secondary text, metadata, placeholders.
- **Panel Edge** (`oklch(0.2 0.01 265)`): Borders and dividers. Thin, crisp, present but not dominant.

### Primary (Light Mode — Secondary Expression)

- **Instrument White** → `oklch(0.97 0.005 265)`: Background in light mode. Cool off-white.
- **Panel Surface** → `oklch(0.94 0.005 265)`: Card backgrounds.
- **Instrument Charcoal** → `oklch(0.14 0.01 265)`: Text in light mode.
- **Cerulean Blue** → `oklch(0.57 0.2 230)`: Primary accent, slightly deeper to maintain contrast on light backgrounds.
- **Panel Edge** → `oklch(0.85 0.01 265)`: Borders in light mode.

### Semantic Colors

- **Alert Red** (`oklch(0.58 0.2 28)`): Destructive actions, errors, critical signals.
- **Cerulean Blue (low opacity)** (`oklch(0.62 0.2 230 / 0.12)`): User chat bubbles, selection highlights, active filter backgrounds. The accent color applied as a tint rather than a solid.

### Named Rules

**The Rarity Rule.** The accent (Cerulean Blue) occupies no more than 10% of any given screen. Its scarcity is what gives it power. If a screen feels colorful, the rule is broken.

**The No-Black Rule.** Never use `#000` or `rgb(0,0,0)`. Every dark surface has chromatic temperature. Charcoal carries a faint blue tilt because the brand hue lives in the cool blue-violet range, not because "dark mode = desaturated black."

**The Flat-Edge Rule.** Borders are thin (`1px`) and present. They separate surfaces so shadows don't have to. If a border is doing its job, a shadow isn't needed.

## 3. Typography

**Display & Body Font:** Geist Sans (with system-ui, sans-serif fallback)
**Mono/Label Font:** Geist Mono (with ui-monospace, monospace fallback)

**Character:** Sharp, technical, and unapologetically typographic. This is a single-family system with distinct expression: Geist Sans carries all interface text, Geist Mono owns data, code, and labels. The contrast between Sans and Mono creates the hierarchy at the type level.

### Hierarchy

- **Display** (600, `clamp(2.5rem, 5vw, 4.5rem)`, 1.1, `-0.03em`): Hero headlines and marketing landing titles only. Never used inside the app dashboard.
- **Headline** (600, `clamp(1.5rem, 3vw, 2.25rem)`, 1.2, `-0.02em`): Section headers in the app, page titles, modal headers.
- **Title** (500, `1.125rem`, 1.4, `-0.01em`): Card titles, persona names, feature headings.
- **Body** (400, `0.9375rem`, 1.6): Primary reading text. Line length capped at 70ch.
- **Label — Mono** (500, `0.6875rem`, 1, `0.08em`, uppercase): Data labels, metric names, badge text, metadata. Always Geist Mono, always uppercase.
- **Mono** (400, `0.8125rem`, 1.5): Code snippets, numeric data, chat messages.

### Named Rules

**The Mono-Data Rule.** All quantitative data — scores, metrics, timestamps, tokens — renders in Geist Mono with `font-variant-numeric: tabular-nums`. Numbers must align in tables and lists.

**The Single-Family Rule.** No mixing display fonts with body fonts. Geist Sans carries everything. Hierarchy comes from weight, size, and the Sans-vs-Mono switch, not from font changes.

## 4. Elevation

Flat by default. This system does not use box-shadows to convey surface hierarchy. Depth is communicated exclusively through tonal layering (lightness steps between surfaces) and thin border presence.

- **Level 0** — Background (`oklch(0.12 0.01 265)`)
- **Level 1** — Card / Panel Surface (`oklch(0.14 0.01 265)`) + Panel Edge border
- **Level 2** — Raised Surface / Sidebar (`oklch(0.16 0.01 265)`) + Panel Edge border
- **Level 3** — Modal / Popover / Dialog: Panel Surface with backdrop dim (`rgba(0,0,0,0.4)`)

### Named Rules

**The No-Shadow Rule.** No `box-shadow` at rest. If a surface needs to separate from another, use a lightness step + a thin border. Shadows are prohibited as a layout tool. The only exception is interactive hover states on primary action elements, which may use a very subtle blue ambient glow (`0 0 0 2px oklch(0.62 0.2 230 / 0.2)`) as a focus indicator.

## 5. Components

### Buttons

**Button Hierarchy (Primary → Secondary → Ghost):** Every button in the UI must clearly belong to one of three tiers. The visual difference between tiers must be unmistakable — two buttons in the same action group must not look like they belong to different families. Mixing styles within a tier creates visual noise.

- **Shape:** Crisp 6px radius (`rounded.md`). No pill shapes — those belong on consumer surfaces.
- **Primary** (one per viewport max — chat buttons are the exception): Cerulean Blue (`bg-primary`) fill, Instrument White text. Distinguished by a subtle `ring-1 ring-primary/20` for depth. Hover: `bg-primary/90` (slightly darker fill, no shift). Transition: all 150ms `cubic-bezier(0.16, 1, 0.3, 1)`. No scale, no lift. Primary buttons are rare — reserved for the single most important action on screen, plus "Chat with" buttons which are intentionally elevated to primary to signal interactivity.
- **Secondary** (preferred default for paired actions): `bg-card` fill with `1px border border-border/60`, Foreground text. Hover: `bg-muted/30`. This integrates with the card surface it sits on — it feels planted, not floating. Transition: colors 150ms. Used for non-primary actions in action bars, card footers, and dialog rows. Pairs of buttons use Primary + Secondary, never Primary + Primary.
- **Ghost:** Transparent fill, no border, Muted Foreground text. Hover: Foreground text. Used for icon-only buttons, inline toolbar actions, and sidebar items.
- **Padding:** `12px 24px` (standard), `8px 16px` (compact/icon), `10px 20px` (within data-heavy layouts).

**Notes on the Ring:** The `ring-1 ring-primary/20` on primary buttons exists purely to add a hair of definition to the blue fill — it prevents the button from looking like a floating color blob on dark surfaces. It is not a glow, not a shadow, not interactive feedback. The ring is part of the button's static shape, not an interaction cue.

### Cards

- **Corner Style:** 8px radius (`rounded.lg`) — gently curved, not sharp.
- **Background:** Panel Surface (`oklch(0.14 0.01 265)`).
- **Border:** Panel Edge, `1px`, full perimeter. No side-stripe borders — prohibited.
- **Shadow:** None at rest. None on hover. If hover feedback is needed, use border illumination (Panel Edge → `oklch(0.25 0.01 265)`).
- **Internal Padding:** 24px (`spacing.5`). May be reduced to 16px in data-dense grid layouts.

### Inputs / Fields

- **Style:** Transparent background, Panel Edge `1px` full border, 6px radius.
- **Focus:** Panel Edge is replaced with Cerulean Blue `1px` border + very subtle ambient glow (`0 0 0 2px oklch(0.62 0.2 230 / 0.15)`). No ring offset.
- **Padding:** `10px 14px` vertical/horizontal.
- **Placeholder:** Muted Foreground at `oklch(0.40 0.01 265)`.
- **Error:** Alert Red border. Error text in Alert Red at Label size.
- **Disabled:** Full opacity at 0.4. No special background change.

### Dropdown Menus

- **Background:** Panel Surface with a subtle border (`1px border-border`), `6px` radius, shadow only on open (`shadow-md`).
- **Item Hover:** Raised Surface background (`accent` / `oklch(0.22 0.008 265)` in dark mode). **Never Cerulean Blue** — the accent color is reserved for primary actions and data highlights, not hover feedback.
- **Item Focus (keyboard):** Same as hover — tonal surface shift, not color.
- **Item Text:** Foreground at rest, Muted Foreground for disabled/secondary text.
- **Icons:** Muted Foreground, no color shift on hover.
- **Separator:** Thin `1px` line using Panel Edge, inset with padding.

### Navigation / Sidebar

- **Background:** Sidebar Surface (`oklch(0.1 0.01 265)`) — one step below main background for visual containment.
- **Items:** Ghost-style (no background at rest). Hover: Panel Surface background at `oklch(0.14 0.01 265)`. Active: Panel Surface + Cerulean Blue left marker (or text color shift to foreground, no marker).
- **Typography:** Body size (`0.9375rem`), Muted Foreground at rest, Foreground on active.
- **Width:** `240px` expanded, `56px` collapsed (icon-only).

### Selection States / Toggle Groups

Selection states (segmented controls, option toggles, count selectors, filter chips) use tonal hierarchy, not color, to indicate the active item. The accent color is reserved for primary actions — using it for selected-in-a-group state would violate the Rarity Rule.

- **Selected:** Raised Surface background (`muted` / `oklch(0.18 0.01 265)`), Foreground text (`oklch(0.95 0 0)`), Panel Edge border (`oklch(0.2 0.01 265)`). The background step up from the surrounding surface is enough to signal "this one is active" without introducing a second blue element.
- **Unselected:** Transparent background, Muted Foreground text (`oklch(0.52 0.01 265)`), Panel Edge border (`oklch(0.2 0.01 265)`). Hover elevates text to Foreground and border to a lighter step.
- **Implementation:** `bg-muted text-foreground border-border` for selected, `bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-border/80` for unselected.

This applies to all segmented toggle groups, option rows, and count selectors across the app. The principle: selected state is communicated by a surface lightness step, never by the accent color alone.

### Chips / Badges / Tags

- **Style:** 4px radius, Panel Surface background at `oklch(0.18 0.01 265)`, Label typography (Geist Mono, uppercase, 11px).
- **Color Variants:** Cerulean Blue text for active/selected states. Muted Foreground for neutral. Alert Red text for warning/error.
- **Padding:** `4px 10px`.

### Destructive Actions (Delete / Close)

- **Style:** Small circle (`size-6 rounded-full`) with `XIcon` (`size-3.5`), positioned absolutely at `-top-2 -right-2` on the parent container.
- **Color:** Alert Red background at 90% opacity (`bg-destructive/90`), Instrument White text (`text-destructive-foreground`).
- **Visibility:** Hidden at rest (`opacity-0`), revealed on parent group hover (`group-hover:opacity-100`) with 150ms opacity transition.
- **Hover:** Full opacity red (`hover:bg-destructive`).
- **Parent:** The parent container must have `group relative` classes to enable the hover reveal.
- **Usage:** Used on cards, list items, and tags where deletion is a secondary action. The button must never be visible at rest — it only appears when the user is actively engaging with the item.

## 6. Do's and Don'ts

### Do:

- **Do** let surfaces separate by lightness alone — one OKLCH step between background, card, and raised surface is enough.
- **Do** use Cerulean Blue sparingly: one element per viewport at most. If your eye lands on two blue elements, remove one.
- **Do** render all numeric data in Geist Mono with `font-variant-numeric: tabular-nums`.
- **Do** use borders (thin, `1px`, Panel Edge) to define surface boundaries.
- **Do** keep transitions at 150ms with `cubic-bezier(0.16, 1, 0.3, 1)` — snappy, no bounce, no drift.
- **Do** use backdrop dim (`rgba(0,0,0,0.4)`) as the only elevation cue for modals and dialogs.

### Don't:

- **Don't** use box-shadows to convey depth. Flat surfaces with tonal separation are the only elevation system.
- **Don't** use gradient text (`background-clip: text` with a gradient) anywhere — decorative and meaningless. Emphasize with weight or size.
- **Don't** use side-stripe borders (border-left >1px as an accent on cards or list items). Use full perimeter borders or nothing.
- **Don't** use glassmorphism (backdrop blur + semi-transparency) as a default surface treatment.
- **Don't** use pill-shaped buttons. Radius stays at 6px for interactive elements.
- **Don't** use bounce easing or elastic transitions. Everything should feel mechanical and precise.
- **Don't** use the hero-metric template (big number, small label, gradient, supporting stats) — it is the Generic AI SaaS calling card.
- **Don't** use identical card grids where every card has the same icon + heading + text structure.
- **Don't** reach for a modal as the first interaction pattern. Exhaust inline panels, side sheets, and progressive disclosure first.
- **Don't** use color as the sole differentiator for any state or action — always pair with text, icon, or position.
- **Don't** reference the old design system. This document supersedes all prior visual guidance.
