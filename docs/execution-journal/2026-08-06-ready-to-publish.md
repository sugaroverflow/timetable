# 2026-08-06 — "Ready to publish": hosts signal, the queue filters

Ed (admin) couldn't tell which pending topics were actually awaiting
publication vs still being drafted — since draft status was removed
(product feedback round 1), every not-yet-published topic sits in the
moderation queue looking identical.

The fix is a readiness *signal*, not a status: a nullable `ready_at`
timestamp on topics (migration 0031, with a backfill marking every
currently-submitted topic ready so the queue doesn't silently empty on
deploy day). The status machine is untouched — admins can still publish
anything at any time; readiness only shapes what surfaces first.

- **Hosts**: a "Ready to publish" switch (instant-save `ReadySwitch`)
  replaces the old "Pending review…" note on submitted topics in My
  Topics. It stays visible while editing (TopicEditScope keeps the
  controls row mounted under the form). Hidden in hosts-publish-directly
  forums, where there's no queue to signal. Resubmitting an unpublished
  topic counts as the signal (`submitTopic` sets `readyAt`); publish,
  reject, and unpublish all clear it.
- **Admins**: Pending Topics gains a `?show=` filter (`ReadyFilter`)
  defaulting to **Ready to publish**, with Still drafting / All views and
  counts in the option labels. Cards carry a ready/drafting badge (new
  `.status-ready` / `.status-drafting` classes) that earns its keep in
  the All view. Tailored empty states say what the other view holds.
- **Sidebar badge**: the Pending Topics unread count now counts only
  ready topics, so the number always agrees with the default view.
- **Plumbing**: `setTopicReady` in core (logs `topic.ready` /
  `topic.unready`, both mapped in `activityLabels`), `setTopicReady`
  GraphQL mutation guarded by `canEditTopic` (owning host or admin,
  submitted topics only), `readyAt` exposed on `ManagedTopic`.
- **Seed**: topic fixtures accept `Ready to publish: yes`; topic-reform
  and topic-serious-games are ready, the other two submitted examples
  exercise the still-drafting view.

Verified by migrating + seeding a throwaway Postgres 16 (2 ready / 2
drafting land correctly) and four new integration tests around the
mutation's permissions and status guard.
