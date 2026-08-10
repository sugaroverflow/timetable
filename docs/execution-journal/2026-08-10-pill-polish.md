# 2026-08-10 — Pill polish: dropdown ink, light-mode glass, toolbar rhythm

Three QA items on the glass bar:

- **"By ❤️" light-on-light in dark mode**: Windows/Linux Chrome render
  styleable select popups whose labels inherit the select's ink while
  the popup bg stays light. Global `option, optgroup` rule pins
  color/background to ink/card; macOS system popups ignore it (they
  already follow color-scheme, which tokens.css sets per theme).
- **Light-mode glass was invisible against the page**: new `--glass`
  token pair — light mixes from WHITE (pill sits lighter than the grey
  page), dark keeps the bg-based mix (darker than cards) — plus a soft
  accent glow (`0 6px 24px -4px` primary at 16%) in both themes.
- **Desktop rhythm**: the search field now GROWS into the bar's middle
  (flex, capped 420px) — toolbar pattern, the field is the bar's main
  affordance — instead of a 140px orphan with a void before the
  right-aligned filters.
