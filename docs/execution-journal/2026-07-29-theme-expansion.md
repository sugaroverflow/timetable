# Theme expansion: brand font, more pairings, colour presets, dark-mode icon

**Date:** 2026-07-29

Ed's requests for Forum Settings → Theme, plus cleanup.

- **Forum name font**: a separate "Forum name font" dropdown (Ed left the
  call to me — the topbar name is a display face, a different concern
  from the reading pairing). Ten options (Poetsen One default, Fraunces,
  Playfair Display, Abril Fatface, Bebas Neue, Space Grotesk, Lobster,
  Caveat, IBM Plex Mono, plain Inter); persisted as
  `theme.brandFont`, emitted as a `--brand-display` override.
- **Four new pairings**: Playfair + Inter, all-sans Space Grotesk,
  all-serif Fraunces, and system fonts — nine total.
- **Twelve colour presets**: a "command" dropdown that fills every light
  AND dark colour field at once then snaps back to its placeholder — the
  individual swatches stay the source of truth and remain tweakable.
  Classic Blue, Forest, Ocean, Plum, Crimson, Terracotta, Amber, Rose,
  Teal, Slate, Midnight bar, Noir.
- **Section order**: fonts first, then presets, then Light palette, then
  Dark palette (fonts used to sit between the two palettes).
- **Dark-mode icon** (Ed mid-build): optional `iconDarkUrl` upload —
  both variants render and CSS shows the one matching `html[data-theme]`
  (always stamped resolved by the pre-paint script); falls back to the
  main icon; choosing an emoji clears both images.
- **Cleanup**: the API's theme-font whitelist was a hand-kept Set that
  had to be updated in lockstep with the web's pairing map — the
  canonical key lists (`THEME_FONT_KEYS`, `BRAND_FONT_KEYS`) now live in
  `@timetable/shared` and both sides derive from them. Stale "toggle on
  their Profile page" copy fixed (the toggle moved to the sidebar).
  New Google families added to the layout's font link (font files only
  download when a forum actually uses them).
