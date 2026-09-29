# @sol-a-sol/domain

## 0.4.0

### Patch Changes

- 15cd2a4: Categorías en la API (`catalog`, todavía **apagado**): `GET`, `POST` y `PATCH` de `/api/v1/categories`, con las subcategorías anidadas. No hay `DELETE`: una categoría se archiva.

  - **Un solo nivel de subcategorías.** La subcategoría hereda el tipo de su madre, y también su color e ícono si no se indican.
  - **El nombre no se repite** entre hermanas del mismo tipo, sin distinguir mayúsculas **ni acentos** ("Café" = "cafe"). La ñ sí cuenta.
  - **Archivar una categoría archiva sus subcategorías.** Al restaurarla vuelven solo las que se archivaron con ella, y una subcategoría no se restaura mientras su madre siga archivada.
  - **El tipo y la madre no se cambian.** Archivar no reescribe las transacciones que ya usan la categoría.

- 0c7fd31: Métodos de pago en la API (`catalog`, todavía **apagado**): `GET`, `POST` y `PATCH` de `/api/v1/payment-methods` para cuentas, billeteras, tarjetas de crédito y efectivo. No hay `DELETE`: un método se archiva.

  - **De una tarjeta solo se guardan alias, banco y últimos 4 dígitos.** Un número más largo se rechaza, no se recorta, y un campo como `cvv` o `cardNumber` también se rechaza.
  - **Reglas por tipo:** una tarjeta de crédito lleva sus últimos 4 dígitos, una cuenta o billetera lleva moneda (una tarjeta bimoneda no), y el efectivo no tiene banco. Las aplica el dominio y las repite la base con restricciones `CHECK`.
  - **El alias es único** por usuario, sin distinguir mayúsculas y contando los archivados.
  - Todo cambia menos el tipo, y solo desde una sesión: un token personal recibe 403.

  SonarQube Cloud recibe ahora también la cobertura de las pruebas de integración, que son las que ejercitan controllers y repositorios.

- 18e41ed: Convertir una subcategoría en etiqueta (`POST /api/v1/categories/{id}/convert-to-tag`): se fusiona en su madre y sus transacciones quedan con la etiqueta de su nombre. El evento `catalog.category.merged` gana el campo opcional `tag`.
- 99cb32b: Lector de CSV para la importación (`readCsv`: coma o punto y coma, comillas, BOM, finales de Windows) y la interpretación de cada fila del formato oficial (`interpretImportRow`), con su huella para no importar dos veces lo mismo (`importFingerprints`). El formato queda documentado en `docs/modules/transactions-import-format.md`.
- 3f1d6ee: Gestión de etiquetas: `GET /api/v1/tags` (con cuántas transacciones vigentes usan cada una), `PATCH /api/v1/tags/{id}` para renombrar (con el nombre de otra etiqueta, las fusiona) y `DELETE /api/v1/tags/{id}`, que la quita de todas las transacciones.
- c3c7f6e: Fusionar categorías (`POST /api/v1/categories/{id}/merge`): sus transacciones pasan a la destino, sus hijas se mudan con ella y la origen se archiva. `catalog` fusiona y publica `catalog.category.merged`; `transactions` lo escucha y mueve sus filas (ADR-0005). Los totales del listado traen `count`, que sirve de vista previa.
- 7341761: Mudar una subcategoría a otra madre de primer nivel, del mismo tipo y activa, con todas sus transacciones (`parentId` en `PATCH /api/v1/categories/{id}`). Una categoría de primer nivel no se muda (`ONLY_SUBCATEGORIES_MOVE`).
- bae3856: Etiquetas en las transacciones: `tags` al registrar o corregir (se crean al escribirlas; "Almuerzo" y "almuerzó" son la misma), en la respuesta y en el listado, y el filtro `?tag=` con totales de lo etiquetado. Hasta 10 distintas por transacción, sin `|`. Las transferencias no llevan etiquetas.
- 7e40781: Registrar una transacción (`POST /api/v1/transactions`) y leerla por su id (`GET /api/v1/transactions/{id}`), con el evento `transactions.transaction.created`. El monto viaja como string decimal y se guarda sin pérdida en `NUMERIC(18,2)`. Nueva regla de dominio: un método de pago archivado no se usa en transacciones nuevas (`PAYMENT_METHOD_ARCHIVED`). `catalog` expone `CatalogLookup` para que otros módulos comprueben categorías y métodos de pago.
- d0d4541: Nace el módulo `transactions` (apagado con `FEATURE_TRANSACTIONS=false`) con sus reglas de dominio y su tabla. Todavía no tiene endpoints.

  - **El monto siempre es positivo**: el signo lo da el tipo. Para el saldo del mes solo el ingreso suma.
  - **Gasto** es fijo más variable (la deuda va aparte), y **ahorro** es ahorro más inversión, para la tasa de ahorro.
  - **La fecha llega hasta hoy** en la hora de Lima, sin fechas futuras.
  - **La moneda** es la del método de pago si no se indica otra. Si no hay ninguna, se exige: nunca se supone soles ni se convierte.
  - **La categoría** es del mismo tipo que la transacción y no puede estar archivada.

  La tabla guarda la fecha como `DATE` y el monto como `NUMERIC(18,2)` positivo. Además, la base garantiza que la categoría y el método de pago sean del mismo usuario, y la categoría del mismo tipo.

- e4e1a1b: Listado de transacciones (`GET /api/v1/transactions`): filtros por mes o rango, tipo, categoría (con sus subcategorías), método de pago y moneda; búsqueda sin mayúsculas ni tildes; paginación por cursor estable ante altas y bajas; y totales por moneda de todo lo filtrado. En el dominio, `totalsByCurrency` y `searchKey`, que ahora comparte `categoryNameKey`.
- 6043ec6: Transferencias entre cuentas propias (`POST /api/v1/transfers`, `GET /api/v1/transfers/{id}`): plata que cambia de lugar sin contar como ingreso ni gasto. Con un cambio de moneda guarda los dos montos, copiados del voucher, sin convertir nunca. Pagar la tarjeta de crédito pasa a ser una transferencia; **Deuda** queda para préstamos, intereses y comisiones. Completa también las tablas de endpoints y errores de la ficha de `transactions`.

## 0.3.0

### Patch Changes

- 988bdb1: Ya se puede entrar: `POST /api/v1/auth/login` devuelve un token de acceso firmado con HS256 que vale **15 minutos**. La duración vive en `@sol-a-sol/domain` porque es una regla de negocio, y tanto `iat` como `exp` se calculan con el puerto `Clock`, así que una prueba fija el instante y comprueba la caducidad exacta sin esperar. El token lleva solo `sub`, `iat` y `exp`: un JWT va firmado pero no cifrado, y cualquiera que lo intercepte puede leerlo.

  Un correo desconocido y una contraseña equivocada responden **401 con el mismo cuerpo y cuestan lo mismo**: cuando el correo no existe se verifica contra un hash señuelo, calculado al arrancar a partir de una cadena aleatoria. Sin eso, ese caso no hashearía nada y respondería antes, y cronometrando las respuestas se podría averiguar qué correos tienen cuenta.

  El reloj del sistema pasa a ser un módulo global (`TimeModule`), que es el único sitio de la API donde se lee la hora real.

- 19e12e9: Ya se puede crear una cuenta: `POST /api/v1/auth/register`. Quién puede hacerlo lo decide `REGISTRATION_MODE`, que por defecto vale `closed` y solo deja pasar a la primera persona, que queda como dueña de la plataforma; también admite `invite`, con un código que se compara en tiempo constante, y `open`. Ante un valor desconocido cierra, para que un error de tipeo no abra el registro a internet.

  Cuando el registro no está permitido, la respuesta es un **404 idéntico al de una ruta que no existe**: un 403 o un mensaje propio confirmarían que el registro está ahí, solo que cerrado. La contraseña pasa por la política del dominio antes de gastarse en hashear, se guarda con argon2id, y la respuesta lleva solo el id, el correo y la fecha: nunca el hash.

  El guard de feature flags pasa a estar registrado globalmente, así que basta con marcar una ruta con `@RequiresFeature` para que responda 404 con el módulo apagado, sin tener que acordarse de un `@UseGuards` en cada controlador.

- ef3f190: Probar contraseñas contra la API deja de ser viable. Cinco fallos seguidos bloquean **un minuto**, y a partir de ahí cada fallo vuelve a bloquear doblando el tiempo: 2, 4, 8 y **15 minutos como tope**, para que nadie pueda dejar al dueño fuera de su cuenta indefinidamente. Se cuentan el correo y la IP **por separado**, y un código de segundo factor o de recuperación equivocado cuenta igual que una contraseña. Entrar bien borra el contador, y un día sin fallos también. El bloqueo responde 429 con `Retry-After`, y el correo se guarda hasheado para que la tabla no sea una lista de quién intentó entrar.

  Encima va un **tope de caudal por IP** (`@nestjs/throttler`): 120 peticiones por minuto, y 20 en `/auth`, donde cada petición cuesta un argon2id. Los health checks quedan fuera.

  Los **logs** pasan a JSON con `pino`, con `requestId`, `userId`, módulo y duración, y con la cabecera `Authorization` y las cookies enmascaradas. La **bitácora** registra ahora también los inicios de sesión, los fallidos y los bloqueos, y se conserva **un año**: una tarea diaria borra lo más viejo y los intentos ya olvidados.

- 2439bcf: Las contraseñas ya tienen política y forma de guardarse. En el dominio, `assertPasswordIsStrong` exige **12 caracteres** y nada más —sin mayúsculas ni números obligatorios, siguiendo a NIST SP 800-63B, porque las reglas de composición empujan a patrones previsibles— y rechaza las contraseñas largas y previsibles de una lista embebida: recorridos de teclado, repeticiones y frases muy usadas. Las de las listas de filtraciones famosas no hacen falta, porque el mínimo de longitud ya las descarta. El error dice qué falta sin revelar la regla ni incluir nunca la contraseña.

  En la API, el puerto `PasswordHasher` y su adaptador **argon2id** con los parámetros de OWASP (19 MiB, 2 iteraciones, sin paralelismo). Una contraseña equivocada devuelve `false` en vez de lanzar, y un hash ilegible falla cerrado dejando aviso en el log, para que una cuenta que no puede entrar no se quede sin rastro del motivo.

- 0ea4677: Ya se pueden crear **tokens personales**, para que el celular mande capturas sin la contraseña ni una sesión de navegador. `POST /api/v1/tokens` crea uno y lo muestra **una sola vez**: en la base queda solo el hash de su secreto. `GET /api/v1/tokens` los lista sin su valor, y `DELETE /api/v1/tokens/:id` lo revoca en el acto; el token de otra cuenta responde 404, igual que uno que no existe.

  Un token **siempre caduca**, entre 1 y 365 días (90 si no se indica), y lleva **scopes mínimos**: hoy solo `captures:write`. Solo entra en las rutas marcadas con `@AcceptsPersonalAccessToken`; en cualquier otra recibe 403, así que el token del celular no puede listar tokens, crear otros ni tocar el segundo factor. Uno revocado o caducado responde 401.

  El token (`sas_pat_…`) lleva dentro el id de su fila: se busca por clave primaria y el hash se compara en tiempo constante. La creación, la revocación, cada uso y cada rechazo quedan en la bitácora con su IP y user agent, y `lastUsedAt` dice si un token sigue en uso.

- bad95a1: El segundo factor ya tiene red de seguridad. Al activarlo se entregan **diez códigos de recuperación**, mostrados una sola vez; después solo queda su hash. Cada uno sirve una vez y en el inicio de sesión se usan **en lugar** del código del teléfono, así que perderlo deja de significar perder la cuenta.

  Están pensados para copiarse a mano de un papel: alfabeto base32 de Crockford —sin `I`, `L`, `O` ni `U`, que se confunden con `1`, `0` y otras— en grupos de cuatro, y se aceptan tecleados sin guiones, con espacios o en minúsculas. Doce símbolos son unos 60 bits, que no se adivinan probando.

  `POST /api/v1/auth/2fa/recovery-codes` los rehace e invalida los anteriores, y exige un código de la aplicación de autenticación, igual que desactivar el segundo factor: quien pille una sesión abierta un momento no puede llevarse diez llaves nuevas. Desactivar el segundo factor los borra.

- 48b352e: La sesión ya se sostiene sola: `POST /api/v1/auth/refresh` y `POST /api/v1/auth/logout`. El refresco viaja en una cookie `HttpOnly`, `Secure` y `SameSite=Strict`, limitada a `/api/v1/auth`, y dura **30 días deslizantes**: cada uso emite uno nuevo con otros treinta por delante, así que quien entra a diario no vuelve a escribir la contraseña.

  Cada renovación **invalida el refresco anterior**. Si llega uno ya canjeado, alguien lo copió: como no hay forma de saber si quien lo presenta es la víctima o el ladrón, se cierran **todas** las sesiones de la cuenta y queda registrado en `audit_logs`. Dos pestañas renovando a la vez caen en ese mismo camino, y por eso el `UPDATE` que marca el token lleva dentro la condición de que siga sin usar: solo una gana la carrera.

  Cerrar sesión responde 204 valga la cookie o no, para no delatar si un token que alguien probó existe, y solo cierra esa sesión. Los refrescos se guardan hasheados con SHA-256 —no argon2id, que es lento a propósito para secretos que se pueden adivinar, y estos son 256 bits aleatorios que además hay que poder buscar en un índice.

- 1fa7fbc: Ya se puede activar un segundo factor con cualquier aplicación de autenticación. La activación va en dos pasos: `POST /api/v1/auth/2fa/setup` devuelve el `otpauth://` **una sola vez**, y el factor no queda activo hasta que `2fa/verify` lo confirma con un código, así que escanear mal el QR no deja la cuenta inaccesible. `2fa/disable` lo quita, y exige un código válido porque es una rebaja de seguridad; activar y desactivar quedan en la bitácora.

  Se acepta un periodo de treinta segundos a cada lado, para que un reloj ligeramente desfasado no impida entrar, y **un código sirve una sola vez**: se guarda el último periodo usado, así que quien lo vea por encima del hombro no puede aprovechar los segundos que le queden. Qué contadores se aceptan lo decide el dominio y no la librería, de modo que la ventana se prueba con reloj fijo.

  El secreto se guarda **cifrado** con AES-256-GCM y una clave propia, `AUTH_TOTP_ENCRYPTION_KEY`, no la de los JWT: rotar aquella dejaría ilegibles todos los secretos y a sus dueños fuera de su cuenta. Entra además el guard del token de acceso, que expone el `userId` a la ruta y es la base del aislamiento por usuario que completa la tarea de cierre.

## 0.2.0

### Minor Changes

- Hito H1 — Dominio base: paquete `@sol-a-sol/domain`, puro y sin dependencias, construido con TDD y con cobertura y mutation score al 100 %: `Money` con aritmética decimal exacta, redondeo bancario al presentar o persistir, reparto de cuotas sin perder céntimos y error al mezclar monedas; `parseAmount` y `findAmountInText` para leer montos escritos como texto (formato peruano, sin adivinar); `LocalDate` para fechas de negocio sin hora, con días de corte que no existen en el mes; y el puerto `Clock`, que saca `new Date()` de la lógica. Además, feature flags por módulo en la API (un módulo incompleto llega a `main` apagado y responde 404), navegación de la web armada leyendo los manifests de cada funcionalidad, y el generador `pnpm gen:module`, que crea y registra un módulo nuevo con sus cinco capas.

### Patch Changes

- 4493180: Fechas de negocio sin hora (`LocalDate`) y el puerto `Clock`. `LocalDate` valida fechas reales (rechaza el 30 de febrero), lee ISO (`2026-09-17`) y formato peruano cuando el origen lo justifica (`17/09/2026`), suma días y meses ajustando al último día del mes cuando el destino es más corto (un día de corte 31 cierra el 30 de abril o el 28 de febrero), y convierte un instante a la fecha de Lima. `Clock` permite fijar el "hoy" en las pruebas, así que los cálculos de vencimientos y ciclos son reproducibles.
- 2ecbc7f: Nuevo value object `Money` para montos exactos en soles y dólares (con `decimal.js`, nunca `number`): suma, resta y multiplicación sin errores de coma flotante; redondeo bancario a 2 decimales solo al presentar o persistir; porcentajes con 2 decimales y sin dividir por cero; y reparto en cuotas sin perder céntimos, asignando los sobrantes a las primeras. Rechaza montos con más de 2 decimales y operaciones entre monedas distintas.
- b1b0bd1: Nuevo paquete `@sol-a-sol/domain` para la lógica de negocio pura, con cobertura mínima del 90 %, mutation testing con Stryker y reglas de ESLint que impiden usar el reloj real, valores aleatorios, APIs de Node o frameworks. Primera pieza: las monedas soportadas (`PEN`, `USD`) y la base de los errores de dominio.
- 64a6c88: Lectura de montos escritos como texto: `parseAmount` convierte `"S/ 1,234.50"`, `"US$ 20"` o `"25.90"` en `Money` (formato peruano con punto decimal; `$` es dólares; la moneda por defecto la indica quien llama), y `findAmountInText` extrae el monto de una notificación bancaria completa, considerando solo los montos pegados a una moneda para no confundirlos con los dígitos de la tarjeta, fechas o cuotas. Si el texto trae montos distintos, no adivina: lanza un error para que la captura se revise a mano.
