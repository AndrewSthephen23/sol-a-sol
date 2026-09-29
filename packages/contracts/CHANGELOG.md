# @sol-a-sol/contracts

## 0.5.0

### Patch Changes

- c1a205f: `GET` y `PUT /api/v1/budgets/{year}/{month}`: leer y guardar el presupuesto de un mes, todavía con el módulo apagado. Un mes sin presupuesto responde sus partidas, ninguna, no un 404. Guardar reemplaza el mes entero, toda o nada: cada partida en una categoría madre y activa de la cuenta, una por categoría y moneda, con un monto de cero o más, en cualquier mes. Una partida que el mes ya tenía se puede volver a mandar aunque su categoría se haya archivado después.

  `CatalogLookup` dice ahora si una categoría es de primer nivel. Y una partida cuelga también directo de su usuario: sin eso, borrar una cuenta con presupuesto fallaba.

- 0457810: Nace el módulo `reports` (apagado con `FEATURE_REPORTS=false`), de solo lectura y sin tablas propias, con `GET /api/v1/reports/monthly`: el dashboard del mes en una llamada, por moneda y sin convertir nunca. Trae los KPIs (ingresos, gastos, ahorro, deuda y saldo), el gasto diario con los días en cero (el mes en curso hasta hoy en Lima), la dona del gasto por categoría madre con las 6 mayores y «Otras», y las tablas por tipo. Lo arma `buildMonthlyDashboard` en el dominio, con mutation testing al 100 %.

  `TransactionsLookup` suma `totalsByDay`. `reports` no entra en la navegación: el dashboard vivirá en `/`.

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

- 089bf1b: Confirmación de la importación (`POST /api/v1/transactions/import`): con una decisión por cada categoría y método de pago que falta o está archivado (crearlo, usar uno propio o restaurarlo), guarda todas las filas con origen `IMPORT` en una sola transacción de base de datos, o ninguna. Omite lo ya importado y responde 409 si otra importación guardó a la vez las mismas filas.
- 5ac731b: Vista previa de la importación (`POST /api/v1/transactions/import/preview`): sin guardar nada, dice qué filas entrarían, cada problema por línea y columna, lo ya importado (huella única por cuenta), y las categorías y métodos de pago por resolver. Límites de 1 MB y 5 000 filas. Además, un cuerpo demasiado grande o un JSON mal escrito ya no responden 500, sino 413 y 400.
- 3f1d6ee: Gestión de etiquetas: `GET /api/v1/tags` (con cuántas transacciones vigentes usan cada una), `PATCH /api/v1/tags/{id}` para renombrar (con el nombre de otra etiqueta, las fusiona) y `DELETE /api/v1/tags/{id}`, que la quita de todas las transacciones.
- c3c7f6e: Fusionar categorías (`POST /api/v1/categories/{id}/merge`): sus transacciones pasan a la destino, sus hijas se mudan con ella y la origen se archiva. `catalog` fusiona y publica `catalog.category.merged`; `transactions` lo escucha y mueve sus filas (ADR-0005). Los totales del listado traen `count`, que sirve de vista previa.
- 7341761: Mudar una subcategoría a otra madre de primer nivel, del mismo tipo y activa, con todas sus transacciones (`parentId` en `PATCH /api/v1/categories/{id}`). Una categoría de primer nivel no se muda (`ONLY_SUBCATEGORIES_MOVE`).
- bae3856: Etiquetas en las transacciones: `tags` al registrar o corregir (se crean al escribirlas; "Almuerzo" y "almuerzó" son la misma), en la respuesta y en el listado, y el filtro `?tag=` con totales de lo etiquetado. Hasta 10 distintas por transacción, sin `|`. Las transferencias no llevan etiquetas.
- 7e40781: Registrar una transacción (`POST /api/v1/transactions`) y leerla por su id (`GET /api/v1/transactions/{id}`), con el evento `transactions.transaction.created`. El monto viaja como string decimal y se guarda sin pérdida en `NUMERIC(18,2)`. Nueva regla de dominio: un método de pago archivado no se usa en transacciones nuevas (`PAYMENT_METHOD_ARCHIVED`). `catalog` expone `CatalogLookup` para que otros módulos comprueben categorías y métodos de pago.
- dd95904: Corregir (`PATCH /api/v1/transactions/{id}`), borrar lógicamente (`DELETE`) y restaurar sin plazo (`POST /api/v1/transactions/{id}/restore`) una transacción, con los eventos `transactions.transaction.updated`, `…deleted` y `…restored`. El tipo cambia junto con una categoría de ese tipo, la moneda solo cambia si se indica, y el origen no se corrige.
- e4e1a1b: Listado de transacciones (`GET /api/v1/transactions`): filtros por mes o rango, tipo, categoría (con sus subcategorías), método de pago y moneda; búsqueda sin mayúsculas ni tildes; paginación por cursor estable ante altas y bajas; y totales por moneda de todo lo filtrado. En el dominio, `totalsByCurrency` y `searchKey`, que ahora comparte `categoryNameKey`.
- 7e21ac9: Corregir (`PATCH /api/v1/transfers/{id}`), borrar lógicamente (`DELETE`) y restaurar sin plazo (`POST /api/v1/transfers/{id}/restore`) una transferencia, con los eventos `transactions.transfer.updated`, `…deleted` y `…restored`. En un cambio de moneda, corregir el monto enviado exige mandar también el recibido.
- 5a796fa: El listado `GET /api/v1/transactions` trae también las transferencias, mezcladas por fecha y marcadas con `kind` (`transaction` o `transfer`), con el filtro nuevo `?kind=`. Filtrar por tipo o categoría las deja fuera; por cuenta o moneda trae las que salen o llegan. Los totales siguen siendo solo de las transacciones.
- 6043ec6: Transferencias entre cuentas propias (`POST /api/v1/transfers`, `GET /api/v1/transfers/{id}`): plata que cambia de lugar sin contar como ingreso ni gasto. Con un cambio de moneda guarda los dos montos, copiados del voucher, sin convertir nunca. Pagar la tarjeta de crédito pasa a ser una transferencia; **Deuda** queda para préstamos, intereses y comisiones. Completa también las tablas de endpoints y errores de la ficha de `transactions`.

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
