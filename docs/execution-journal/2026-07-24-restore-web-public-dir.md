# 2026-07-24 - Restore apps/web/public (Deploy Dev Broken)

## What happened

The domain cutover (#95) removed the last file under `apps/web/public/`
(the old unreferenced logo asset), so git dropped the now-empty directory.
The web Dockerfile does `COPY apps/web/public ./apps/web/public`, which
fails with "not found" when the directory is absent — every Deploy Dev run
since 13:26 UTC failed at the image build step, so merges (including the
settings/feed polish in #103) stopped reaching dev.

## Fix

`apps/web/public/.gitkeep` keeps the directory in git, with a comment
explaining why it must exist. Alternative considered: dropping the COPY
line — rejected because any future public asset would then silently not
ship.
