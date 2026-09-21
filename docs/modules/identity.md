# Módulo Identidad (`identity`)

> Ficha del módulo. Estado: **en construcción** (hito H2). Funcionan el registro, el inicio de sesión, la renovación, el cierre y el segundo factor con sus códigos de recuperación; faltan los tokens personales y el resto de la auditoría.

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
| Almacenamiento de la contraseña        | **argon2id** (ver los parámetros más abajo)                                                                                                                                                                                                                 |
| Duración de la sesión                  | Token de acceso **15 min**; refresh **30 días deslizante**, o sea que se renueva en cada uso                                                                                                                                                                |
| Refresh                                | Rotativo: cada uso emite uno nuevo e invalida el anterior. Si llega uno ya usado se cierran **todas** las sesiones del usuario y queda en la bitácora                                                                                                       |
| Segundo factor                         | **Opcional**, TOTP (RFC 6238, el estándar de las apps autenticadoras). Al activarlo se muestran una sola vez unos **códigos de recuperación** de un solo uso, guardados hasheados                                                                           |
| Intentos fallidos                      | **5 intentos**, luego bloqueo progresivo **1 → 2 → 4 → 8 → 15 min**, contado por cuenta y por IP, con tope de 15 min para que nadie pueda bloquear la cuenta desde fuera. Se reinicia con un login correcto                                                 |
| Tokens personales                      | Expiración elegible al crearlos, **90 días por defecto**. Se muestran una sola vez, se guardan hasheados, con scopes mínimos (el primero, `captures:write`) y revocación                                                                                    |
| Al cambiar la contraseña o activar 2FA | Se cierran **todas las demás sesiones**. Los **tokens personales NO se revocan**, para no romper en silencio la captura desde el celular; la respuesta avisa y ofrece revocarlos                                                                            |

### Parámetros de argon2id

Los de la hoja de recomendaciones de OWASP para almacenamiento de contraseñas, en la primera de sus combinaciones admitidas:

| Parámetro     | Valor                   | Por qué                                                                                                                            |
| ------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `memoryCost`  | **19 456 KiB** (19 MiB) | Es lo que encarece atacar el hash con GPU: una GPU tiene muchos núcleos, pero poca memoria por núcleo                              |
| `timeCost`    | **2** iteraciones       | Con 19 MiB, las que OWASP considera suficientes                                                                                    |
| `parallelism` | **1**                   | Un solo hilo por hash. La API ya atiende varias peticiones a la vez; paralelizar dentro de cada hash solo competiría consigo misma |

Las otras combinaciones que admite OWASP (47 MiB con `t=1`, 12 MiB con `t=3`, 9 MiB con `t=4`…) dan la misma resistencia y solo cambian el reparto entre memoria y tiempo.

**Subirlos más adelante no rompe nada:** los parámetros viajan dentro del propio hash (formato PHC, `$argon2id$v=19$m=19456,t=2,p=1$…`), así que un hash antiguo se sigue verificando con los suyos. Lo que faltará, cuando toque subirlos, es rehashear al vuelo en el login correcto.

Medido en el equipo de desarrollo: **~35 ms** por hash.

### Por qué la librería `argon2` y no `@node-rs/argon2`

`@node-rs/argon2` es más rápido (~21 ms), pero entrega su binario como **dependencia opcional**, y la imagen de producción se arma con `pnpm deploy --prod --no-optional` (issue #6), que las poda: la API arrancaría sin poder hashear. `argon2` trae los binarios precompilados **dentro del paquete**, así que sobrevive; cuesta ~10 MB de imagen, porque incluye los de las siete plataformas. La opción en JS puro (`@noble/hashes`) tarda ~390 ms y es síncrona, o sea que bloquearía el bucle de eventos en cada intento de login.

Su script de instalación está **desactivado** (`allowBuilds: argon2: false`): `node-gyp-build` resuelve el binario al importar, sin compilar nada.

### Variables de entorno

| Variable                   | Valores                                  | Para qué                                                                                                                                                                    |
| -------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REGISTRATION_MODE`        | `closed` (por defecto), `invite`, `open` | Quién puede crear una cuenta. Cualquier valor desconocido, o la variable sin definir, se entiende como `closed`: un error de tipeo no puede abrir el registro               |
| `AUTH_JWT_SECRET`          | texto de **32 bytes o más**              | Firma los tokens de acceso (HS256 usa una clave de 256 bits). Sin ella la API no emite ninguno. Generar una por entorno: `openssl rand -base64 48`                          |
| `AUTH_TOTP_ENCRYPTION_KEY` | 32 bytes en base64                       | Cifra los secretos TOTP. Es **propia** y no la de los JWT: rotar aquella dejaría ilegibles todos los secretos y a sus dueños fuera de su propia cuenta                      |
| `REGISTRATION_INVITE_CODE` | texto                                    | Solo con `invite`. Sin código configurado no entra nadie, para que olvidar la variable no signifique "cualquiera entra con el código vacío". Se compara en tiempo constante |

Cuando el registro no está permitido, la ruta responde **404 idéntico al de una ruta inexistente**, sin decir que el registro existe y está cerrado.

### El token de acceso

Un JWT firmado con **HS256** que vive **15 minutos** (la duración está en `@sol-a-sol/domain`, no en la API: es una regla de negocio). El cuerpo lleva solo `sub`, `iat` y `exp`.

**Nada personal viaja dentro**, ni siquiera el correo: un JWT va firmado pero **no cifrado**, así que cualquiera que lo intercepte lee su contenido. Hay una prueba que falla si aparece una cuarta clave en el cuerpo.

`iat` y `exp` se calculan con el puerto `Clock`, nunca con `new Date()`, así que una prueba puede fijar el instante y comprobar la caducidad exacta sin esperar quince minutos.

### Enumeración de correos en el inicio de sesión

Un correo desconocido y una contraseña equivocada responden **401 con el mismo cuerpo exacto**, y además **cuestan lo mismo**: cuando el correo no existe se verifica contra un **hash señuelo**, calculado al arrancar a partir de una cadena aleatoria. Sin eso, el caso del correo desconocido no hashearía nada y respondería visiblemente antes, y cronometrando las respuestas se podría averiguar qué correos tienen cuenta.

El señuelo se calcula al arrancar el módulo y no en el primer fallo, porque si no ese primer intento costaría un hash de más y volvería a delatar la diferencia.

### La sesión: cookie, rotación y reuso

El refresco viaja en una cookie con **`HttpOnly`** (JavaScript no la lee, así que un XSS no se la lleva), **`Secure`** (solo por HTTPS; los navegadores tratan `http://localhost` como contexto seguro, así que no estorba en desarrollo) y **`SameSite=Strict`**, que corta de raíz el CSRF sobre estos endpoints. Su `Path` es `/api/v1/auth`, de modo que ni siquiera se manda al resto de la API.

**Rotación.** Cada renovación emite un refresco nuevo e invalida el anterior, así que robar uno solo sirve una vez.

**Detección de reuso.** Si llega un refresco ya canjeado, alguien lo copió. No hay forma de saber si quien lo presenta es la víctima o el ladrón, así que se cierran **todas** las sesiones de la cuenta y queda registrado en `audit_logs` como `refresh_token.reused`. La persona vuelve a entrar con su contraseña; quien lo robó se queda fuera.

Dos pestañas renovando a la vez con la misma cookie caen en este camino: desde fuera son indistinguibles de un robo. El `UPDATE` que marca el token como canjeado lleva la condición `used_at IS NULL` dentro, así que solo una petición gana la carrera.

**Cerrar sesión nunca falla.** Responde 204 valga la cookie o no: quien cierra sesión quiere irse, y un error le diría a un tercero si un token que probó existe. Solo cierra esa sesión, no las demás de la cuenta.

### Por qué los refrescos se hashean con SHA-256 y no con argon2id

argon2 es lento **por diseño**, para proteger secretos que elige una persona y se pueden adivinar. Un refresco son **256 bits aleatorios**: no hay nada que adivinar, y su hash tiene que poder buscarse en un índice en cada renovación, cosa que un hash con sal por fila no permite. Lo que se guarda es solo el hash, así que una filtración de la base no permite suplantar a nadie.

### El segundo factor

TOTP de seis dígitos cada treinta segundos (RFC 6238), lo que implementan todas las aplicaciones de autenticación. La activación tiene **dos pasos**: `setup` crea el secreto y devuelve el `otpauth://` **una sola vez**, y hasta que `verify` lo confirma con un código el segundo factor **no está activo**. Así, escanear mal el QR no deja la cuenta inaccesible.

**Ventana de tolerancia: un periodo a cada lado.** Relojes ligeramente desfasados no deben impedir entrar, pero una ventana más ancha alargaría la vida de un código que alguien vio por encima del hombro. Qué contadores se aceptan lo decide el dominio, no la librería, así que se prueba con reloj fijo.

**Un código sirve una sola vez.** Se guarda el último periodo usado (`totp_last_counter`) y solo se aceptan posteriores. Tiene una consecuencia que conviene saber: dentro de un mismo periodo de 30 s solo hay **dos** códigos utilizables (el actual y el siguiente). En uso real no se nota; en las pruebas de integración obliga a mover el reloj a mano.

**Desactivar exige un código válido**, porque es una rebaja de seguridad. Activación y desactivación quedan en `audit_logs`.

**El secreto se guarda cifrado** con AES-256-GCM, no hasheado: hay que poder leerlo entero en cada login para calcular el código esperado. GCM además autentica, así que manipular el texto cifrado se nota en vez de descifrarse a basura.

### Los códigos de recuperación

Diez códigos de doce símbolos, entregados **al activar** el segundo factor y mostrados **una sola vez**: después solo queda su hash SHA-256. Cada uno sirve **una vez**, y en el login se usan **en lugar** del código del teléfono, nunca además.

El alfabeto es base32 de Crockford —sin `I`, `L`, `O` ni `U`— porque estos códigos se copian a mano de un papel y ahí `I` y `1`, u `O` y `0`, se confunden. Se muestran en grupos de cuatro (`ABCD-EFGH-JKMN`) y se aceptan tecleados sin guiones, con espacios o en minúsculas: quien está recuperando el acceso ya tiene bastante con haber perdido el teléfono.

Doce símbolos de un alfabeto de 32 son unos **60 bits**, que no se adivinan probando. Se generan con `randomInt`, que reparte de forma uniforme; `randomBytes() % 32` favorecería los primeros símbolos si el alfabeto no dividiera exacto.

Rehacerlos **invalida los anteriores** y exige un código de la aplicación de autenticación, igual que desactivar el segundo factor: quien pille una sesión abierta un momento no puede llevarse diez llaves nuevas. Desactivar el segundo factor los borra: sin nada que sustituir, no tienen sentido.

### Pedir el código confirma que la contraseña era correcta

Cuando la cuenta tiene segundo factor y no llega código, la respuesta es `TOTP_REQUIRED`, que revela que la contraseña acertó. Es **inevitable**: sin decirlo no habría forma de pedir el código. Y es justamente la razón de ser del segundo factor — que saber la contraseña ya no baste.

### Enumeración de correos en el registro

Registrar un correo ya tomado responde **409**, o sea que revela que esa cuenta existe. Es aceptable **solo porque el registro está cerrado por defecto**: con `REGISTRATION_MODE=closed`, ese 409 es inalcanzable, porque en cuanto existe una cuenta el guard responde 404 antes de llegar al caso de uso.

Si algún día se pasa a `open`, hay que taparlo. Lo habitual es responder siempre 201 y avisar por correo, lo que exige antes el envío de correo que este hito pospuso.

### Limitación conocida

**No hay verificación de correo ni recuperación de contraseña.** Se pospusieron a propósito: con el
registro cerrado, verificar el correo de la única cuenta no protege de nada. La consecuencia es que
**si se olvida la contraseña, la única salida es tocar la base de datos**. Hay que reevaluarlo si
`REGISTRATION_MODE` deja de ser `closed`.

## Datos

| Tabla                    | Para qué                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `users`                  | La cuenta. Ya existía desde la migración inicial. `password_hash` guarda el hash argon2id completo y **nunca** sale en una respuesta |
| `personal_access_tokens` | Credenciales por dispositivo. `ON DELETE CASCADE`: borrar la cuenta borra sus tokens                                                 |
| `audit_logs`             | Bitácora de seguridad. **Sin clave foránea a propósito**                                                                             |

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

Todos bajo `/api/v1` y con `@RequiresFeature('identity')`. Los que ya existen se describen en [`/api/v1/openapi.json`](../../README.md#api), que solo los muestra con el flag encendido.

| Método | Ruta                | Qué hace                                                        |
| ------ | ------------------- | --------------------------------------------------------------- |
| POST   | `/auth/register`    | ✅ Crea la cuenta. 404 si `REGISTRATION_MODE` no lo permite     |
| POST   | `/auth/login`       | ✅ Devuelve el token de acceso y deja el refresco en una cookie |
| POST   | `/auth/refresh`     | ✅ Rota el refresco y emite un token de acceso nuevo            |
| POST   | `/auth/logout`      | ✅ Cierra la sesión actual y borra la cookie                    |
| POST   | `/auth/2fa/setup`   | ✅ Devuelve el `otpauth://` una sola vez                        |
| POST   | `/auth/2fa/verify`  | ✅ Confirma el código y activa el segundo factor                |
| POST   | `/auth/2fa/disable` | ✅ Desactiva el segundo factor. Exige un código válido          |
| GET    | `/tokens`           | Lista los tokens personales, **sin** su valor                   |
| POST   | `/tokens`           | Crea uno y lo muestra **una sola vez**                          |
| DELETE | `/tokens/:id`       | Lo revoca                                                       |

## Estado

- Feature flag: `FEATURE_IDENTITY` (apagado hasta cumplir la Definition of Done)
- Escenarios: [`features/identity/`](../../features/identity/)
