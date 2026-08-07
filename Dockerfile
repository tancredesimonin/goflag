# The website, and only the website. `packages/cli` ships to npm from the
# `release` job and has no business in a container image — the filtered install
# below is what keeps its dependency tree (Chromium among them) out of here.
FROM node:24.18.1-alpine AS base

FROM base AS builder
WORKDIR /app

# Baked into the build, not read at runtime: canonicals, hreflang, OG tags and
# the Plausible script URL are all decided when Next compiles. This is why the
# production and develop images are different builds rather than one image with
# two environments.
ARG NEXT_PUBLIC_WEBSITE_FRONTEND_URL
ENV NEXT_PUBLIC_WEBSITE_FRONTEND_URL=$NEXT_PUBLIC_WEBSITE_FRONTEND_URL
ARG NEXT_PUBLIC_PLAUSIBLE_SRC
ENV NEXT_PUBLIC_PLAUSIBLE_SRC=$NEXT_PUBLIC_PLAUSIBLE_SRC
ARG APP_ENV
ENV APP_ENV=$APP_ENV

COPY . .

# `@goflag/website...` is the package and its workspace dependencies. Without
# the filter, `pnpm install` also resolves `packages/cli` — whose devDeps pull
# Playwright and a browser download into an image that will never run a test.
#
# The same suffix on `build`, and for a reason the install line did not have:
# the site resolves `@goflag/next` through its built `dist`, which nothing in
# this image would otherwise produce. `...` makes pnpm build the dependency
# first, in topological order.
RUN corepack enable pnpm \
  && pnpm install --frozen-lockfile --filter "@goflag/website..." \
  && pnpm --filter "@goflag/website..." build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# The workspace root is Next's file-tracing root, so `standalone/` reproduces
# the monorepo layout: `apps/website/server.js`, a pruned `node_modules/`, and
# `packages/cli/CHANGELOG.md` — which the changelog page reads by path. Copying
# the tree wholesale is what keeps that relative read working.
COPY --from=builder --chown=nextjs:nodejs /app/apps/website/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/website/.next/static ./apps/website/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# server.js chdirs into its own directory, so the changelog's
# `../../packages/cli/CHANGELOG.md` resolves regardless of where node is invoked.
CMD ["node", "apps/website/server.js"]
