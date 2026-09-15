# syntax=docker/dockerfile:1

# Imagen base fijada por versión y digest (reproducible). Actualizar ambos juntos.
ARG NODE_IMAGE=node:24.21.0-trixie-slim@sha256:db3ae80f5d8df06e04dabdf7b44cbf008d32de168205fa0294444aabbc08c590

# ---------------------------------------------------------------------------
# base: pnpm (vía corepack, versión de `packageManager`) y usuario sin privilegios
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable \
 && mkdir /repo && chown node:node /repo
USER node
WORKDIR /repo

# ---------------------------------------------------------------------------
# pruner: subconjunto del monorepo que necesita la web (turbo prune)
# ---------------------------------------------------------------------------
FROM base AS pruner
COPY --chown=node:node . .
RUN pnpm dlx turbo@2.10.13 prune @sol-a-sol/web --docker

# ---------------------------------------------------------------------------
# deps: instala dependencias solo a partir de manifiestos y lockfile (capa cacheable)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY --from=pruner --chown=node:node /repo/out/json/ .
RUN --mount=type=cache,id=sol-a-sol-pnpm-store,target=/home/node/.pnpm-store,uid=1000,gid=1000 \
    pnpm install --frozen-lockfile --store-dir /home/node/.pnpm-store

# ---------------------------------------------------------------------------
# dev: código completo; docker-compose.yml monta src/ para hot reload
# ---------------------------------------------------------------------------
FROM deps AS dev
COPY --from=pruner --chown=node:node /repo/out/full/ .
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["pnpm", "exec", "next", "dev", "--port", "3000", "--hostname", "0.0.0.0"]

# ---------------------------------------------------------------------------
# build: `next build` con output standalone
# ---------------------------------------------------------------------------
FROM deps AS build
COPY --from=pruner --chown=node:node /repo/out/full/ .
RUN pnpm turbo run build --filter=@sol-a-sol/web

# ---------------------------------------------------------------------------
# runtime: servidor standalone de Next.js. Archivos de root salvo la caché de Next.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Parches de seguridad del sistema base y fuera npm/corepack: no se usan en runtime
# y sus dependencias empaquetadas arrastran vulnerabilidades (detectadas por Trivy).
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
RUN mkdir -p apps/web/.next/cache && chown node:node apps/web/.next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3000) + '/').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
