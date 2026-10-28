# One image for Hold's web app (tech-stack.md section 12). Built by .github/workflows/deploy.yml and pushed to the
# hold-app repository in ECR. It holds no secret: every setting comes from the environment it runs in, and the
# cookie key and database login from Secrets Manager.

FROM node:24-slim AS build
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

FROM node:24-slim AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
COPY --from=build --chown=node:node /repo/apps/web/serve.ts ./apps/web/serve.ts
USER node
EXPOSE 3000
# serve.ts, not the generated server.js: see the comment at its top.
CMD ["node", "apps/web/serve.ts"]
