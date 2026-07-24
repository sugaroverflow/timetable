# API image — also used by the App Platform `migrate` (PRE_DEPLOY) and
# `seed-sample-data` (POST_DEPLOY) jobs, which override run_command. The image
# mirrors the monorepo layout because the workspaces ship TypeScript sources
# (run via tsx) and seed-dev.ts resolves dev-sample-data.md from the repo root.
#
# Build from the repo root: docker build -f apps/api/Dockerfile .
# Requires BuildKit so apps/api/Dockerfile.dockerignore is honoured (the root
# .dockerignore is tuned for the web image and excludes packages/).

FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production

# Manifests only, so the npm ci layer is cached until the lockfile changes.
# apps/web/package.json is needed for npm ci to validate the workspace tree,
# but the web workspace's dependencies are not installed.
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/

# --include=dev: tsx and drizzle-kit live in devDependencies and are needed at
# run time (NODE_ENV=production would otherwise omit them).
RUN npm ci --include=dev \
  -w @timetable/shared -w @timetable/db -w @timetable/core -w @timetable/api

COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/core packages/core
COPY apps/api apps/api
COPY dev-sample-data.md ./

USER node
EXPOSE 4000
CMD ["npm", "run", "start", "-w", "@timetable/api"]
