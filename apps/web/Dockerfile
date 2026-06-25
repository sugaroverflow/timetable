FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Standalone output mirrors the monorepo layout (outputFileTracingRoot = repo root).
# server.js lands at apps/web/server.js inside the image.
COPY --chown=nextjs:nodejs apps/web/.next/standalone ./
# Static and public assets must sit next to server.js (not included in standalone).
COPY --chown=nextjs:nodejs apps/web/.next/static ./apps/web/.next/static
COPY --chown=nextjs:nodejs apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
