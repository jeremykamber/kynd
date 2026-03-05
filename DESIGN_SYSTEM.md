# DeepBound Design System v1.1
**Owner:** Kyiu (Lead Designer/UXR)  
**Status:** DEFINITIVE / PRODUCTION READY  
**Core Goal:** To facilitate "Magic" via Invisible Performance.

---

## 1. Core Philosophy: "Invisible Performance"
DeepBound is a professional research instrument. The UI should be a clear lens, not a destination.

### The Three Pillars
1. **The Law of Invisibility**: Strip away every border and background that isn't pulling weight. If a user notices the UI instead of the data, we failed.
2. **Predictive Density**: Place metrics exactly where the eye expects them. High-density data must feel organized, not cluttered.
3. **Tabular Precision**: Latency and "bouncy" animations are banned. Everything should feel mechanical, snappy, and intentional.

---

## 2. Global Style Foundations

### Color Palette (High-Contrast Dark Mode)
| Token | HEX | Role |
| :--- | :--- | :--- |
| `background` | `#0A0A0A` | Deep charcoal. Reduces eye strain. |
| `foreground` | `#F5F5F5` | Primary text. High legibility. |
| `card` | `#141414` | Level 1 surface. Standard data container. |
| `primary` | `#6366F1` | **Direct Indigo**. Used for primary actions and active states. |
| `muted` | `#9CA3AF` | Secondary metadata and helper text. |
| `border` | `white / 10%` | Crisp, visible boundaries. |
| `accent-glow` | `indigo-500 / 10%` | Background for "AI Insight" callouts. |

### Radii & Spacing (Modern Precision)
- **Small (4px)**: Internal machinery—inputs, small buttons, tags.
- **Standard (6px)**: Default for primary buttons and interface components.
- **Large (16px)**: Primary cards, sections, and modal containers.
- **Grid**: Strict adherence to an **8px baseline** for all padding and margins.

---

## 3. Typography: The "Dossier" Hierarchy
**Font**: Geist Sans (or System Sans-Serif).

- **Headers**: Sentence-case, Medium (500), Tracking `-0.01em`.
- **Data Labels**: Uppercase, Bold (700), Size `11px`, Tracking `0.1em`.
- **Metrics/Numbers**: **`font-variant-numeric: tabular-nums`**. This is non-negotiable for progress bars and scores.
- **Body Text**: Regular (400), Line-Height `1.5`.

---

## 4. Layout Architecture: The "Bento Logic"

### The Workspace
- **Max Container**: `1440px` (centered).
- **Gutter**: `16px` (gap-4).
- **Layering**: 
  - Level 0: Background
  - Level 1: Bento Cards (`border-white/10`)
  - Level 2: Modals (`backdrop-blur-xl`, `border-white/15`)

### The "Dossier" Bento Layout
Every Persona/Analysis view follows this 3-tier hierarchy:
1. **The Pulse (Top)**: Critical summary/AI Insight banner.
2. **The Engine (Middle)**: Quantitative psychometrics and scoring grid.
3. **The Vault (Bottom)**: Long-form backstory (4k+ tokens) or session logs.

---

## 5. Component Standards

### The "Friction Bar" (Psychometrics)
- **Height**: `h-1.5` (6px).
- **Track**: `bg-white/5`.
- **Fill**: Linear gradient from `indigo-600` to `indigo-400`.
- **Labels**: Every bar *must* have semantic labels at the poles (e.g., "Intuitive" vs. "Analytical").

### The Backstory Vault
- **Container**: `ScrollArea` with fixed height.
- **Search**: Functional keyword filter at the top.
- **Scrollbar**: `w-1`, `rounded-full`, only visible on hover.

### Interactive States
- **Hover**: No scaling. Use **Border Illumination** (`border-white/10` -> `border-white/20`) at `150ms`.
- **Primary Buttons**: High-contrast fill. Opacity shift on hover.
- **Modal Close**: `absolute top-6 right-6`, `rounded-lg` (Standard Radius).

---

## 6. Motion & Micro-interactions
- **Duration**: `150ms` (Hovers), `300ms` (Modals/Layout shifts).
- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (Out-Expo).
- **Rule**: All transitions must feel "snappy" and "mechanical." Zero bounce.