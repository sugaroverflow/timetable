# Design tokens

The app's visual language is defined entirely by CSS custom properties ("design
tokens"). There is no Tailwind and no CSS-in-JS. This doc is the contract for how
the token system is structured and how to work with it.

## Files

- **`apps/web/src/app/tokens.css`** — the single source of truth for every design
  value (color, spacing, typography, radius, shadow, z-index, motion). Imported
  first in `apps/web/src/app/layout.tsx`.
- **`apps/web/src/app/globals.css`** — base element styles, layout primitives, and
  component classes. References semantic tokens only; contains **no raw colors**.
- **`apps/web/src/lib/timetableSettings.ts`** — the per-timetable theming engine
  (`themeVars` / `buildThemeCss`) that overrides a subset of semantic tokens.

## Two tiers

1. **Palette (primitives).** Raw chromatic values, hue-named (`--blue-600`,
   `--purple-400`, `--green-500`…). Mode-agnostic. **Never reference these from a
   component** — they exist only to feed the semantic layer. Neutrals are the one
   exception: because they differ per mode, neutral values live directly in the
   semantic light/dark blocks rather than the palette.
2. **Semantic tokens.** What components actually consume: `var(--card)`,
   `var(--primary)`, `var(--status-published-ink)`, `var(--space-4)`. Defined for
   light on `:root` and remapped for dark on `html[data-theme="dark"]`. Because
   components read semantics only, they never need to know the current mode.

```
component rule ──▶ semantic token ──▶ palette primitive
.status-published    --green-ink         --green-700 (light) / --green-200 (dark)
```

## The three theming axes (how a final color is resolved)

1. **Base semantic value** from `tokens.css` `:root`.
2. **Dark mode** — `html[data-theme="dark"]` remaps semantics. The attribute is set
   pre-paint by a script in `layout.tsx` from `localStorage["theme-mode"]`
   (`system|light|dark`); the toggle lives on the Profile page. This is a
   **per-user, per-browser** choice.
3. **Per-timetable theme** — `buildThemeCss()` injects a `<style>` with `:root{…}` +
   `html[data-theme="dark"]{…}` blocks that override the *themeable subset* of
   semantic tokens. SSR'd into the timetable layout, so there's no flash. This is a
   **per-timetable** brand palette set by admins in Settings.

Source order guarantees (3) wins over (1)/(2) for the themeable subset, and the
dark block wins over light when `data-theme="dark"`.

## Token categories (semantic)

**Surfaces:** `--bg` (page), `--card`, `--wash` (subtle fill/hover),
`--wash-strong` (stronger hover), `--scrim` (modal backdrop).

**Text:** `--ink` (primary), `--muted` (secondary, AA on card), `--faint`
(tertiary, AA), `--on-accent` (text/icon on a saturated fill).

**Borders:** `--line`, `--line-strong`.

**Brand:** `--primary`, `--primary-soft`, `--primary-ink`.

**Host / secondary accent (purple):** `--host-ink`, `--host-wash`, `--host-line`,
`--host-track` (insight bar track), `--host-chip` (weight chip), `--host-accent-2`
(gradient end).

**Heart:** `--heart`, `--heart-soft`.

**Status — success:** `--green`, `--green-soft`, `--green-ink`.
**Status — warning:** `--yellow`, `--yellow-soft`, `--warning-ink`,
`--warning-soft`, `--warning-line`.
**Status — danger:** `--red`, `--red-soft`, `--red-ink`.
**Status — neutral chips:** `--status-draft-bg/-ink`, `--status-neutral-bg/-ink`.

**Components:** `--pill-strong-bg/-ink/-line` (owner/admin pill), `--bubble-bg`
(comment bubble), `--toast-bg/-ink/-ok/-error-bg/-error-ink`.

**Topbar (themeable):** `--topbar`, `--topbar-ink`.

## Scales

- **Radius:** `--radius-xs` 6, `--radius-sm` 9, `--radius-md` 10, `--radius` 14,
  `--radius-pill` 999.
- **Spacing (4px base):** `--space-1`…`--space-8` (4/8/12/16/20/24/28/32).
- **Type sizes:** `--text-2xs` 11 → `--text-4xl` 26 (11/12/13/14/15/16/18/20/24/26).
- **Type weights:** `--fw-normal` 400, `--fw-medium` 500, `--fw-semibold` 600,
  `--fw-bold` 700.
- **Line-heights:** `--lh-tight` 1.3, `--lh-snug` 1.4, `--lh-base` 1.5,
  `--lh-relaxed` 1.6.
- **Fonts:** `--brand-display`, `--sans`, `--serif`, `--mono`.
- **Elevation:** `--shadow-sm`, `--shadow`, `--shadow-pop` (all dark-aware).
- **Z-index:** `--z-sticky` 40, `--z-dropdown` 50, `--z-modal` 100, `--z-toast` 200
  (toasts intentionally sit above modals).
- **Motion:** `--transition-fast` 120ms, `--transition` 200ms, `--ease`.

## Which tokens a per-timetable theme can override

Admins control (via Settings): primary, secondary (→ host accent), background,
top-bar, top-bar text, text, and a curated font pairing — each with an optional
dark override. These map onto the themeable semantic tokens: `--primary`,
`--primary-soft`, `--primary-ink`, `--host-ink`, `--host-wash`, `--host-line`
(plus derived `--host-track`/`--host-chip`/`--host-accent-2`), `--bg`, `--topbar`,
`--topbar-ink`, `--ink`, `--serif`, `--sans`. **These names are load-bearing for
the theming engine — do not rename them without updating `timetableSettings.ts`.**
Everything else (neutrals, status colors, radii, spacing, type, shadows) is global.

## Rules for contributors

- **Never hardcode a color** in a component rule or inline `style`. Use a semantic
  token. If none fits, add one to `tokens.css` with **both** a light and a dark
  value.
- **Reference semantics, not palette**, from components.
- **Every new color token needs a dark value** — otherwise it will be wrong in dark
  mode. This is the single most common past bug.
- **Contrast:** any text/background token pair should clear WCAG AA (4.5:1 for body,
  3:1 for large/UI) in both modes. Text placed on a *themeable* fill (e.g. custom
  primary) must derive its ink for contrast rather than hardcoding white — see
  `readableInk` in `timetableSettings.ts`.
- **Prefer utility classes** (`.section-title`, `.divider-top`, `.stat-grid`) over
  repeated inline styles.
- Reach for scale tokens (`--space-*`, `--text-*`, `--radius-*`) instead of raw px.

## Known deferred items

- A few off-scale one-off literals remain by design (font-sizes 12.5/13.5/17/30px;
  radii 3/8/11/13px) — normalizing them onto the scale is a visual change and should
  be a separate pass with design sign-off.
- General spacing (padding/margin/gap in `globals.css`) is only partially migrated to
  `--space-*`; many values are off the 4px grid. Migrate opportunistically.
- Icons are still emoji glyphs. Recommended follow-up: adopt Lucide (tintable via
  `currentColor`, so it inherits the theme). See the UI-library plan.
