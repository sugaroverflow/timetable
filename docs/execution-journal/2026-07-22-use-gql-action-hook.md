## 2026-07-22 - Web Consolidation: useGqlAction Mutation Hook

### Goal

Behavior-preserving consolidation of reuse audit finding #2: ~21 web
components hand-rolled the same choreography around `clientGql` mutations —
busy state, `try { await clientGql(...); toast(success); router.refresh() }
catch { toastError(err instanceof Error ? err.message : fallback) }` — with
the err-instanceof-Error extraction verbatim at ~18 sites.

### Changes

- `apps/web/src/lib/useGqlAction.ts`: `useGqlAction()` returns
  `{ run, busy }`. `run(query, variables, opts)` owns the whole sequence:
  re-entry guard while busy, the `clientGql` call, the component's success
  work (`onSuccess`, may be async — a throw there lands in the same error
  toast), the success toast (only when `success` is provided; string or
  `(data) => string`), `startTransition(() => router.refresh())` unless
  `refresh: false`, and the error-toast fallback. `busy` combines the
  in-flight await AND the transition pending state, so buttons stay
  disabled through the refresh (matching the previous useTransition users).
- 20 components converted, all success/error strings and disabled/refresh
  semantics unchanged: AdminTopicActions, AvailabilityControl,
  CommentActions, CommentComposer, CreateTopicForm, DigestSettingsForm,
  HeartButton, HeartsCutoffForm, HostTopicActions, MemberRolesEditor (only
  its `saveBio` GraphQL path — the REST roles save and the lazy bio read
  keep their own handling), ModerationCard, ProfileForm, SettingsForm,
  SlotAdminControls, SlotAdminForm, SlotDiscussion (post-then-refetch rides
  in an async `onSuccess` so both awaits share one catch),
  TimetableProfileForm (its second, sequential mutation rides in
  `onSuccess` so either failure hits the same toast and success only fires
  after both), TopicEditForm, TopicManager, WeekdayPatternControl (the
  optimistic day-cycle state stays outside the hook).
- Skipped: `UserPreview.tsx`. `UserPreviewStart` navigates
  (`router.push` + `refresh`) inside its transition rather than refreshing
  in place, and `UserPreviewExit` deliberately swallows mutation errors
  (clears the cookie first, `.catch(() => {})`) — forcing either through
  the hook would distort it.

Audit-debt markers checked after conversion: MemberRolesEditor (165 lines),
SettingsForm, TimetableProfileForm, TopicManager still exceed their budgets,
so their file-level disables stay on the burn-down list.

Net: −74 lines across components, +69 for the hook (−5 overall); the win is
one copy of the choreography instead of ~20.
