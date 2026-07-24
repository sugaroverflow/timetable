# 2026-07-24 - Prod Uploads Move to a Standard Bucket (Cold-Storage Discovery)

## Goal

Unblock the last CLI-adjacent item on the launch checklist (issue #93 step 2):
CORS on the production uploads bucket, needed for browser direct uploads from
topic.forum.

## What we found

While setting CORS in the DO console, Fatima found the production `timetable`
bucket (lon1) has **no CORS section at all** — it is a **cold-storage** Space.
That storage class explains the long-standing mystery where every client's
`PutBucketCors` returned `501 NotImplemented` (previously written off as a
bucket-specific quirk, and the reason dev moved to `timetable-dev`). Cold
storage also requires signed requests, so the app's `public-read` image URLs
would never have served, and the class cannot be changed after creation.
Production uploads were unshippable on that bucket regardless of CORS.

## Changes

- Fatima created a new **standard-class** bucket `topicforum` (lon1) in the
  console (cold storage cannot be converted, and `CopyObject` between classes
  is unsupported — irrelevant here since launch starts from a wiped DB, so
  there is nothing to migrate).
- `.do/app.yaml`: production `SPACES_BUCKET` now `topicforum`. Takes effect at
  the next (human-triggered) production deploy, i.e. the launch deploy.
- `scripts/configure-spaces-cors.sh`: default bucket is now `topicforum` and
  the default origins lead with `https://topic.forum` (old timetable.love
  origins kept for the transition window).
- `docs/DEPLOYMENT.md` + `.env.example`: bucket table, examples, and the CORS
  story updated to the cold-storage explanation.

## Follow-ups

- Run `scripts/configure-spaces-cors.sh` against `topicforum` (works now —
  standard buckets accept `setcors`), and confirm the production `SPACES_KEY`
  is account-scoped, not scoped to the old bucket.
- Post-launch cleanup: delete the cold-storage `timetable` bucket alongside
  the timetable.love domain decision.
