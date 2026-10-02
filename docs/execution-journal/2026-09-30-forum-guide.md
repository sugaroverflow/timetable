# 2026-09-30 — How it works (forum-guide)

## The ask

An approachable way for members, hosts, and admins to understand what Topic
does and how the pieces fit together — without a forced click-through tour
or a large help centre. `docs/PRODUCT.md` is thorough but written for the
people building the product, and the app itself had no place that said
"here is what you do here".

## What orientation looked like before

A new member lands on All Topics with a sidebar of up to thirteen links,
several of which only exist for some roles or features (Topic Queue,
My Topics, ❤️/💙 Topics, Calendar, Pending Topics, Analysis, …). The shape
of the process — hosts write → admins publish → electors ❤️ → sessions get
scheduled — was nowhere on screen, and none of it was in the forum's own
role names ("Faculty", "Fellows").

## Decisions

1. **One page, not a tour.** A sidebar link, "How it works", last in the
   nav so it never pushes the working links down. Nothing pops up, nothing
   has to be dismissed, nothing is stored per user.
2. **Written for the reader.** Sections appear only for the roles the
   viewer holds (a multi-role member gets each), a visitor gets
   "Reading as a visitor" instead, and every section is in the forum's role
   labels ("For Fellows", "For Faculty").
3. **Only what this forum has.** Steps follow the same switches the product
   does: calendar on/off (and, for non-admins, whether slots exist yet —
   the sidebar's own rule, now shared as `calendarNavVisible`), the
   calendar confirm policy, hosts publishing directly, the host-only
   thread, and 💙 for hosts who aren't electors.
4. **A map, not a manual.** Each step is two sentences naming the real
   control ("Ready to publish", "New topic", "Send invite") and ends in a
   link to the page it lives on. Weighting math, privacy levels, and
   digest kinds stay in the pages that own them.
5. **Copy rules held.** ❤️ not "heart", no "feed", and ❤️ never stated to
   mean "I'd attend" (demand-first scheduling's rule). The test bans the
   first two.

## What was built

- `apps/web/src/lib/forumGuide.ts` — `buildForumGuide` (pure).
- `apps/web/src/app/(app)/f/[slug]/guide/page.tsx` — the page; numbered
  step cards styled by `.guide-steps` / `.guide-step*` in `globals.css`
  (tokens only).
- `calendarNavVisible` moved from the forum layout to
  `lib/calendarPerms.ts` so the sidebar and the guide share it.
- Tests: `forumGuide.test.ts` (role/setting gating, labels, policies, copy
  bans) and `guide/page.test.tsx` (jsdom render: sections become regions,
  steps link into the forum, unreadable forum 404s).

## Not done

- No per-forum custom guide text — admins can't add their own "how we do
  things here" paragraph yet. The natural next step if forums ask for it
  would be a markdown field in Forum Settings rendered under the summary.
- Not checked in a browser: this checkout has no Postgres/Docker or Clerk
  keys. `next build` compiled the route and the jsdom test renders it.
