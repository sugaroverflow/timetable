FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output includes everything needed to run (server.js + minimal node_modules + traced packages)
COPY apps/web/.next/standalone ./
# Static assets must be copied separately (not included in standalone)
COPY apps/web/.next/static ./.next/static
# Public assets
COPY apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "server.js"]
