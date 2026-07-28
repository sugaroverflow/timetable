# Body fold broken by React's post-hydration innerHTML rewrite

**Date:** 2026-07-28

Ed reported the topic-card fold not working: every long body rendered in
full with a "Show more" button under it. Reproduced outside Next with an
esbuild + Playwright harness (real component, `renderToString` →
`hydrateRoot`, headless Chromium) and caught the mechanism with a
MutationObserver:

1. `CollapsibleTopicBody`'s layout effect hides the tail children with
   inline `display: none` and flips its `hydrated`/`collapsible` state.
2. That state flip is the component's first re-render after hydration —
   and React 19 **re-applies `dangerouslySetInnerHTML` on the first
   post-hydration update even when `__html` is unchanged**, recreating
   the children and wiping the inline styles. Verified against both npm
   `react-dom` 19.2.7 and Next 16's vendored build.

So the component sabotaged itself: the very state update that reveals the
"Show more" button also un-hid the body. (Client-mounted cards — e.g.
scroll-loaded feed pages — never hydrate, which is why the fold behaved
in some contexts.)

**Fix:** the layout effect now runs after *every* commit (no dependency
array) so it re-applies the collapse whenever React rewrites the
container. The setters bail out on unchanged values, so there's no
render loop; the re-apply happens pre-paint, so nothing flashes.

Gotcha recorded in CLAUDE.md: DOM patched inside a
`dangerouslySetInnerHTML` container must be re-applied every commit —
never keyed on props alone.
