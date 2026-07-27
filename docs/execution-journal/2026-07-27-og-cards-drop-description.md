# 2026-07-27 - Social preview cards; forum description removed

## Social previews (Open Graph)

Every share now unfurls with a generated 1200×630 card (`next/og`,
`opengraph-image.tsx` per segment), deliberately simple: text on white
with the forum's theme-primary accent bar.

- **topic.forum** (app level): "📚 Topic" + tagline — the only card
  carrying app branding (per Ed: inside a forum, the forum IS the brand).
- **Forum pages**: forum icon emoji + name.
- **Topic permalinks**: forum name kicker, topic title, host footer;
  og:title/description = topic title + plain-text body excerpt.
- **Person pages**: forum name kicker, person's name; og:title = name.

All data is fetched **anonymously by design** (`anonGql` in
`lib/ogCard.tsx`, with a justified lint-disable — the transport wrappers
attach sessions): a private forum's card can never leak its name, an
unpublished topic degrades to the forum card, a hidden profile (privacy
matrix) degrades likewise, and everything bottoms out at the app card.

## Forum description: removed

It was write-only — editable in Settings, stored, exposed via GraphQL,
rendered nowhere (predates several redesigns). Rather than promote it
into the cards, Ed chose removal: dropped from both forms, the create
action, the GraphQL type + mutations, core, the seed parser, and the
column itself (drizzle-generated migration 0020).
