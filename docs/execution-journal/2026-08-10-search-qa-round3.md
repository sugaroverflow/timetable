# 2026-08-10 — Search/pill QA round 3: full-width bar, resting wash, labels

Ed's follow-ups on the glass pill:

- **The search box's inner-pill wash is on all the time** (was
  focus-only) — at rest it now reads as "a search field", not bare text.
- **The glass bar spans the feed's full width** again (`fit-content`
  dropped), still the same floating glass material: **search sits
  left**, host filter + sort **right-align** via `margin-right: auto` on
  `.feed-search`. Other feed-toolbar pages (no search box) keep their
  controls left-aligned, unchanged.
- **Sort labels**: "🔀 Shuffle", "📚 Latest Topics", "💬 Latest
  Comments" (values unchanged — `random` stays `random` per the naming
  canon; the By ❤️ optgroup untouched).

Previewed on live dev via CSS/DOM injection (dark mode) before
committing.
