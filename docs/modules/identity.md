# Módulo Identidad (`identity`)

> Ficha del módulo. Estado: **en construcción** (hito H2). Hoy solo existe el andamiaje y las tablas.

## Qué resuelve

Que la plataforma tenga dueño. Sin identidad no hay a quién atribuir una transacción: el modelo de
datos es multiusuario desde el día 1 y **toda consulta filtra por `userId`**, así que este módulo es
el que da sentido a ese filtro. También es lo que permite que el celular envíe capturas (H7) sin
que la contraseña viaje en cada petición.

Va antes que cualquier funcionalidad financiera porque agregar autenticación después obligaría a
reescribir todos los endpoints.

## Reglas de negocio

Decididas con el autor el 2026-09-18. No se cambian sin volver a preguntar.

| Regla                                  | Decisión                                                                                                                                                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quién puede registrarse                | Política configurable `REGISTRATION_MODE=closed\|invite\|open`, **`closed` por defecto**. El primer usuario que se registra queda como dueño; después la ruta responde **404**, no 403, para no confirmar que existe                                        |
| Contraseña                             | Mínimo **12 caracteres**, sin exigir mayúsculas ni números (criterio de NIST SP 800-63B), y se rechazan las de una lista de filtradas **embebida en el repositorio**: el dominio se compila sin tipos de Node ni del navegador y no puede consultar una API |
| Almacenamiento de la contraseña        | **argon2id**                                                                                                                                                                                                                                                |
| Duración de la sesión                  | Token de acceso **15 min**; refresh **30 días deslizante**, o sea que se renueva en cada uso                                                                                                                                                                |
| Refresh                                | Rotativo: cada uso emite uno nuevo e invalida el anterior. Si llega uno ya usado se cierran **todas** las sesiones del usuario y queda en la bitácora                                                                                                       |
| Segundo factor                         | **Opcional**, TOTP (RFC 6238, el estándar de las apps autenticadoras). Al activarlo se muestran una sola vez unos **códigos de recuperación** de un solo uso, guardados hasheados                                                                           |
| Intentos fallidos                      | **5 intentos**, luego bloqueo progresivo **1 → 2 → 4 → 8 → 15 min**, contado por cuenta y por IP, con tope de 15 min para que nadie pueda bloquear la cuenta desde fuera. Se reinicia con un login correcto                                                 |
| Tokens personales                      | Expiración elegible al crearlos, **90 días por defecto**. Se muestran una sola vez, se guardan hasheados, con scopes mínimos (el primero, `captures:write`) y revocación                                                                                    |
| Al cambiar la contraseña o activar 2FA | Se cierran **todas las demás sesiones**. Los **tokens personales NO se revocan**, para no romper en silencio la captura desde el celular; la respuesta avisa y ofrece revocarlos                                                                            |

### Limitación conocida

**No hay verificación de correo ni recuperación de contraseña.** Se pospusieron a propósito: con el
registro cerrado, verificar el correo de la única cuenta no protege de nada. La consecuencia es que
**si se olvida la contraseña, la única salida es tocar la base de datos**. Hay que reevaluarlo si
`REGISTRATION_MODE` deja de ser `closed`.

## Datos

| Tabla                    | Para qué                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `users`                  | La cuenta. Ya existía desde la migración inicial                                     |
| `personal_access_tokens` | Credenciales por dispositivo. `ON DELETE CASCADE`: borrar la cuenta borra sus tokens |
| `audit_logs`             | Bitácora de seguridad. **Sin clave foránea a propósito**                             |

Sobre `audit_logs`: una entrada de auditoría es un hecho inmutable sobre algo que ya pasó y debe
sobrevivir al borrado de quien lo provocó. Con `onDelete: SetNull` se perdería quién hizo qué, y con
`Cascade` quien borra su cuenta borraría la evidencia. La integridad la garantiza la aplicación.
`user_id` es opcional porque un intento de login contra un correo inexistente no tiene usuario
conocido.

Se registran: login (con éxito y fallido), cambios de 2FA, alta y revocación de tokens, y borrados.

## Eventos de dominio

- **Emite:** todavía ninguno. Se definirán al implementar el registro y el login.
- **Escucha:** ninguno.

## Endpoints

Previstos para H2; ninguno existe todavía. Todos bajo `/api/v1` y con `@RequiresFeature('identity')`.

| Método | Ruta               | Qué hace                                                 |
| ------ | ------------------ | -------------------------------------------------------- |
| POST   | `/auth/register`   | Crea la cuenta. 404 si `REGISTRATION_MODE` no lo permite |
| POST   | `/auth/login`      | Devuelve el token de acceso y deja el refresh en cookie  |
| POST   | `/auth/refresh`    | Rota el refresh y emite un token de acceso nuevo         |
| POST   | `/auth/logout`     | Cierra la sesión actual                                  |
| POST   | `/auth/2fa/enable` | Devuelve el `otpauth://` y los códigos de recuperación   |
| POST   | `/auth/2fa/verify` | Confirma el código y activa el segundo factor            |
| DELETE | `/auth/2fa`        | Desactiva el segundo factor                              |
| GET    | `/tokens`          | Lista los tokens personales, **sin** su valor            |
| POST   | `/tokens`          | Crea uno y lo muestra **una sola vez**                   |
| DELETE | `/tokens/:id`      | Lo revoca                                                |

## Estado

- Feature flag: `FEATURE_IDENTITY` (apagado hasta cumplir la Definition of Done)
- Escenarios: [`features/identity/`](../../features/identity/)
