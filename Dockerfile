# One image for Hold's web app (tech-stack.md section 12). Built by .github/workflows/deploy.yml and pushed to the
# hold-app repository in ECR. It holds no secret: every setting comes from the environment it runs in, and the
# cookie key and database login from Secrets Manager.
#
# Both stages start from the same node:24-slim, pinned by digest (the multi-platform index, read 4 November 2026), so a
# rebuild gets the base it was tested on and a new base arrives only by a change here. To move it, read the current
# digest with `docker buildx imagetools inspect node:24-slim` and replace it in both lines.

FROM node:24-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS build
WORKDIR /repo
RUN corepack enable
# Installed first, from the manifests alone, so a change to the code does not repeat the install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY eval/package.json eval/
COPY infra/package.json infra/
COPY packages packages
RUN pnpm install --frozen-lockfile
COPY . .
RUN HOLD_STANDALONE=1 pnpm --filter @hold/web run build

FROM node:24-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 NEXT_TELEMETRY_DISABLED=1
# The Debian packages under Node get their security fixes between Node releases, so the image that runs takes them at
# build time rather than waiting for the next base.
RUN apt-get update && apt-get upgrade -y --no-install-recommends && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
COPY --from=build --chown=node:node /repo/apps/web/serve.ts ./apps/web/serve.ts
USER node
EXPOSE 3000
# serve.ts, not the generated server.js: see the comment at its top.
CMD ["node", "apps/web/serve.ts"]
