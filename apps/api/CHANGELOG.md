# @sol-a-sol/api

## 0.3.0

### Minor Changes

- e802237: Cierra el hito **H2 — Identidad**: la plataforma ya tiene dueño. El módulo `identity` queda **encendido** (`FEATURE_IDENTITY=true`) con registro, inicio de sesión, sesión renovable, segundo factor con códigos de recuperación, tokens personales para el celular, límite de intentos y bitácora de seguridad.

  Este cambio agrega además lo que faltaba para darlo por cerrado: **`helmet`** con las cabeceras de seguridad (incluida una política de contenido cerrada entera, `default-src 'none'`, que es lo exacto para algo que sirve JSON) y **CORS restringido** a `WEB_ORIGIN`, con credenciales y nunca `*`, porque la sesión viaja en una cookie.

  El aislamiento por usuario pasa a estar probado **endpoint por endpoint**: sin sesión, con una sesión inventada y con la sesión de otra cuenta. Se documentan los controles de OWASP ASVS nivel 1 que cubre el proyecto y los que faltan.

  La navegación de la web **no** muestra identidad todavía: el mismo flag enciende la API y el menú, y la pantalla de `/identity` no existe. El manifest vuelve al registro cuando la haya.

### Patch Changes

- 9c524bc: Ya se puede **cambiar la contraseña** con `POST /api/v1/auth/password`, que pide la actual y aplica a la nueva la misma política que el registro. Una contraseña actual equivocada responde 403, no 401, para que la web no cierre una sesión que sí vale.

  Al cambiarla, y también **al activar el segundo factor**, se cierran las sesiones de los demás navegadores y se conserva la desde la que se hizo el cambio. Los tokens personales **no se revocan**, para no romper en silencio la captura desde el celular: la respuesta trae cuántas sesiones se cerraron y la lista de tokens que siguen valiendo, para ofrecer revocarlos. El cambio queda en la bitácora como `password.changed`.

- 988bdb1: Ya se puede entrar: `POST /api/v1/auth/login` devuelve un token de acceso firmado con HS256 que vale **15 minutos**. La duración vive en `@sol-a-sol/domain` porque es una regla de negocio, y tanto `iat` como `exp` se calculan con el puerto `Clock`, así que una prueba fija el instante y comprueba la caducidad exacta sin esperar. El token lleva solo `sub`, `iat` y `exp`: un JWT va firmado pero no cifrado, y cualquiera que lo intercepte puede leerlo.

  Un correo desconocido y una contraseña equivocada responden **401 con el mismo cuerpo y cuestan lo mismo**: cuando el correo no existe se verifica contra un hash señuelo, calculado al arrancar a partir de una cadena aleatoria. Sin eso, ese caso no hashearía nada y respondería antes, y cronometrando las respuestas se podría averiguar qué correos tienen cuenta.

  El reloj del sistema pasa a ser un módulo global (`TimeModule`), que es el único sitio de la API donde se lee la hora real.

- 7e07708: Andamiaje del módulo `identity`, el primero de negocio, con sus cinco capas, su manifest en la web y su flag `FEATURE_IDENTITY` apagado. Se agregan dos tablas: `personal_access_tokens`, para que un dispositivo use la API sin la contraseña (se guarda solo el hash, con scopes, expiración y revocación, y se borran con la cuenta), y `audit_logs`, la bitácora de seguridad. La bitácora va **sin clave foránea** a propósito: una entrada de auditoría es un hecho inmutable y debe sobrevivir al borrado de quien lo provocó, así que borrar una cuenta no borra la evidencia de lo que hizo. Todavía no hay lógica: la ficha del módulo recoge las reglas decididas para el hito.
- 19e12e9: Ya se puede crear una cuenta: `POST /api/v1/auth/register`. Quién puede hacerlo lo decide `REGISTRATION_MODE`, que por defecto vale `closed` y solo deja pasar a la primera persona, que queda como dueña de la plataforma; también admite `invite`, con un código que se compara en tiempo constante, y `open`. Ante un valor desconocido cierra, para que un error de tipeo no abra el registro a internet.

  Cuando el registro no está permitido, la respuesta es un **404 idéntico al de una ruta que no existe**: un 403 o un mensaje propio confirmarían que el registro está ahí, solo que cerrado. La contraseña pasa por la política del dominio antes de gastarse en hashear, se guarda con argon2id, y la respuesta lleva solo el id, el correo y la fecha: nunca el hash.

  El guard de feature flags pasa a estar registrado globalmente, así que basta con marcar una ruta con `@RequiresFeature` para que responda 404 con el módulo apagado, sin tener que acordarse de un `@UseGuards` en cada controlador.

- ef3f190: Probar contraseñas contra la API deja de ser viable. Cinco fallos seguidos bloquean **un minuto**, y a partir de ahí cada fallo vuelve a bloquear doblando el tiempo: 2, 4, 8 y **15 minutos como tope**, para que nadie pueda dejar al dueño fuera de su cuenta indefinidamente. Se cuentan el correo y la IP **por separado**, y un código de segundo factor o de recuperación equivocado cuenta igual que una contraseña. Entrar bien borra el contador, y un día sin fallos también. El bloqueo responde 429 con `Retry-After`, y el correo se guarda hasheado para que la tabla no sea una lista de quién intentó entrar.

  Encima va un **tope de caudal por IP** (`@nestjs/throttler`): 120 peticiones por minuto, y 20 en `/auth`, donde cada petición cuesta un argon2id. Los health checks quedan fuera.

  Los **logs** pasan a JSON con `pino`, con `requestId`, `userId`, módulo y duración, y con la cabecera `Authorization` y las cookies enmascaradas. La **bitácora** registra ahora también los inicios de sesión, los fallidos y los bloqueos, y se conserva **un año**: una tarea diaria borra lo más viejo y los intentos ya olvidados.

- 50374ab: La API publica su contrato en `/api/v1/openapi.json`, un documento OpenAPI 3.0 que se arma con los **mismos esquemas Zod** con los que valida la entrada: la documentación no puede describir una cosa y el código aceptar otra. Una prueba comprueba además que toda ruta registrada aparezca en el documento, y que no se documente ninguna que no exista, así que añadir un endpoint y olvidar documentarlo deja de poder pasar en silencio.

  Las rutas de un módulo con su feature flag apagado **no aparecen**: describirlas confirmaría justo lo que su 404 se esfuerza en ocultar.

  No se usa `@nestjs/swagger`, que habría sumado unos 17 MB a la imagen de producción (sobre todo `swagger-ui-dist`) para servir documentación. Problem Details pasa a `@sol-a-sol/contracts`, donde ya estaba el resto de lo que viaja por HTTP, así que la web puede tipar los errores que recibe con el mismo esquema del que sale su descripción en el OpenAPI.

- 2439bcf: Las contraseñas ya tienen política y forma de guardarse. En el dominio, `assertPasswordIsStrong` exige **12 caracteres** y nada más —sin mayúsculas ni números obligatorios, siguiendo a NIST SP 800-63B, porque las reglas de composición empujan a patrones previsibles— y rechaza las contraseñas largas y previsibles de una lista embebida: recorridos de teclado, repeticiones y frases muy usadas. Las de las listas de filtraciones famosas no hacen falta, porque el mínimo de longitud ya las descarta. El error dice qué falta sin revelar la regla ni incluir nunca la contraseña.

  En la API, el puerto `PasswordHasher` y su adaptador **argon2id** con los parámetros de OWASP (19 MiB, 2 iteraciones, sin paralelismo). Una contraseña equivocada devuelve `false` en vez de lanzar, y un hash ilegible falla cerrado dejando aviso en el log, para que una cuenta que no puede entrar no se quede sin rastro del motivo.

- 0ea4677: Ya se pueden crear **tokens personales**, para que el celular mande capturas sin la contraseña ni una sesión de navegador. `POST /api/v1/tokens` crea uno y lo muestra **una sola vez**: en la base queda solo el hash de su secreto. `GET /api/v1/tokens` los lista sin su valor, y `DELETE /api/v1/tokens/:id` lo revoca en el acto; el token de otra cuenta responde 404, igual que uno que no existe.

  Un token **siempre caduca**, entre 1 y 365 días (90 si no se indica), y lleva **scopes mínimos**: hoy solo `captures:write`. Solo entra en las rutas marcadas con `@AcceptsPersonalAccessToken`; en cualquier otra recibe 403, así que el token del celular no puede listar tokens, crear otros ni tocar el segundo factor. Uno revocado o caducado responde 401.

  El token (`sas_pat_…`) lleva dentro el id de su fila: se busca por clave primaria y el hash se compara en tiempo constante. La creación, la revocación, cada uso y cada rechazo quedan en la bitácora con su IP y user agent, y `lastUsedAt` dice si un token sigue en uso.

- 69f4901: Toda la API responde ya sus errores en Problem Details (RFC 9457), con `Content-Type: application/problem+json`. El `type` es un URN estable (`urn:sol-a-sol:error:invalid-amount`) y el `code` viaja en el cuerpo para que la web arme el mensaje en español; `title` y `detail` quedan en inglés, para quien depura. Un error de validación responde 422 con un elemento de `errors[]` por campo (`field`, `code`, `message`), un error de dominio responde con su código estable, y cualquier fallo inesperado responde un 500 genérico que no filtra nada del sistema, con el detalle real solo en el log.

  Nace también `@sol-a-sol/contracts`, con los esquemas Zod que comparten la API y la web, empezando por registro e inicio de sesión. Describen la forma del mensaje, no las reglas de negocio: la política de contraseñas se queda en `@sol-a-sol/domain`, para que no acabe definida en dos sitios que un día dejen de coincidir.

- bad95a1: El segundo factor ya tiene red de seguridad. Al activarlo se entregan **diez códigos de recuperación**, mostrados una sola vez; después solo queda su hash. Cada uno sirve una vez y en el inicio de sesión se usan **en lugar** del código del teléfono, así que perderlo deja de significar perder la cuenta.

  Están pensados para copiarse a mano de un papel: alfabeto base32 de Crockford —sin `I`, `L`, `O` ni `U`, que se confunden con `1`, `0` y otras— en grupos de cuatro, y se aceptan tecleados sin guiones, con espacios o en minúsculas. Doce símbolos son unos 60 bits, que no se adivinan probando.

  `POST /api/v1/auth/2fa/recovery-codes` los rehace e invalida los anteriores, y exige un código de la aplicación de autenticación, igual que desactivar el segundo factor: quien pille una sesión abierta un momento no puede llevarse diez llaves nuevas. Desactivar el segundo factor los borra.

- 48b352e: La sesión ya se sostiene sola: `POST /api/v1/auth/refresh` y `POST /api/v1/auth/logout`. El refresco viaja en una cookie `HttpOnly`, `Secure` y `SameSite=Strict`, limitada a `/api/v1/auth`, y dura **30 días deslizantes**: cada uso emite uno nuevo con otros treinta por delante, así que quien entra a diario no vuelve a escribir la contraseña.

  Cada renovación **invalida el refresco anterior**. Si llega uno ya canjeado, alguien lo copió: como no hay forma de saber si quien lo presenta es la víctima o el ladrón, se cierran **todas** las sesiones de la cuenta y queda registrado en `audit_logs`. Dos pestañas renovando a la vez caen en ese mismo camino, y por eso el `UPDATE` que marca el token lleva dentro la condición de que siga sin usar: solo una gana la carrera.

  Cerrar sesión responde 204 valga la cookie o no, para no delatar si un token que alguien probó existe, y solo cierra esa sesión. Los refrescos se guardan hasheados con SHA-256 —no argon2id, que es lento a propósito para secretos que se pueden adivinar, y estos son 256 bits aleatorios que además hay que poder buscar en un índice.

- 1fa7fbc: Ya se puede activar un segundo factor con cualquier aplicación de autenticación. La activación va en dos pasos: `POST /api/v1/auth/2fa/setup` devuelve el `otpauth://` **una sola vez**, y el factor no queda activo hasta que `2fa/verify` lo confirma con un código, así que escanear mal el QR no deja la cuenta inaccesible. `2fa/disable` lo quita, y exige un código válido porque es una rebaja de seguridad; activar y desactivar quedan en la bitácora.

  Se acepta un periodo de treinta segundos a cada lado, para que un reloj ligeramente desfasado no impida entrar, y **un código sirve una sola vez**: se guarda el último periodo usado, así que quien lo vea por encima del hombro no puede aprovechar los segundos que le queden. Qué contadores se aceptan lo decide el dominio y no la librería, de modo que la ventana se prueba con reloj fijo.

  El secreto se guarda **cifrado** con AES-256-GCM y una clave propia, `AUTH_TOTP_ENCRYPTION_KEY`, no la de los JWT: rotar aquella dejaría ilegibles todos los secretos y a sus dueños fuera de su cuenta. Entra además el guard del token de acceso, que expone el `userId` a la ruta y es la base del aislamiento por usuario que completa la tarea de cierre.

- Updated dependencies [9c524bc]
- Updated dependencies [988bdb1]
- Updated dependencies [19e12e9]
- Updated dependencies [ef3f190]
- Updated dependencies [50374ab]
- Updated dependencies [2439bcf]
- Updated dependencies [0ea4677]
- Updated dependencies [69f4901]
- Updated dependencies [bad95a1]
- Updated dependencies [48b352e]
- Updated dependencies [1fa7fbc]
  - @sol-a-sol/contracts@0.3.0
  - @sol-a-sol/domain@0.3.0

## 0.2.0

### Minor Changes

- Hito H1 — Dominio base: paquete `@sol-a-sol/domain`, puro y sin dependencias, construido con TDD y con cobertura y mutation score al 100 %: `Money` con aritmética decimal exacta, redondeo bancario al presentar o persistir, reparto de cuotas sin perder céntimos y error al mezclar monedas; `parseAmount` y `findAmountInText` para leer montos escritos como texto (formato peruano, sin adivinar); `LocalDate` para fechas de negocio sin hora, con días de corte que no existen en el mes; y el puerto `Clock`, que saca `new Date()` de la lógica. Además, feature flags por módulo en la API (un módulo incompleto llega a `main` apagado y responde 404), navegación de la web armada leyendo los manifests de cada funcionalidad, y el generador `pnpm gen:module`, que crea y registra un módulo nuevo con sus cinco capas.

### Patch Changes

- 25b3d0f: La imagen de producción de la API ya no lleva la CLI de Prisma. `@prisma/client` declara `prisma` y `typescript` como peers opcionales, y pnpm los resolvía por estar en el workspace, así que `deploy --prod` los copiaba junto con `@prisma/engines`, `@prisma/studio-core` y `@electric-sql/pglite`: unos 190 MB y dos vulnerabilidades HIGH en código que nunca se ejecuta. Con `--no-optional`, la imagen solo contiene lo que la API usa en runtime (el cliente generado y `@prisma/adapter-pg`): `node_modules` baja de 362 MB a 98 MB y la imagen de 865 MB a 523 MB.
- 41faf4f: Feature flags por módulo y navegación que se arma sola. En la API, `FeatureFlagsService` y el guard `@RequiresFeature` dejan integrar un módulo incompleto a `main` sin exponerlo: solo se activa con el valor exacto `true` en su variable (`FEATURE_BUDGETING`), y una ruta apagada responde 404 para no revelar que existe. En la web, cada funcionalidad declara un manifest (`id`, `título`, `ruta`, `icono` y flag) y la barra de secciones se construye leyendo el registro, así que un módulo nuevo aparece sin editar el layout.
- 0d35d9a: Cada versión publica ya sus imágenes de producción en GHCR (`ghcr.io/andrewsthephen23/sol-a-sol-api` y `…-web`), con las etiquetas `X.Y.Z` y `sha-<commit>`, enlazadas en las notas del GitHub Release. Son las mismas imágenes que construye `docker-compose.test.yml`, y no se sube ninguna hasta que pasan el bloqueo de Trivy y un smoke test que las arranca de verdad. Un push a `main` sin versión nueva no publica nada.

## 0.1.0

### Minor Changes

- e6c922b: Hito H0 — Cimientos: monorepo con TypeScript estricto y configuraciones compartidas; hooks de Git (commitlint, lint-staged, gitleaks); API NestJS con `/health` y `/health/ready`; web Next.js; Prisma con el modelo `User` y su primera migración; imágenes Docker multi-stage y Docker Compose; pipelines de CI y seguridad (CodeQL, gitleaks, pnpm audit, Trivy); SonarQube Cloud, plantillas, protección de `main` y ADRs 0001–0003.
