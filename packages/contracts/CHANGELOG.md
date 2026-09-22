# @sol-a-sol/contracts

## 0.3.0

### Patch Changes

- 9c524bc: Ya se puede **cambiar la contraseña** con `POST /api/v1/auth/password`, que pide la actual y aplica a la nueva la misma política que el registro. Una contraseña actual equivocada responde 403, no 401, para que la web no cierre una sesión que sí vale.

  Al cambiarla, y también **al activar el segundo factor**, se cierran las sesiones de los demás navegadores y se conserva la desde la que se hizo el cambio. Los tokens personales **no se revocan**, para no romper en silencio la captura desde el celular: la respuesta trae cuántas sesiones se cerraron y la lista de tokens que siguen valiendo, para ofrecer revocarlos. El cambio queda en la bitácora como `password.changed`.

- 19e12e9: Ya se puede crear una cuenta: `POST /api/v1/auth/register`. Quién puede hacerlo lo decide `REGISTRATION_MODE`, que por defecto vale `closed` y solo deja pasar a la primera persona, que queda como dueña de la plataforma; también admite `invite`, con un código que se compara en tiempo constante, y `open`. Ante un valor desconocido cierra, para que un error de tipeo no abra el registro a internet.

  Cuando el registro no está permitido, la respuesta es un **404 idéntico al de una ruta que no existe**: un 403 o un mensaje propio confirmarían que el registro está ahí, solo que cerrado. La contraseña pasa por la política del dominio antes de gastarse en hashear, se guarda con argon2id, y la respuesta lleva solo el id, el correo y la fecha: nunca el hash.

  El guard de feature flags pasa a estar registrado globalmente, así que basta con marcar una ruta con `@RequiresFeature` para que responda 404 con el módulo apagado, sin tener que acordarse de un `@UseGuards` en cada controlador.

- 50374ab: La API publica su contrato en `/api/v1/openapi.json`, un documento OpenAPI 3.0 que se arma con los **mismos esquemas Zod** con los que valida la entrada: la documentación no puede describir una cosa y el código aceptar otra. Una prueba comprueba además que toda ruta registrada aparezca en el documento, y que no se documente ninguna que no exista, así que añadir un endpoint y olvidar documentarlo deja de poder pasar en silencio.

  Las rutas de un módulo con su feature flag apagado **no aparecen**: describirlas confirmaría justo lo que su 404 se esfuerza en ocultar.

  No se usa `@nestjs/swagger`, que habría sumado unos 17 MB a la imagen de producción (sobre todo `swagger-ui-dist`) para servir documentación. Problem Details pasa a `@sol-a-sol/contracts`, donde ya estaba el resto de lo que viaja por HTTP, así que la web puede tipar los errores que recibe con el mismo esquema del que sale su descripción en el OpenAPI.

- 0ea4677: Ya se pueden crear **tokens personales**, para que el celular mande capturas sin la contraseña ni una sesión de navegador. `POST /api/v1/tokens` crea uno y lo muestra **una sola vez**: en la base queda solo el hash de su secreto. `GET /api/v1/tokens` los lista sin su valor, y `DELETE /api/v1/tokens/:id` lo revoca en el acto; el token de otra cuenta responde 404, igual que uno que no existe.

  Un token **siempre caduca**, entre 1 y 365 días (90 si no se indica), y lleva **scopes mínimos**: hoy solo `captures:write`. Solo entra en las rutas marcadas con `@AcceptsPersonalAccessToken`; en cualquier otra recibe 403, así que el token del celular no puede listar tokens, crear otros ni tocar el segundo factor. Uno revocado o caducado responde 401.

  El token (`sas_pat_…`) lleva dentro el id de su fila: se busca por clave primaria y el hash se compara en tiempo constante. La creación, la revocación, cada uso y cada rechazo quedan en la bitácora con su IP y user agent, y `lastUsedAt` dice si un token sigue en uso.

- 69f4901: Toda la API responde ya sus errores en Problem Details (RFC 9457), con `Content-Type: application/problem+json`. El `type` es un URN estable (`urn:sol-a-sol:error:invalid-amount`) y el `code` viaja en el cuerpo para que la web arme el mensaje en español; `title` y `detail` quedan en inglés, para quien depura. Un error de validación responde 422 con un elemento de `errors[]` por campo (`field`, `code`, `message`), un error de dominio responde con su código estable, y cualquier fallo inesperado responde un 500 genérico que no filtra nada del sistema, con el detalle real solo en el log.

  Nace también `@sol-a-sol/contracts`, con los esquemas Zod que comparten la API y la web, empezando por registro e inicio de sesión. Describen la forma del mensaje, no las reglas de negocio: la política de contraseñas se queda en `@sol-a-sol/domain`, para que no acabe definida en dos sitios que un día dejen de coincidir.

- bad95a1: El segundo factor ya tiene red de seguridad. Al activarlo se entregan **diez códigos de recuperación**, mostrados una sola vez; después solo queda su hash. Cada uno sirve una vez y en el inicio de sesión se usan **en lugar** del código del teléfono, así que perderlo deja de significar perder la cuenta.

  Están pensados para copiarse a mano de un papel: alfabeto base32 de Crockford —sin `I`, `L`, `O` ni `U`, que se confunden con `1`, `0` y otras— en grupos de cuatro, y se aceptan tecleados sin guiones, con espacios o en minúsculas. Doce símbolos son unos 60 bits, que no se adivinan probando.

  `POST /api/v1/auth/2fa/recovery-codes` los rehace e invalida los anteriores, y exige un código de la aplicación de autenticación, igual que desactivar el segundo factor: quien pille una sesión abierta un momento no puede llevarse diez llaves nuevas. Desactivar el segundo factor los borra.

- 1fa7fbc: Ya se puede activar un segundo factor con cualquier aplicación de autenticación. La activación va en dos pasos: `POST /api/v1/auth/2fa/setup` devuelve el `otpauth://` **una sola vez**, y el factor no queda activo hasta que `2fa/verify` lo confirma con un código, así que escanear mal el QR no deja la cuenta inaccesible. `2fa/disable` lo quita, y exige un código válido porque es una rebaja de seguridad; activar y desactivar quedan en la bitácora.

  Se acepta un periodo de treinta segundos a cada lado, para que un reloj ligeramente desfasado no impida entrar, y **un código sirve una sola vez**: se guarda el último periodo usado, así que quien lo vea por encima del hombro no puede aprovechar los segundos que le queden. Qué contadores se aceptan lo decide el dominio y no la librería, de modo que la ventana se prueba con reloj fijo.

  El secreto se guarda **cifrado** con AES-256-GCM y una clave propia, `AUTH_TOTP_ENCRYPTION_KEY`, no la de los JWT: rotar aquella dejaría ilegibles todos los secretos y a sus dueños fuera de su cuenta. Entra además el guard del token de acceso, que expone el `userId` a la ruta y es la base del aislamiento por usuario que completa la tarea de cierre.
