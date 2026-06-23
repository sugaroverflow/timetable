## 2026-06-23T19:04:12Z - README And Docs Restructure

### Goal

Make the repository documentation PR-reviewable and easier to navigate by
turning the README into a concise project entry point and moving detailed
technical/product/deployment context into tracked docs.

### Changes

- Replaced the long README with a short overview, screenshots, quick start,
  script list, and links to deeper docs.
- Added `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, and
  `docs/ROADMAP.md`.
- Kept screenshot assets in `docs/assets/readme`.

### Decisions

- Chose tracked Markdown docs over GitHub Wiki so architecture and deployment
  changes can be reviewed in pull requests with code.
- Kept runtime architecture, deployment, and roadmap details out of the README
  to reduce front-page noise.
- Documented object storage as reserved/incomplete because the tracked app does
  not currently include a committed upload endpoint.

### Tradeoffs

- The docs are intentionally concise and may omit lower-level implementation
  details that were previously inline in the README.
- The README no longer carries the full phase checklist; that detail moved to
  `docs/ROADMAP.md`.

### Risks

- Some deployment comments in `.env.example` and `.do/app*.yaml` still mention
  Spaces upload behavior that is not present in tracked API code.
- Docs can still drift if feature changes do not update the relevant tracked
  docs in the same PR.

### Verification

- Markdown files were reviewed for internal links and obvious stale references.
- Code/runtime tests were not needed for this docs-only change.

### Demo Impact

The README now starts with screenshots and a short product explanation, making
the repository easier to use in demos and reviews.

### Customer-Facing Context

The new docs split makes it easier to explain product behavior, system
architecture, deployment boundaries, and remaining hardening work separately.

### Next Recommended Step

Run a full app audit and update `docs/ROADMAP.md` with prioritized findings.
