# Queue Next wedged after one click — the real fix (second attempt)

Ed re-reported the "Next only works once" queue bug after #179 (which
keyed the queue's TopicCard by topic id) was already live on dev.

## Reproduction, not theory

Scripted Playwright repro against hosted dev as seeded `host-eli`
(sign-in via Clerk test OTP): click Next → the card **advances** ("5 of
65" → "6 of 65", new title) but the *new* card's Next button renders
`disabled`. Conclusion: **a `key` on a server component does not remount
the client components inside it across `router.refresh()`** — React
reconciles the refreshed RSC payload in place, so QueueControls kept the
previous topic's `busy=true` (and stale `hearted`) state. #179's fix
never took effect at runtime.

## Fix (in QueueControls itself, remount-independent)

- **Render-phase per-topic reset** — the React "derive state from props"
  pattern: when the `topicId` prop changes, reset `hearted` and the
  in-flight flag during render. Works whether or not React remounts.
- **Transition-aware busy**: `busy = inFlight || isPending`, with
  `startTransition(() => router.refresh())` — even a reconciled-in-place
  update re-enables the controls when the refreshed data lands.
  QueueRestartButton got the same treatment.
- The TopicCard `key` stays (harmless, still useful on ordinary
  navigations) with a corrected comment.

Post-deploy verification: the same repro script (scratchpad
`qa-queue-next.mjs`) clicking Next 4× consecutively.
