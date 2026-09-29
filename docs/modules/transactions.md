# Módulo Transacciones (`transactions`)

> Ficha del módulo. Estado: **completo** (hito H3, versión 0.4.0), en la API y en la web. Transacciones con alta, corrección, borrado lógico y restaurar; listado con filtros, búsqueda, cursor y totales; transferencias entre cuentas propias; etiquetas; importación CSV en dos pasos. Flag **encendido**.

## Qué resuelve

Registrar cada movimiento de plata: ingresos, gastos, ahorro, inversión y pagos de deuda, y las transferencias entre las cuentas propias. Es el
núcleo del plan: el presupuesto (H4), las tarjetas (H5), los resúmenes (H6) y la captura desde el
celular (H7) calculan **sobre** las transacciones.

## Reglas de negocio

Decididas con el autor el 2026-09-24. No se cambian sin volver a preguntar. Viven en
`packages/domain/src/transactions/transaction-policy.ts`, con mutation testing al 100 %.

| Regla                        | Decisión                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipos                        | `INCOME`, `FIXED_EXPENSE`, `VARIABLE_EXPENSE`, `SAVING`, `INVESTMENT`, `DEBT` (glosario)                                                                                                                                                                                                                                                                                                 |
| Monto                        | **Siempre positivo**: el signo lo da el tipo. Un cero o un negativo se rechaza (`TRANSACTION_AMOUNT_NOT_POSITIVE`). Hasta 2 decimales, como todo `Money`                                                                                                                                                                                                                                 |
| Signo, para el saldo del mes | **Solo el ingreso suma.** Gastos, ahorro, inversión y deuda salen de lo disponible (`signedAmount`)                                                                                                                                                                                                                                                                                      |
| Qué es **gasto**             | **Fijo + variable.** La deuda (préstamos, intereses y comisiones) se muestra aparte (`countsAsExpense`)                                                                                                                                                                                                                                                                                  |
| Qué es **ahorro**            | **Ahorro + inversión**, para la tasa de ahorro = ahorro / ingresos: las dos son plata que no se consume (`countsAsSaving`)                                                                                                                                                                                                                                                               |
| Fecha                        | Fecha de negocio sin hora (`LocalDate`), **hasta hoy** en la hora de Lima. Una fecha futura se rechaza (`TRANSACTION_DATE_IN_FUTURE`): un pago programado se registra el día que ocurre, para que un resumen no muestre plata que no se movió                                                                                                                                            |
| Moneda                       | La indicada o, si no, **la del método de pago**. Si ninguno la dice (tarjeta bimoneda, efectivo, sin método) **se exige** (`TRANSACTION_CURRENCY_REQUIRED`): el dominio no supone soles. **Nunca se convierte**                                                                                                                                                                          |
| Categoría                    | **Del mismo tipo** que la transacción (`CATEGORY_TYPE_MISMATCH`) y **no archivada** para una transacción nueva (`CATEGORY_ARCHIVED`); una archivada sigue en las viejas                                                                                                                                                                                                                  |
| Subcategoría                 | **Opcional.** Vale una categoría de primer nivel aunque tenga subcategorías («Comida» sin decir «Delivery»), o una subcategoría (2026-09-25)                                                                                                                                                                                                                                             |
| Método de pago               | **Opcional** (2026-09-25). Si se indica, tiene que ser propio y **no estar archivado** (`PAYMENT_METHOD_ARCHIVED`); uno archivado sigue en las transacciones viejas                                                                                                                                                                                                                      |
| Descripción y comercio       | La descripción es **obligatoria** (hasta 200 caracteres); el comercio, opcional (hasta 80)                                                                                                                                                                                                                                                                                               |
| Origen (`source`)            | Lo pone la API, nunca quien llama: lo registrado desde la web es `MANUAL`. **No cambia al editar**                                                                                                                                                                                                                                                                                       |
| Categoría y método ajenos    | Si no son del usuario, **404**, no 403: no se confirma que existen (tarea 05)                                                                                                                                                                                                                                                                                                            |
| Borrar                       | **Lógico** (`deletedAt`). Las consultas normales excluyen las borradas. Restaurar **no tiene plazo** en la API: el aviso de «Deshacer» de unos segundos es cosa de la interfaz (2026-09-25)                                                                                                                                                                                              |
| Editar                       | **Siempre**, también en meses pasados: no existe el mes cerrado, y los resúmenes se calculan al consultar (decisión 6 de H3). El tipo se puede cambiar, **junto con** una categoría de ese tipo (2026-09-25)                                                                                                                                                                             |
| Listado                      | **Transacciones y transferencias mezcladas**, cada fila con `kind`. De la fecha más reciente a la más antigua y, en el mismo día, del id más nuevo al más viejo (UUIDv7 ordena por creación). **Sin fechas trae todo** (2026-09-25): la web manda el mes que muestra. Las borradas no aparecen; las de categorías o métodos archivados, sí                                               |
| Filtros                      | `month` o `from`/`to` (inclusivos), `type`, `categoryId` (**con sus subcategorías**), `paymentMethodId`, `currency` y `q`. Una categoría ajena no trae nada, sin decir si existe                                                                                                                                                                                                         |
| Búsqueda (`q`)               | Dentro de la descripción o el comercio, **sin distinguir mayúsculas ni tildes**. La ñ es otra letra: «ano» no encuentra «año». `%` y `_` se buscan como letras, no son comodines                                                                                                                                                                                                         |
| Paginación                   | Por **cursor opaco** (`nextCursor`), nunca por número de página: lo que se registre o se borre entre dos páginas no hace repetir ni saltar filas. `limit` por defecto 50; más de 100 se recorta a 100                                                                                                                                                                                    |
| Qué es **deuda**             | Pagar un **préstamo** (a un banco o a una persona) y lo que cuesta deber: **intereses, comisiones, membresía, desgravamen**. **Pagar la tarjeta de crédito no es deuda**: es una transferencia de la cuenta a la tarjeta, porque el gasto ya se contó al comprar (2026-09-27)                                                                                                            |
| Totales del listado          | **En la misma respuesta**, de todas las **transacciones** filtradas (no solo de la página; las transferencias no cuentan), **por moneda** y sin convertir: ingresos, gasto (fijo + variable), ahorro (ahorro + inversión), deuda y saldo (2026-09-25). Viven en `totalsByCurrency` (dominio). Cada moneda trae `count`: cuántas transacciones suma (vista previa al fusionar categorías) |
| Reglas al editar             | Se juzga la transacción **como quedaría**. Una fecha nueva no puede ser futura. Una categoría o un método archivados que ya tenía **siguen valiendo**; elegirlos ahora, no. Sin `currency`, la moneda **no cambia**, aunque cambie el método de pago                                                                                                                                     |

## Modelo de datos

`transactions(id, user_id, date, type, category_id, amount, currency, description, payment_method_id?, merchant?, source, capture_id?, created_at, updated_at, deleted_at?)`

- **`date` es `DATE`**, no `TIMESTAMPTZ`: es el día en que pasó. **`amount` es `NUMERIC(18,2)`**, con un `CHECK` de que sea positivo (`transactions_amount_positive`).
- **La base garantiza la categoría:** la clave foránea compuesta `(category_id, user_id, type)` → `categories(id, user_id, type)` hace imposible usar la categoría de otra persona o una de otro tipo, aunque alguien adivine su id. Lo mismo con el método de pago: `(payment_method_id, user_id)`.
- Una categoría o un método de pago **con transacciones no se puede borrar** (`NO ACTION`): se archiva.
- `source`: `MANUAL`, `IOS_SHORTCUT`, `ANDROID_AUTOMATION`, `IMPORT`.
- `capture_id` queda **sin clave foránea** hasta H7, cuando exista la tabla de capturas.
- Índice `(user_id, date)`, por el que se lista y se filtra siempre; y los de `category_id` y `payment_method_id`, para que comprobar si una categoría o un método tienen transacciones no recorra la tabla.
- **El listado va en SQL parametrizado** (`Prisma.sql`), no con `findMany`: la búsqueda sin tildes necesita `lower(translate(…))`, que Prisma no expresa. La tabla de acentos es **una sola**, `ACCENT_FOLD_FROM`/`ACCENT_FOLD_TO` del dominio, que usan tanto `searchKey` como la consulta.
- **Lo que la base no puede exigir** queda para el dominio: que la fecha no sea futura (la base no sabe qué día es "hoy" para el usuario) y que la categoría no esté archivada.

## Transferencias entre cuentas propias

Plata que **cambia de lugar** sin ser ingreso ni gasto: del banco a Yape, de soles a dólares, de la cuenta a la tarjeta. Decidido con el autor el 2026-09-27; viven en `packages/domain/src/transactions/transfer-policy.ts`, con mutation testing al 100 %.

| Regla              | Decisión                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qué es             | Una **entidad propia** (`transfers`), no un tipo de transacción: tiene cuenta de origen y de destino, y no tiene categoría                                                                                                                                                                                                                                                                      |
| Totales            | **No cuenta** en ingresos, gastos, ahorro, deuda ni tasa de ahorro                                                                                                                                                                                                                                                                                                                              |
| En el listado      | **Mezcladas con las transacciones** en `GET /transactions`, por fecha, cada fila con `kind` (`transaction` o `transfer`); `?kind=` deja solo unas u otras. Filtrar por `type` o `categoryId` las deja fuera; por `paymentMethodId` trae las que salen **o** llegan a esa cuenta, y por `currency`, las que mueven esa moneda al salir **o** al llegar. `q` busca en su descripción (2026-09-28) |
| Cuentas            | Dos métodos de pago **propios, distintos** (`TRANSFER_SAME_ACCOUNT`) y **activos** (`PAYMENT_METHOD_ARCHIVED`)                                                                                                                                                                                                                                                                                  |
| Moneda             | **La ponen las cuentas:** una en soles solo manda o recibe soles (`TRANSFER_CURRENCY_MISMATCH`). Una que acepta las dos (efectivo, tarjeta bimoneda) toma la indicada; si no hay ninguna, se exige la de salida, y la de llegada es la misma                                                                                                                                                    |
| Misma moneda       | Llega lo mismo que salió; un monto recibido distinto se rechaza (`TRANSFER_RECEIVED_AMOUNT_MISMATCH`)                                                                                                                                                                                                                                                                                           |
| Cambio de moneda   | **Dos montos**, lo que sale y lo que llega, **copiados del voucher**; el recibido es obligatorio (`TRANSFER_RECEIVED_AMOUNT_REQUIRED`). **Nunca se convierte**. El tipo de cambio se deriva de los dos montos, no se guarda                                                                                                                                                                     |
| Montos y fecha     | Positivos (`TRANSFER_AMOUNT_NOT_POSITIVE`), hasta 2 decimales, y fecha hasta hoy en Lima, como en las transacciones                                                                                                                                                                                                                                                                             |
| Tarjeta de crédito | Comprar con la tarjeta es un **gasto**; **pagarla** es una transferencia cuenta → tarjeta. En H5, lo que se debe = compras − transferencias a la tarjeta                                                                                                                                                                                                                                        |
| Corregir           | Como las transacciones: se juzga **como quedaría**; una cuenta archivada que ya tenía sigue valiendo. En un cambio de moneda, **corregir el monto enviado exige mandar también el recibido**: cambiar uno solo movería el tipo de cambio sin que nadie lo diga (2026-09-28). Si el destino pasa a ser de la moneda de origen, llega lo mismo que salió                                          |
| Borrar             | Lógico, y se restaura **sin plazo**, como las transacciones                                                                                                                                                                                                                                                                                                                                     |

**Tabla** `transfers(id, user_id, date, from_payment_method_id, to_payment_method_id, amount, currency, received_amount, received_currency, description, source, created_at, updated_at, deleted_at?)`. Las dos cuentas van con claves foráneas compuestas `(método, user_id)`, como en las transacciones. La base repite las reglas como red: montos positivos, cuentas distintas y, en la misma moneda, el mismo monto.

**Después de H3:** el saldo por cuenta (saldo inicial + transacciones + transferencias), para auditar contra la app del banco.

## Etiquetas

Una segunda forma de mirar las transacciones, además de la categoría: por momento del día (`almuerzo`), por viaje (`viaje-cusco`), por con quién. La **categoría** dice qué es (una sola, y es lo que se presupuesta); las **etiquetas**, desde qué ángulo mirarla. Decidido con el autor el 2026-09-28; las reglas viven en `packages/domain/src/transactions/tag-policy.ts`.

| Regla        | Decisión                                                                                                                                                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crear        | **Al escribirlas:** `tags: [...]` al registrar o corregir. La que no existe en la cuenta se crea                                                                                                                                                                                 |
| Mismo nombre | Sin distinguir mayúsculas ni tildes (`searchKey`): "Almuerzo" y "almuerzó" son la misma, y se queda la **primera escritura**. La ñ es otra letra                                                                                                                                 |
| Datos        | **Solo el nombre** (hasta 40 caracteres), sin color ni ícono                                                                                                                                                                                                                     |
| Límites      | Hasta **10 distintas** por transacción (`TOO_MANY_TAGS`). Sin nombre vacío ni `\|`, que separa las etiquetas en el CSV (`TAG_NAME_INVALID`)                                                                                                                                      |
| Corregir     | `tags` **reemplaza** la lista completa; `[]` las quita todas. Sin `tags`, no cambian                                                                                                                                                                                             |
| Listado      | `?tag=` trae las transacciones con esa etiqueta y **los totales siguen al filtro** ("cuánto gasté en almuerzos"). Deja fuera las transferencias                                                                                                                                  |
| Quién        | **Solo las transacciones**; las transferencias no llevan etiquetas                                                                                                                                                                                                               |
| Borrar una   | `DELETE /tags/{id}` la quita de todas las transacciones, que quedan intactas; sin archivar                                                                                                                                                                                       |
| Renombrar    | `PATCH /tags/{id}`. Si el nombre nuevo es el de **otra** etiqueta de la cuenta (sin mayúsculas ni tildes), **las fusiona**: sus transacciones quedan con la otra, que toma la escritura mandada, y esta desaparece. Una transacción que tenía las dos queda con una (2026-09-28) |
| Listar       | `GET /tags`, por nombre, cada una con cuántas transacciones **vigentes** la llevan                                                                                                                                                                                               |

**Tablas:** `tags(id, user_id, name, name_key, …)` con índice único `(user_id, name_key)`, y `transaction_tags(transaction_id, tag_id, user_id)`, con **claves foráneas compuestas** `(transaction_id, user_id)` y `(tag_id, user_id)`: una transacción no puede llevar la etiqueta de otra cuenta. Borrar una etiqueta borra sus vínculos (`CASCADE`). `name_key` la calcula la aplicación con `searchKey`, así que la tabla de acentos sigue siendo una sola. La transacción, sus etiquetas nuevas y sus vínculos se guardan en **una sola transacción de la base**, y las etiquetas se crean con `createMany … skipDuplicates`: dos altas a la vez con la misma etiqueta nueva crean una sola.

## Importación CSV

El formato oficial está en [`transactions-import-format.md`](transactions-import-format.md). En el dominio viven el lector (`readCsv`, `packages/domain/src/text/csv.ts`) y la interpretación de cada fila con su huella (`interpretImportRow` e `importFingerprints`, `packages/domain/src/transactions/import-row.ts`). **Vista previa** (`POST /api/v1/transactions/import/preview`, `PreviewImport`): el archivo viaja como texto en JSON y **no se guarda nada**. Aplica los límites (1 MB en bytes, 5 000 filas → **413**), interpreta cada fila con el dominio y responde:

- cuántas transacciones y transferencias entrarían, y **cada problema** con su línea, columna y código;
- las líneas **ya importadas**, por la huella de su fila (`import_key`: SHA-256 de la huella del dominio, con índice único `(user_id, import_key)` en `transactions` y `transfers`), aunque se hayan corregido después;
- las **categorías** y los **métodos de pago** (o cuentas de destino) que no existen o están archivados, con las líneas que los usan, para resolverlos al confirmar;
- las columnas ignoradas y las etiquetas nuevas.

Lo que depende de la cuenta se juzga aquí: las monedas y montos de una transferencia cuyas dos cuentas existen, y los largos máximos. El **cuerpo JSON** de toda la API admite hasta **2 MB** (`JSON_BODY_LIMIT`), para que quepa un CSV de 1 MB escapado en JSON.

**Confirmación** (`POST /api/v1/transactions/import`, `ConfirmImport`): el mismo CSV, más una **decisión** por cada categoría y método de pago que la vista previa marcó como faltante o archivado. Entra **todo o nada**:

1. Vuelve a leer el archivo con los mismos límites. Si alguna fila tiene un problema del dominio, responde `IMPORT_HAS_PROBLEMS` sin tocar nada.
2. Omite las filas ya importadas (por su `import_key`) y las devuelve en `alreadyImported`.
3. **Valida todas las decisiones antes de escribir**:
   - Categoría: `create` (solo si no existe; crea la categoría padre una sola vez aunque varias subcategorías la necesiten), `use` con un `categoryId` propio, vigente y del mismo tipo, o `restore` (solo si está archivada; restaura también el padre archivado).
   - Método de pago: `create` con las mismas reglas que al crearlo a mano (`kind`, `institution`, `last4`, `currency`), `use` con un `paymentMethodId` propio y vigente, o `restore`.
   - Una categoría o método faltante sin decisión responde `IMPORT_UNRESOLVED`; una decisión que no corresponde (crear algo que existe, usar algo ajeno o archivado), `IMPORT_DECISION_INVALID`. Un id de otra cuenta se trata igual que uno que no existe.
   - Las transferencias se juzgan con las cuentas **finales**: si dos alias terminan en la misma cuenta, `TRANSFER_SAME_ACCOUNT`; las monedas se comprueban con las de los métodos que se van a crear.
4. Aplica las decisiones y guarda las filas en **una sola transacción de base de datos** (`PrismaImportWriter`, en lotes de 500), con `source: IMPORT` e `import_key`. Si otra importación guardó la misma fila a la vez, el índice único lo detecta y responde **409** `IMPORT_CONFLICT` sin guardar nada: volver a mandarlo omite lo que ya entró.
5. Publica `transaction.created` y `transfer.created` por cada fila, después de guardar.

Responde **201** con `{ transactions, transfers, alreadyImported, createdCategories, createdPaymentMethods, restored }`.

> Las categorías y métodos se crean con los casos de uso de `catalog` (su API pública), fuera de la transacción de base de datos: si la escritura de las filas falla, lo creado queda y una nueva vista previa ya lo muestra como existente.

## En la web

`/transactions` (tarea 09 de H3) muestra un mes: totales por moneda arriba y los movimientos agrupados por día, del más reciente al más viejo, con «Cargar más» siguiendo el cursor.

- **Los filtros viven en la URL** (`month`, `show`, `categoryId`, `tag`, `q`): filtrar no recarga la página, y el botón atrás deshace un filtro o un cambio de mes. La búsqueda se aplica 300 ms después de dejar de escribir y **reemplaza** la entrada del historial, para no dejar una por letra.
- **El mes por defecto es el de hoy en Lima**, calculado por el dominio (`today`), no con `new Date()` en un componente.
- **Los totales son de todo lo filtrado**, no de la página cargada: los calcula la API. Una tarjeta por moneda, sin convertir.
- **Los montos se muestran sin pasar por `number`** (`formatMoney` trabaja sobre el texto). El signo lo da el tipo: solo el ingreso suma.
- Los nombres de categorías y métodos de pago se piden **con los archivados**: un mes viejo puede usarlos y tiene que seguir mostrándolos. El filtro de categoría los marca como «(archivada)».
- Los meses salen en español de Perú (`es-PE`): «setiembre», no «septiembre».
- La caché de la web **se vacía al terminar la sesión**, para que quien entre después no vea ni por un instante los datos del anterior.

**Registrar y corregir** (`/transactions/new`, `/transactions/{id}`, `/transactions/transfers/{id}`):

- **Formulario rápido:** monto, categoría, método de pago y fecha (hoy en Lima, sin fechas futuras). Descripción, comercio y etiquetas van plegados en «Más detalles». Un gasto se registra con cinco toques la primera vez y cuatro después, porque el método de pago se recuerda.
- **El tipo sale de la categoría**, agrupadas por tipo con el gasto variable primero y sus subcategorías debajo («Comida › Mercado»). Solo se ofrecen las activas; al corregir, la que ya tenía el movimiento sigue a la vista aunque esté archivada.
- **El monto se lee con `parseAmount` del dominio** y se manda como texto (`"1234.50"`): acepta `1,234.50` o `S/ 25`, rechaza un tercer decimal (no redondea) y `1.234,50` por ambiguo.
- **Descripción propuesta:** si queda vacía, se usa el nombre de la categoría, o «Transferencia <origen> → <destino>» (decidido con el autor el 2026-09-28).
- **Moneda:** la da el método de pago. Se recuerda el último método usado **en ese navegador** (`localStorage`, solo una comodidad). Sin método, o con uno bimoneda, hay que elegir la moneda: **no hay valor por defecto**, nunca se suponen soles.
- **Transferencias:** desde y hacia una cuenta propia. Si la moneda cambia, se pide el monto recibido, copiado del voucher: nunca se convierte.
- **Errores junto a su campo** (`aria-describedby`), traducidos desde el código de la API. El botón se desactiva mientras se guarda: no se envía dos veces.
- **Borrar no pide confirmación:** muestra «Deshacer» durante 6 segundos, que llama a `restore` (decisión 6 de H3). Se borra desde la lista o desde la corrección.

**Importar un CSV** (`/transactions/import`, enlazada desde la lista):

1. **Elegir el archivo.** La web lo lee como texto y lo manda en el JSON; no se guarda en ningún sitio. Un archivo de más de 1 MB o vacío se rechaza antes de enviarlo.
2. **Vista previa.** Cuántas transacciones y transferencias entrarían, las filas ya importadas (se omiten), las etiquetas nuevas y las columnas ignoradas. **Si hay problemas**, se listan por línea y columna (los primeros 100), traducidos desde su código, y no se ofrece importar: entra todo o nada, así que hay que corregir el archivo.
3. **Decisiones.** Por cada categoría o método pendiente se propone **crear lo que falta y restaurar lo archivado**, y se puede cambiar por «usar otro» (una categoría activa del mismo tipo, o un método activo). Un método nuevo exige elegir tipo y moneda, y se revisa con `assertValidPaymentMethod` del dominio antes de mandar (últimos 4 obligatorios en tarjeta y nunca más de 4; el efectivo no tiene banco; cuentas y billeteras guardan una sola moneda).
4. **Confirmar.** Todo o nada. Tras importar se vuelven a pedir movimientos, categorías, métodos y etiquetas. Volver a importar el mismo archivo no duplica: la vista previa dice que ya se importó.

## API pública para otros módulos

`TransactionsLookup` (exportado por `index.ts`) es lo que leen de este módulo el presupuesto (H4) y, más adelante, los reportes, las tarjetas y los resúmenes, sin tocar sus tablas ni importar su interior. Igual que `CatalogLookup` en `catalog`:

- `totalsByCategory(userId, desde, hasta)`: totales por categoría (la de cada transacción, sin subir a su madre), tipo y moneda, entre dos fechas incluidas.
- Solo transacciones **vigentes** (las borradas no cuentan) y **nunca transferencias**. Nunca convierte moneda. Exige el `userId`, que va dentro de la consulta.

Devuelve lo mínimo a propósito: quien consulta no queda atado a la forma de las entidades.

## Eventos de dominio

Se publican **después de guardar**, esperando a los oyentes, y llevan solo ids (ADR-0004). Nadie los escucha todavía: existen para que el presupuesto (H4), las tarjetas (H5) y los resúmenes (H6) no tengan que tocar este módulo.

| Evento                              | Cuándo                                 | Datos                       |
| ----------------------------------- | -------------------------------------- | --------------------------- |
| `transactions.transaction.created`  | Se registró una transacción            | `{ userId, transactionId }` |
| `transactions.transaction.updated`  | Se corrigió                            | `{ userId, transactionId }` |
| `transactions.transaction.deleted`  | Se borró (lógicamente): deja de contar | `{ userId, transactionId }` |
| `transactions.transaction.restored` | Se deshizo el borrado: vuelve a contar | `{ userId, transactionId }` |
| `transactions.transfer.created`     | Se registró una transferencia          | `{ userId, transferId }`    |
| `transactions.transfer.updated`     | Se corrigió una transferencia          | `{ userId, transferId }`    |
| `transactions.transfer.deleted`     | Se borró (lógicamente)                 | `{ userId, transferId }`    |
| `transactions.transfer.restored`    | Se deshizo el borrado                  | `{ userId, transferId }`    |

Restaurar también se anuncia, para que quien lleve una cuenta con los otros tres no se desincronice. Borrar una ya borrada responde 404 y restaurar una vigente no hace nada: ninguno anuncia dos veces.

- **Escucha:** `catalog.category.merged`, para pasar **todas** las transacciones de la categoría fusionada (borradas incluidas) a la destino; si trae `tag`, además les agrega esa etiqueta (salvo a las que ya tienen 10) ([ADR-0005](../adr/0005-fusionar-categorias-por-evento.md)).

## Dependencias

Comprueba la categoría y el método de pago, y obtiene las subcategorías para filtrar, con `CatalogLookup`, de la API pública de `catalog`, a través de su puerto `CatalogReader`. No lee las tablas del catálogo.

## Endpoints

Exigen una sesión (`Authorization: Bearer <token de acceso>`): un token personal recibe **403**, porque el celular registra por `/captures` (H7). Filtran por el `userId` del token y responden **404** con el flag apagado. Detalle en `/api/v1/openapi.json`.

| Método   | Ruta                                  | Qué hace                                                                                                                                       |
| -------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/transactions`                | Lista transacciones y transferencias con filtros, búsqueda, cursor y totales por moneda: `{ items, nextCursor, totals }`, cada fila con `kind` |
| `POST`   | `/api/v1/transactions/import/preview` | Qué pasaría al importar un CSV, sin guardar nada. **200**                                                                                      |
| `POST`   | `/api/v1/transactions/import`         | Importa el CSV con las decisiones sobre lo que falta, todo o nada. **201** con lo que entró                                                    |
| `POST`   | `/api/v1/transactions`                | Registra una transacción con `source: MANUAL`. **201** con la transacción                                                                      |
| `GET`    | `/api/v1/transactions/{id}`           | Devuelve una. **404** si no existe, es de otra cuenta o está borrada                                                                           |
| `PATCH`  | `/api/v1/transactions/{id}`           | Corrige lo que se mande, menos el origen. **404** si no existe, es ajena o está borrada                                                        |
| `DELETE` | `/api/v1/transactions/{id}`           | Borrado lógico. **204**; **404** si no existe, es ajena o ya estaba borrada                                                                    |
| `POST`   | `/api/v1/transactions/{id}/restore`   | Deshace el borrado, sin plazo. **200** con la transacción; con una vigente, la devuelve igual                                                  |
| `POST`   | `/api/v1/transfers`                   | Registra una transferencia entre cuentas propias con `source: MANUAL`. **201**                                                                 |
| `GET`    | `/api/v1/transfers/{id}`              | Devuelve una. **404** si no existe, es de otra cuenta o está borrada                                                                           |
| `PATCH`  | `/api/v1/transfers/{id}`              | Corrige lo que se mande, menos el origen. **404** si no existe, es ajena o está borrada                                                        |
| `DELETE` | `/api/v1/transfers/{id}`              | Borrado lógico. **204**; **404** si no existe, es ajena o ya estaba borrada                                                                    |
| `POST`   | `/api/v1/transfers/{id}/restore`      | Deshace el borrado, sin plazo. **200** con la transferencia                                                                                    |
| `GET`    | `/api/v1/tags`                        | Etiquetas de la cuenta por nombre, con cuántas transacciones vigentes las llevan                                                               |
| `PATCH`  | `/api/v1/tags/{id}`                   | Renombra; con el nombre de otra etiqueta, las fusiona. **200** con la que queda                                                                |
| `DELETE` | `/api/v1/tags/{id}`                   | La quita de todas las transacciones. **204**                                                                                                   |

El monto viaja como **string decimal** (`"25.90"`) y la fecha como `YYYY-MM-DD`. Un monto como número JSON se rechaza con `VALIDATION_FAILED`: ya perdió precisión antes de llegar.

### Errores

| `code`                              | Estado | Cuándo                                                                                         |
| ----------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `INVALID_AMOUNT`                    | 422    | El monto tiene más de 2 decimales: se rechaza, no se redondea                                  |
| `TRANSACTION_AMOUNT_NOT_POSITIVE`   | 422    | Monto cero o negativo                                                                          |
| `TRANSACTION_DATE_IN_FUTURE`        | 422    | Fecha posterior a hoy en la hora de Lima                                                       |
| `TRANSACTION_CURRENCY_REQUIRED`     | 422    | Sin moneda, y el método no tiene una sola (o no hay método)                                    |
| `CATEGORY_TYPE_MISMATCH`            | 422    | La categoría es de otro tipo                                                                   |
| `CATEGORY_ARCHIVED`                 | 422    | La categoría está archivada                                                                    |
| `PAYMENT_METHOD_ARCHIVED`           | 422    | El método de pago está archivado                                                               |
| `CATEGORY_NOT_FOUND`                | 404    | La categoría no existe o es de otra cuenta                                                     |
| `PAYMENT_METHOD_NOT_FOUND`          | 404    | El método de pago no existe o es de otra cuenta                                                |
| `TRANSACTION_NOT_FOUND`             | 404    | La transacción no existe, es de otra cuenta o está borrada                                     |
| `INVALID_CURSOR`                    | 422    | El cursor no es uno que haya dado la API: se pide la primera página                            |
| `IMPORT_FILE_TOO_LARGE`             | 413    | El CSV pesa más de 1 MB                                                                        |
| `IMPORT_TOO_MANY_ROWS`              | 413    | El CSV tiene más de 5 000 filas                                                                |
| `MALFORMED_CSV`                     | 422    | El CSV no está bien formado (una comilla sin cerrar)                                           |
| `IMPORT_COLUMNS_MISSING`            | 422    | Al CSV le faltan columnas obligatorias                                                         |
| `IMPORT_HAS_PROBLEMS`               | 422    | Al confirmar, alguna fila tiene un problema: no se guarda nada                                 |
| `IMPORT_UNRESOLVED`                 | 422    | Al confirmar, falta la decisión sobre una categoría o método de pago                           |
| `IMPORT_DECISION_INVALID`           | 422    | Una decisión no corresponde: crear algo que existe, usar algo ajeno, archivado o de otro tipo  |
| `IMPORT_CONFLICT`                   | 409    | Otra importación guardó a la vez alguna de las filas; volver a mandarlo omite las ya guardadas |
| `TAG_NAME_INVALID`                  | 422    | Una etiqueta vacía o con `\|`                                                                  |
| `TOO_MANY_TAGS`                     | 422    | Más de 10 etiquetas distintas en una transacción                                               |
| `TAG_NOT_FOUND`                     | 404    | La etiqueta no existe o es de otra cuenta                                                      |
| `TAG_NAME_TAKEN`                    | 409    | Otra petición creó al mismo tiempo una etiqueta con ese nombre; volver a intentar la fusiona   |
| `TRANSFER_SAME_ACCOUNT`             | 422    | Origen y destino son la misma cuenta                                                           |
| `TRANSFER_CURRENCY_MISMATCH`        | 422    | Una moneda que la cuenta no maneja                                                             |
| `TRANSFER_RECEIVED_AMOUNT_REQUIRED` | 422    | Cambio de moneda sin el monto recibido                                                         |
| `TRANSFER_RECEIVED_AMOUNT_MISMATCH` | 422    | En la misma moneda, un monto recibido distinto del enviado                                     |
| `TRANSFER_AMOUNT_NOT_POSITIVE`      | 422    | Un monto de transferencia cero o negativo                                                      |
| `TRANSFER_NOT_FOUND`                | 404    | La transferencia no existe, es de otra cuenta o está borrada                                   |

## Estado

- Feature flag: **`FEATURE_TRANSACTIONS=true`** desde el cierre de H3 (0.4.0).
- Escenarios: [`features/transactions/`](../../features/transactions/). `transactions.feature` se ejecuta entero con `pnpm test:bdd` (salvo la tasa de ahorro, que es de H6); `transfers`, `tags` e `import` siguen **`@pendiente`**, sin pasos todavía (decisión 7 de H3, 2026-09-29). Sus reglas están cubiertas por las pruebas unitarias y de integración.
- Web: `/transactions` con la lista (tarea 09, PR A1), el formulario para registrar, corregir y borrar con «Deshacer» (PR A2) y la importación CSV (PR B). Con el flag apagado la pantalla responde 404, igual que la API.
