# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Strata container image.
#
# Three stages so the runtime image carries only what it needs: no toolchain,
# no dev dependencies, and no source. Next.js standalone output means the
# runtime stage does not install node_modules at all.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# EOD_BUNDLE_URL, when set, makes the prebuild step pull the current dataset so
# it is baked into the image. Unset, the build succeeds and the app falls back
# to demo data.
ARG EOD_BUNDLE_URL=""
ENV EOD_BUNDLE_URL=$EOD_BUNDLE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run unprivileged.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# The end-of-day dataset, if the build pulled one. `data/` always exists, so
# this copy is safe either way.
COPY --from=build /app/data ./data

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
