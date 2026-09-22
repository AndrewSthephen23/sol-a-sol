# Checklist OWASP ASVS — nivel 1

> Qué cubre el proyecto de los controles del **OWASP Application Security Verification Standard, nivel 1** (el mínimo, aplicable a cualquier aplicación), y qué falta.
>
> Se actualiza al cerrar cada hito. Estado al **cierre de H2** (versión 0.3.0).
>
> Los identificadores son los de **ASVS 4.0.3**, que es la numeración con la que se escribió esta ficha; al auditar de verdad conviene contrastarlos con el documento oficial de la versión que se use, porque la numeración cambió en la 5.0.

**Leyenda:** ✅ cubierto · 🟡 parcial · ⏳ pendiente (con dónde se resuelve) · ➖ no aplica todavía.

## V2 · Autenticación

| Control                               | Cómo se cubre                                                                                                         | Estado                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Longitud mínima de contraseña (12)    | `assertPasswordIsStrong` en `@sol-a-sol/domain`: 12 caracteres, contados como grafemas                                | ✅                                    |
| Sin reglas de composición             | Criterio de NIST SP 800-63B: manda la longitud                                                                        | ✅                                    |
| Contraseñas filtradas rechazadas      | Lista embebida en el repositorio (el dominio no puede salir a la red)                                                 | ✅                                    |
| Almacenamiento con hash lento         | **argon2id**, 19 456 KiB / 2 iteraciones / 1 hilo (hoja de OWASP). Parámetros dentro del propio hash (PHC)            | ✅                                    |
| Cambio de contraseña pide la actual   | `POST /auth/password`; cierra las demás sesiones                                                                      | ✅                                    |
| Anti-automatización en el login       | Bloqueo progresivo (5 → 1, 2, 4, 8, 15 min) por correo y por IP, más tope de caudal por IP (20/min en `/auth`)        | ✅                                    |
| Respuestas que no enumeran cuentas    | Correo desconocido y contraseña equivocada dan **el mismo 401**, con hash señuelo para que además **tarden lo mismo** | ✅                                    |
| Segundo factor (TOTP)                 | RFC 6238, opcional, con ventana de un periodo y un solo uso por código                                                | ✅                                    |
| Códigos de recuperación               | Diez, de un solo uso, mostrados una vez y guardados hasheados                                                         | ✅                                    |
| Secretos del 2FA cifrados             | AES-256-GCM con clave propia (`AUTH_TOTP_ENCRYPTION_KEY`)                                                             | ✅                                    |
| Verificación de correo y recuperación | Pospuestas en H2 a propósito: con el registro cerrado no protegen de nada. **Limitación conocida**                    | ⏳ se reevalúa si el registro se abre |

## V3 · Gestión de sesiones

| Control                                  | Cómo se cubre                                                                                  | Estado |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- | ------ |
| Token de sesión aleatorio y fuerte       | Refresco de 256 bits de `randomBytes`; guardado solo su SHA-256                                | ✅     |
| Vida corta del token de acceso           | JWT HS256 de **15 minutos**, con `iat`/`exp` calculados con el puerto `Clock`                  | ✅     |
| Renovación con rotación                  | Cada refresco se canjea una vez; el reuso cierra **todas** las sesiones y queda en la bitácora | ✅     |
| Cierre de sesión efectivo                | `POST /auth/logout` revoca ese refresco y borra la cookie                                      | ✅     |
| Cookie con atributos seguros             | `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/v1/auth`                                   | ✅     |
| Cambio de credenciales cierra sesiones   | Cambiar la contraseña o activar 2FA revoca las demás sesiones                                  | ✅     |
| Revocación inmediata del token de acceso | Los JWT ya emitidos valen hasta 15 min; no hay lista de revocados. **Limitación documentada**  | 🟡     |

## V4 · Control de acceso

| Control                                                | Cómo se cubre                                                                                          | Estado |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------ |
| Denegar por defecto                                    | `AccessTokenGuard` en toda ruta protegida; sin credencial, 401                                         | ✅     |
| El identificador viene del token                       | `@CurrentUser()`; si falta el guard, lanza en vez de consultar sin filtrar                             | ✅     |
| Aislamiento por usuario (IDOR)                         | Los repositorios exigen `userId`, que viaja **dentro** del `WHERE`/`UPDATE`                            | ✅     |
| Verificado con pruebas                                 | `test/identity/access-isolation.spec.ts`: cada endpoint, sin sesión y con la de otra cuenta            | ✅     |
| Privilegio mínimo de las credenciales                  | Los tokens personales solo entran donde diga `@AcceptsPersonalAccessToken`, y con su scope; si no, 403 | ✅     |
| Decisiones de seguridad no controladas por quien llama | El tope de caudal se elige por metadata del controller, no por el texto de la URL                      | ✅     |

## V5 · Validación y saneamiento

| Control                           | Cómo se cubre                                                                            | Estado |
| --------------------------------- | ---------------------------------------------------------------------------------------- | ------ |
| Validación de entrada por esquema | Zod de `@sol-a-sol/contracts` en cada cuerpo; la política de negocio queda en el dominio | ✅     |
| Consultas parametrizadas          | Prisma; no se concatena SQL                                                              | ✅     |
| Tamaños máximos                   | Correo 254, contraseña 256 (defensivo: argon2id gasta memoria a propósito)               | ✅     |

## V7 · Errores y bitácora

| Control                                 | Cómo se cubre                                                                                      | Estado |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ |
| Sin detalles internos en los errores    | Problem Details (RFC 9457); un error inesperado responde 500 genérico y el detalle queda en el log | ✅     |
| Eventos de seguridad registrados        | Login (éxito, fallo y bloqueo), 2FA, tokens personales, cambio de contraseña, reuso de refresco    | ✅     |
| Sin datos sensibles en logs ni bitácora | `Authorization` y cookies enmascaradas; nunca contraseñas, tokens, códigos ni correos              | ✅     |
| Trazabilidad                            | `requestId` (respeta `X-Request-Id`), `userId`, módulo y duración en cada línea                    | ✅     |
| Retención acotada                       | Bitácora **un año**, con limpieza diaria; los intentos ya olvidados se borran con ella             | ✅     |

## V8 · Protección de datos

| Control                      | Cómo se cubre                                                                    | Estado |
| ---------------------------- | -------------------------------------------------------------------------------- | ------ |
| Minimización                 | De una tarjeta solo alias, banco y últimos 4; el correo del throttle va hasheado | ✅     |
| Secretos fuera del código    | Variables de entorno; `gitleaks` en CI                                           | ✅     |
| Credenciales no recuperables | Contraseñas, refrescos, códigos y tokens personales solo se guardan hasheados    | ✅     |

## V9 · Comunicaciones

| Control         | Cómo se cubre                                                                                          | Estado |
| --------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| TLS en tránsito | La cookie va `Secure` y `helmet` manda `Strict-Transport-Security`; **terminar TLS es del despliegue** | ⏳ H8  |

## V13 · API

| Control                      | Cómo se cubre                                                                                      | Estado |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ------ |
| Autenticación por token      | `Authorization: Bearer` (JWT de sesión o token personal)                                           | ✅     |
| CORS restringido             | Lista cerrada desde `WEB_ORIGIN`, con credenciales; **nunca `*`**                                  | ✅     |
| CSRF                         | La cookie es `SameSite=Strict` y solo viaja a `/api/v1/auth`                                       | ✅     |
| Contrato publicado y probado | OpenAPI generado desde los mismos esquemas Zod; una prueba exige que coincida con las rutas reales | ✅     |

## V14 · Configuración

| Control                         | Cómo se cubre                                                                                               | Estado |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| Cabeceras de seguridad          | `helmet`: `nosniff`, `X-Frame-Options`, HSTS y sin `X-Powered-By`. La CSP la pone la web, que sirve páginas | ✅     |
| Dependencias vigiladas          | Dependabot, `pnpm audit` y Trivy sobre las imágenes, en CI                                                  | ✅     |
| Análisis estático               | CodeQL (JS/TS y workflows) y SonarQube Cloud, obligatorios para fusionar                                    | ✅     |
| Superficie mínima en producción | `pnpm deploy --prod --no-optional`; la CLI de Prisma no viaja en la imagen                                  | ✅     |
| Módulos apagados no se anuncian | Un flag apagado responde 404 y **no aparece** en OpenAPI                                                    | ✅     |

## Lo que falta para el nivel 1 completo

- **TLS de verdad** delante de la API (H8, despliegue). Hoy la cookie ya pide `Secure`.
- **Verificación de correo y recuperación de contraseña** (H2 las pospuso; obligatorias si el registro se abre).
- **Revocar un token de acceso al instante**, hoy acotado a sus 15 minutos de vida.
- **Pantallas de la web** con sus propias protecciones (CSP, manejo del token en el navegador): la identidad de H2 es solo API.
