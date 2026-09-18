# syntax=docker/dockerfile:1

# Las imágenes base se fijan por versión y digest directamente en cada FROM
# (Dependabot no puede actualizar imágenes declaradas mediante ARG).

# ---------------------------------------------------------------------------
# base: pnpm (vía corepack, versión de `packageManager`) y usuario sin privilegios
# ---------------------------------------------------------------------------
FROM node:24.21.0-trixie-slim@sha256:db3ae80f5d8df06e04dabdf7b44cbf008d32de168205fa0294444aabbc08c590 AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable \
 && mkdir /repo && chown node:node /repo
USER node
WORKDIR /repo

# ---------------------------------------------------------------------------
# pruner: subconjunto del monorepo que necesita la API (turbo prune)
# ---------------------------------------------------------------------------
FROM base AS pruner
COPY --chown=node:node . .
RUN pnpm dlx turbo@2.10.13 prune @sol-a-sol/api --docker

# ---------------------------------------------------------------------------
# deps: instala dependencias solo a partir de manifiestos y lockfile (capa cacheable)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY --from=pruner --chown=node:node /repo/out/json/ .
RUN --mount=type=cache,id=sol-a-sol-pnpm-store,target=/home/node/.pnpm-store,uid=1000,gid=1000 \
    pnpm install --frozen-lockfile --store-dir /home/node/.pnpm-store

# ---------------------------------------------------------------------------
# dev: código completo; docker-compose.yml monta src/ y prisma/ para hot reload
# ---------------------------------------------------------------------------
FROM deps AS dev
COPY --from=pruner --chown=node:node /repo/out/full/ .
WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["pnpm", "exec", "nest", "start", "--watch"]

# ---------------------------------------------------------------------------
# build: compila y arma un directorio solo con dependencias de producción
# ---------------------------------------------------------------------------
FROM deps AS build
COPY --from=pruner --chown=node:node /repo/out/full/ .
# `--no-optional` deja fuera las dependencias opcionales. Aquí son solo peers opcionales de
# desarrollo: `@prisma/client` declara `prisma` (la CLI) y `typescript`, y pnpm los resuelve porque
# existen en el workspace, aunque en runtime la API solo use el cliente generado y `@prisma/adapter-pg`.
# Sin ellos `node_modules` baja de 362 MB a ~98 MB y desaparecen vulnerabilidades de código que
# nunca se ejecuta (issue #6). Si algún día una dependencia de producción necesitara una opcional
# real (un binario nativo), habría que instalarla aparte; lo detecta el smoke test de
# `docker-compose.test.yml`, que arranca esta misma imagen.
RUN pnpm turbo run build --filter=@sol-a-sol/api \
 && pnpm --filter @sol-a-sol/api deploy --prod --no-optional /repo/deploy

# ---------------------------------------------------------------------------
# migrate: aplica migraciones versionadas (`prisma migrate deploy`). Contenedor de un solo uso.
# ---------------------------------------------------------------------------
FROM build AS migrate
WORKDIR /repo/apps/api
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# runtime: imagen final mínima. Archivos de root (solo lectura para `node`).
# ---------------------------------------------------------------------------
FROM node:24.21.0-trixie-slim@sha256:db3ae80f5d8df06e04dabdf7b44cbf008d32de168205fa0294444aabbc08c590 AS runtime
ENV NODE_ENV=production \
    PORT=3001
# Parches de seguridad del sistema base y fuera npm/corepack: no se usan en runtime
# y sus dependencias empaquetadas arrastran vulnerabilidades (detectadas por Trivy).
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
WORKDIR /app
COPY --from=build /repo/deploy/package.json ./package.json
COPY --from=build /repo/deploy/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3001) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/main.js"]
