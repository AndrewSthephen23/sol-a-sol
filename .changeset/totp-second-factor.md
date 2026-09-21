---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/domain': patch
---

Ya se puede activar un segundo factor con cualquier aplicación de autenticación. La activación va en dos pasos: `POST /api/v1/auth/2fa/setup` devuelve el `otpauth://` **una sola vez**, y el factor no queda activo hasta que `2fa/verify` lo confirma con un código, así que escanear mal el QR no deja la cuenta inaccesible. `2fa/disable` lo quita, y exige un código válido porque es una rebaja de seguridad; activar y desactivar quedan en la bitácora.

Se acepta un periodo de treinta segundos a cada lado, para que un reloj ligeramente desfasado no impida entrar, y **un código sirve una sola vez**: se guarda el último periodo usado, así que quien lo vea por encima del hombro no puede aprovechar los segundos que le queden. Qué contadores se aceptan lo decide el dominio y no la librería, de modo que la ventana se prueba con reloj fijo.

El secreto se guarda **cifrado** con AES-256-GCM y una clave propia, `AUTH_TOTP_ENCRYPTION_KEY`, no la de los JWT: rotar aquella dejaría ilegibles todos los secretos y a sus dueños fuera de su cuenta. Entra además el guard del token de acceso, que expone el `userId` a la ruta y es la base del aislamiento por usuario que completa la tarea de cierre.
