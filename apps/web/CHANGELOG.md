# @sol-a-sol/web

## 0.3.0

### Minor Changes

- e802237: Cierra el hito **H2 — Identidad**: la plataforma ya tiene dueño. El módulo `identity` queda **encendido** (`FEATURE_IDENTITY=true`) con registro, inicio de sesión, sesión renovable, segundo factor con códigos de recuperación, tokens personales para el celular, límite de intentos y bitácora de seguridad.

  Este cambio agrega además lo que faltaba para darlo por cerrado: **`helmet`** con las cabeceras de seguridad (incluida una política de contenido cerrada entera, `default-src 'none'`, que es lo exacto para algo que sirve JSON) y **CORS restringido** a `WEB_ORIGIN`, con credenciales y nunca `*`, porque la sesión viaja en una cookie.

  El aislamiento por usuario pasa a estar probado **endpoint por endpoint**: sin sesión, con una sesión inventada y con la sesión de otra cuenta. Se documentan los controles de OWASP ASVS nivel 1 que cubre el proyecto y los que faltan.

  La navegación de la web **no** muestra identidad todavía: el mismo flag enciende la API y el menú, y la pantalla de `/identity` no existe. El manifest vuelve al registro cuando la haya.

### Patch Changes

- 7e07708: Andamiaje del módulo `identity`, el primero de negocio, con sus cinco capas, su manifest en la web y su flag `FEATURE_IDENTITY` apagado. Se agregan dos tablas: `personal_access_tokens`, para que un dispositivo use la API sin la contraseña (se guarda solo el hash, con scopes, expiración y revocación, y se borran con la cuenta), y `audit_logs`, la bitácora de seguridad. La bitácora va **sin clave foránea** a propósito: una entrada de auditoría es un hecho inmutable y debe sobrevivir al borrado de quien lo provocó, así que borrar una cuenta no borra la evidencia de lo que hizo. Todavía no hay lógica: la ficha del módulo recoge las reglas decididas para el hito.

## 0.2.0

### Minor Changes

- Hito H1 — Dominio base: paquete `@sol-a-sol/domain`, puro y sin dependencias, construido con TDD y con cobertura y mutation score al 100 %: `Money` con aritmética decimal exacta, redondeo bancario al presentar o persistir, reparto de cuotas sin perder céntimos y error al mezclar monedas; `parseAmount` y `findAmountInText` para leer montos escritos como texto (formato peruano, sin adivinar); `LocalDate` para fechas de negocio sin hora, con días de corte que no existen en el mes; y el puerto `Clock`, que saca `new Date()` de la lógica. Además, feature flags por módulo en la API (un módulo incompleto llega a `main` apagado y responde 404), navegación de la web armada leyendo los manifests de cada funcionalidad, y el generador `pnpm gen:module`, que crea y registra un módulo nuevo con sus cinco capas.

### Patch Changes

- 41faf4f: Feature flags por módulo y navegación que se arma sola. En la API, `FeatureFlagsService` y el guard `@RequiresFeature` dejan integrar un módulo incompleto a `main` sin exponerlo: solo se activa con el valor exacto `true` en su variable (`FEATURE_BUDGETING`), y una ruta apagada responde 404 para no revelar que existe. En la web, cada funcionalidad declara un manifest (`id`, `título`, `ruta`, `icono` y flag) y la barra de secciones se construye leyendo el registro, así que un módulo nuevo aparece sin editar el layout.
- 0d35d9a: Cada versión publica ya sus imágenes de producción en GHCR (`ghcr.io/andrewsthephen23/sol-a-sol-api` y `…-web`), con las etiquetas `X.Y.Z` y `sha-<commit>`, enlazadas en las notas del GitHub Release. Son las mismas imágenes que construye `docker-compose.test.yml`, y no se sube ninguna hasta que pasan el bloqueo de Trivy y un smoke test que las arranca de verdad. Un push a `main` sin versión nueva no publica nada.

## 0.1.0

### Minor Changes

- e6c922b: Hito H0 — Cimientos: monorepo con TypeScript estricto y configuraciones compartidas; hooks de Git (commitlint, lint-staged, gitleaks); API NestJS con `/health` y `/health/ready`; web Next.js; Prisma con el modelo `User` y su primera migración; imágenes Docker multi-stage y Docker Compose; pipelines de CI y seguridad (CodeQL, gitleaks, pnpm audit, Trivy); SonarQube Cloud, plantillas, protección de `main` y ADRs 0001–0003.
