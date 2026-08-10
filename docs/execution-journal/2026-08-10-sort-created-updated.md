# 2026-08-10 — Sort menu splits Latest Created / Latest Updated

Ed's QA: "📚 Latest Topics" (sort=recent) actually ranked by a BLEND —
max(publication, last content edit) — so an edited old topic jumped
above genuinely new ones with no way to tell the views apart.

- New sort value `created` = publication order alone (publishedAt,
  createdAt fallback) → "📚 Latest Created".
- `recent` keeps its blended semantics (existing ?sort=recent URLs mean
  what they always did) → relabelled "✏️ Latest Updated".
- Menu order: 🔀 Shuffle, 📚 Latest Created, ✏️ Latest Updated,
  💬 Latest Comments, then the By ❤️ group.
