# ADR-0003: Docker para desarrollo y CI; decisión de hosting diferida a H8

- **Estado:** Aceptada
- **Fecha:** 2026-09-15
- **Hito:** H0

## Contexto

El proyecto necesita PostgreSQL, una API y una web corriendo juntos, y que las pruebas de integración usen una base de datos **real** (no un doble), porque buena parte del riesgo está en migraciones, índices y restricciones.

Al mismo tiempo, el hosting todavía no se puede decidir con criterio: las capas gratuitas y los límites de Render, Railway, Fly.io, Vercel, Neon y Supabase cambian seguido, y la aplicación aún no tiene tráfico real ni datos que respaldar. Decidir ahora sería decidir con información que estará vencida cuando haga falta.

## Decisión

**Docker es el entorno de desarrollo y de CI desde el hito H0. La elección del proveedor de hosting se posterga hasta H8**, y hasta entonces **nada en el código se acopla a un proveedor**: toda la configuración entra por variables de entorno (12-factor).

- `docker-compose.yml` levanta `db`, `api` y `web` con un solo comando y recarga en caliente; Adminer y Mailpit quedan en un perfil opcional.
- `docker-compose.test.yml` levanta las **mismas imágenes de producción** que usará el despliegue, con la base de datos efímera y un servicio `migrate` de un solo uso que debe terminar bien antes de que arranque la API.
- Dockerfiles multi-stage (`pruner` → `deps` → `build` → `runtime`, más `dev` y `migrate`), con imágenes base fijadas por versión **y digest**, usuario sin privilegios, archivos de la aplicación de solo lectura y `HEALTHCHECK`.
- Las pruebas de integración usan **Testcontainers** con la misma versión de PostgreSQL que Compose, y aplican las migraciones versionadas con `prisma migrate deploy` (nunca `db push`).
- CI construye esas imágenes, las escanea con **Trivy** (bloquea vulnerabilidades críticas con corrección disponible) y verifica que el entorno completo levante y responda.

Criterios que se usarán en H8 para elegir proveedor, y que se registrarán en el ADR correspondiente: costo en capa gratuita vigente, soporte de imágenes Docker, región cercana a Perú, backups con restauración probada, facilidad de rollback y vistas previas por PR.

## Consecuencias

**Positivas**

- Paridad entre desarrollo, CI y (a futuro) producción: el mismo artefacto se construye y se prueba en los tres lugares.
- Un solo comando para empezar a trabajar, sin instalar PostgreSQL en la máquina.
- Las pruebas de integración corren contra PostgreSQL real, aisladas y reproducibles.
- La decisión de hosting se tomará con datos vigentes y sin reescribir código, porque no hay acoplamiento a ningún proveedor.

**Negativas y riesgos**

- Requiere Docker instalado y consume recursos en la máquina de desarrollo.
- Los builds son más lentos que un `pnpm dev` directo; se mitiga con `turbo prune`, caché del store de pnpm y capas cacheables. Queda `pnpm dev:local` para trabajar sin Docker.
- Hasta H8 no hay entorno desplegado: la verificación de cada hito es local y en CI, no en staging.
- Mantener las imágenes al día es trabajo recurrente; lo cubren Dependabot (Dockerfiles y Compose) y Trivy en CI.

## Alternativas consideradas

| Alternativa                                             | Por qué se descartó                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **PostgreSQL instalado en la máquina**                  | Distinto en cada equipo, difícil de reproducir en CI y de versionar.                                                |
| **SQLite en desarrollo y PostgreSQL en producción**     | Diferencias reales en tipos, restricciones y migraciones: los bugs aparecerían recién en producción.                |
| **Base de datos gestionada en la nube para desarrollo** | Dependencia de la red y de una capa gratuita, y datos personales fuera de la máquina desde el día 1.                |
| **Elegir el hosting ahora**                             | Las capas gratuitas cambian; decidir sin tráfico real ni necesidades de backup llevaría a una decisión mal fundada. |
