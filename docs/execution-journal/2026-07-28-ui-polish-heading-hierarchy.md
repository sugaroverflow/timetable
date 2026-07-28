# UI polish: role labels everywhere + a heading hierarchy

**Date:** 2026-07-28

Ed's rapid-fire QA batch (PR #153), plus the fold rework (#152) and the
queue page (#151) from the same evening.

- **Custom role labels** now reach the ❤️ breakdown table (header, name
  fallback), the elector-fold sub-table's Host column, activity-table
  fallbacks, and "No electors yet" — threaded through
  `TopicCard`/`topicCardProps` as `electorLabel`.
- **Heading hierarchy**: sizes had decoupled (topic titles 24px on
  desktop, page titles 18). Now three strict tiers sized for skimming —
  `.page-title` 26 > `.section-title` 20 > `.topic-title` 18 — with every
  inline heading `fontSize` normalized onto the classes. Person name is
  its page's h1; People role-group headers are full section headers (the
  role switch is the landmark when skimming); the permalink page's topic
  title renders at tier 1 via a page-scoped override; API/Pending
  sections promoted from eyebrow labels. Deliberately small: activity
  day labels, empty-state titles.
- **Person pages**: Newest-first (shuffle machinery removed — a profile
  is a record, not a ballot); portrait with name + role pills beneath.
- **Fold rework (#152)**: character-budgeted — <1000 chars never folds,
  previews accumulate blocks to ~500 chars, folds hiding <300 chars are
  dropped. Loose-list `<li><p>` gaps halved.
- **Ops note**: heavy deploy days fill the 500 MiB registry before the
  nightly GC (push fails "invalid content range"; during GC, bare
  "unauthorized"). Fix: dispatch `registry-gc.yml`, wait ~20 min, rerun
  the deploy. Consider a midday GC cron.
