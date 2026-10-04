# Módulo Bandeja (`capture`)

> Ficha del módulo. Estado: **en construcción** (hito H7). Hoy existen el módulo y sus tablas; los parsers, las reglas, los endpoints y las pantallas llegan con las tareas siguientes. Flag **apagado**.

## Qué resuelve

Registrar un gasto **desde el teléfono sin abrir la web**. Un atajo de iPhone o una automatización de Android mandan lo que pasó (el monto, el comercio, la tarjeta, o el texto de la notificación del banco) con un **token personal**; la captura entra a una **bandeja de revisión** y desde la web se confirma (sale la transacción) o se descarta. Sin esto, cada gasto pequeño depende de acordarse de anotarlo después, y los que se olvidan dejan incompletos el presupuesto y el resumen.

## Reglas de negocio

Decididas con el autor el **2026-10-03**:

| Tema                        | Regla                                                                                                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fuentes                     | **Yape, BCP, Interbank, Lemon y Plin**. Primero Yape y BCP, después Interbank, Lemon y Plin. Banco Falabella, BBVA o Scotiabank vendrían después, con el mismo patrón: **agregar un banco = fixtures + parser**. Los fixtures salen de notificaciones reales **anonimizadas** |
| Campos o texto              | **Mandan los campos** (monto, comercio, tarjeta); el texto de la notificación completa lo que falte. Si los dos traen montos distintos, la captura queda con aviso para revisarla                                                                                             |
| Moneda sin indicar          | **La del método de pago** si tiene una sola; si es bimoneda o no se reconoce, la captura queda **sin moneda** y se elige en la bandeja. Nunca se suponen soles                                                                                                                |
| Método de pago              | Por los **últimos 4** si coinciden con un solo método; si no, el texto de la tarjeta contra el **alias**, sin tildes ni mayúsculas. Con dos candidatos o ninguno, se elige en la bandeja                                                                                      |
| Fecha                       | El día del instante en que pasó, **en Lima**. **Siempre se guarda:** un instante futuro queda en **hoy** con aviso, y uno de **más de 30 días** se guarda con aviso. Se corrige al confirmar                                                                                  |
| Duplicados                  | Mismo monto y comercio en **±2 minutos**, contra **otras capturas y contra transacciones** ya registradas. Queda como duplicada, marcada en la bandeja, y **se puede confirmar igual**                                                                                        |
| Idempotencia                | `Idempotency-Key` **opcional**: sin ella, la API arma una con monto + comercio + instante + fuente. La misma clave con otro cuerpo devuelve la **respuesta original (200)**, sin error                                                                                        |
| Qué es cada notificación    | Por defecto **gasto variable**; un «te yapearon» o un abono es **ingreso**; una operación **rechazada** entra a la bandeja **marcada** (no se descarta sola). El tipo se corrige al revisar                                                                                   |
| Directo a transacciones     | **Nunca:** toda captura pasa por la bandeja, también la del atajo manual de iPhone («Registrar gasto»)                                                                                                                                                                        |
| Corregir antes de confirmar | **Todo:** monto, moneda, fecha, tipo, categoría, método, comercio y descripción. Se confirma **de a una o varias a la vez** («Confirmar las 5 completas»)                                                                                                                     |
| Tipo y categoría            | La categoría sugerida o elegida es **del mismo tipo que la captura**, como en una transacción: si se cambia el tipo en la bandeja, la categoría se limpia                                                                                                                     |
| Descartar                   | Con **«Deshacer»**. Las descartadas se ven en un filtro y **se borran del todo a los 90 días**                                                                                                                                                                                |
| Reglas de categorización    | **Todas se comparan igual:** contra el **comercio** y, si la captura no trae comercio, contra el texto de la notificación; **«contiene», sin tildes ni mayúsculas**. Si aplican dos, gana la de **mayor prioridad**; con la misma, la de **patrón más largo**                 |
| Patrón y prioridad          | **Una regla por patrón** y cuenta («Tambo» y «TAMBO» son la misma). La prioridad es un **entero de 0 en adelante**, 0 por defecto                                                                                                                                             |
| Aprender al confirmar       | Se **ofrece «Recordar para este comercio»** (una casilla): crea la regla, o actualiza la del mismo patrón, solo si se marca                                                                                                                                                   |
| Texto crudo                 | **Se ve completo** en la bandeja mientras la captura está por revisar; **se borra al confirmar** (queda lo interpretado). El de una descartada se va con ella a los 90 días                                                                                                   |
| Tope de caudal              | **30 capturas por minuto**                                                                                                                                                                                                                                                    |
| Capturas en el resumen      | El resumen mensual dice **cuántas hay sin revisar de ese mes y su monto por moneda**, con enlace a la bandeja. Las que no tienen monto se cuentan pero no suman                                                                                                               |
| Dónde se ve                 | **«Bandeja»** en el menú, con contador, y un aviso en «Inicio» cuando hay pendientes                                                                                                                                                                                          |
| Dispositivos                | iPhone con **Atajos** y Android con **MacroDroid**; las guías se dan por buenas cuando se prueban en los teléfonos del autor                                                                                                                                                  |

**Nunca datos sensibles de tarjeta:** de una tarjeta solo se guardan sus últimos 4 dígitos. Si una notificación trajera un número completo, el parser lo enmascara **antes** de guardar, también en el texto crudo.

### Cómo se lee una notificación

`parseNotification` en [`@sol-a-sol/capture-parsers`](../../packages/capture-parsers/), decidido con el autor el **2026-10-03**:

- **Se tapa toda tira de 13 o más dígitos** (juntos o en grupos de 3 o más, separados por espacio o guion) y queda solo con sus últimos 4 (`••••1111`), con el aviso `CARD_NUMBER_MASKED`. Las tarjetas tienen de 13 a 19 dígitos; tapar también un número de cuenta o un CCI de 20 no hace daño, dejar pasar una tarjeta sí. Si todos los números tapados terminan igual, esos 4 dígitos son los de la tarjeta.
- El texto se lee con el parser de su fuente. **Si ninguna fuente lo reconoce**, se lee como **gasto** con el monto que se encuentre y el aviso `UNKNOWN_SOURCE`: no se adivina un ingreso por palabras sueltas, se corrige en la bandeja.
- **Nunca lanza:** sin monto, con montos distintos o ilegible, el monto queda nulo con su aviso. Un parser que falla cae a la lectura genérica con `PARSER_FAILED`.
- Una operación **rechazada** no es otro tipo: es un gasto o un ingreso con el aviso `OPERATION_REJECTED`.

| Aviso                | Qué significa                                                             |
| -------------------- | ------------------------------------------------------------------------- |
| `UNKNOWN_SOURCE`     | Ninguna fuente conocida reconoció el texto: se leyó solo el monto         |
| `PARSER_FAILED`      | El parser de la fuente falló (quizás cambió el formato)                   |
| `AMOUNT_NOT_FOUND`   | No hay monto pegado a una moneda                                          |
| `AMBIGUOUS_AMOUNT`   | Hay montos distintos y no se elige uno                                    |
| `INVALID_AMOUNT`     | El monto no se puede leer (por ejemplo, con más de 2 decimales)           |
| `CARD_NUMBER_MASKED` | Traía un número de tarjeta completo: quedan solo sus últimos 4            |
| `OPERATION_REJECTED` | El banco rechazó la operación                                             |
| `AMOUNT_MISMATCH`    | El campo y la notificación dicen montos distintos: manda el campo         |
| `FUTURE_DATE`        | El instante cae en un día futuro: quedó en hoy                            |
| `OLD_DATE`           | Pasó hace más de 30 días                                                  |
| `CURRENCY_MISMATCH`  | El monto dice una moneda y el método reconocido tiene otra                |
| `PROCESSING_FAILED`  | No se pudo buscar método, reglas o duplicados; la captura se guardó igual |

### Cómo se interpreta una captura

Funciones puras en `@sol-a-sol/domain` (`packages/domain/src/capture/`). Lo que no dicen las 18 decisiones se decidió con el autor el **2026-10-04**:

- **Leer el pedido** (`readCaptureRequest`): mandan los campos y el texto completa lo que falte. Un monto del campo que no se puede leer (o que no es mayor que cero) se avisa con `INVALID_AMOUNT` y se usa el del texto. Si el campo trae el mismo monto sin moneda, la moneda sale del texto; si dice otro monto u otra moneda, manda el campo con `AMOUNT_MISMATCH`. Los últimos 4 salen del campo `card` si trae **un solo** grupo de 4 dígitos; si no, los del texto. Un «te yapearon» o un abono es ingreso; todo lo demás, gasto variable.
- **Fecha** (`captureBusinessDate`): el día en Lima. Un **día** futuro queda en hoy con `FUTURE_DATE`; unos minutos adelantados dentro del mismo día no avisan. Más de 30 días atrás avisa con `OLD_DATE`; justo 30, no.
- **Método de pago** (`matchPaymentMethod`): por los últimos 4 si coinciden con uno solo; si no, el texto de la tarjeta **igual** al alias sin tildes ni mayúsculas («BCP» no reconoce «Visa BCP»). Dos candidatos o ninguno: se elige en la bandeja. **Los archivados no cuentan.**
- **Moneda** (`resolveCaptureCurrency`): la del monto o, si no dice, la del método con una sola moneda. Si el monto dice una y el método otra, se respeta la del monto con `CURRENCY_MISMATCH`.
- **Categoría sugerida** (`suggestCategory`): solo las reglas cuya categoría es **del mismo tipo** que la captura y no está archivada; las demás se saltan. Mayor prioridad, luego patrón más largo, luego orden alfabético del patrón (para que no dependa del orden de llegada).
- **Duplicados** (`findDuplicate`): mismo monto, misma moneda y mismo comercio sin tildes ni mayúsculas. Contra **otra captura**, en ±2 minutos **con los bordes** (2:00 sí, 2:01 no), sin contar las descartadas. Contra una **transacción**, que no tiene hora, el **mismo día**; si la transacción no tiene comercio, se compara con su descripción. **Sin comercio, sin monto o sin moneda no se marca nada.** Primero se busca entre las capturas.
- **Confirmar** (`transactionFromCapture`): una pendiente o una duplicada, con monto, moneda, categoría y descripción; **sin descripción se usa el comercio**. Lo que falta se dice con su error (`CAPTURE_AMOUNT_MISSING`, `CAPTURE_CURRENCY_MISSING`, `CAPTURE_CATEGORY_MISSING`, `CAPTURE_DESCRIPTION_MISSING`); una confirmada o descartada, `CAPTURE_NOT_PENDING`. La fecha y el monto siguen las reglas de toda transacción.

## Modelo de datos

| Tabla                  | Qué guarda                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `captures`             | Una captura: de dónde llegó (`IOS_SHORTCUT` o `ANDROID_AUTOMATION`), el pedido crudo (`raw_payload`, JSON), el instante (`occurred_at`, UTC) y su día en Lima (`business_date`), lo entendido o corregido (tipo, monto `NUMERIC(18,2)`, moneda, comercio, últimos 4, descripción, categoría, método), sus avisos, su estado y su clave de idempotencia |
| `categorization_rules` | Una regla: el patrón como se escribió y su clave sin tildes ni mayúsculas (`pattern_key`, con `searchKey`), la categoría que sugiere y su prioridad                                                                                                                                                                                                    |

Una captura está **por revisar** (`PENDING`), **duplicada** (`DUPLICATE`), **confirmada** (`CONFIRMED`) o **descartada** (`DISCARDED`). Una transacción creada desde una captura lleva su `capture_id`, y la captura, su `transaction_id`.

La base exige por su cuenta, aunque alguien se salte la aplicación:

- **Todo es de la misma cuenta:** capturas y reglas llevan su propio `user_id` y claves foráneas compuestas hacia la categoría, el método y la transacción, como `installment_plans` y `goal_contributions`. La categoría de una captura, además, **del mismo tipo** que la captura, como en `transactions`; la de una regla, de cualquier tipo (la regla no tiene uno propio).
- **La clave de idempotencia es única por cuenta**: otra cuenta puede usar la misma.
- **Confirmada si y solo si tiene su transacción**; **descartada si y solo si tiene su fecha de descarte** (con ella se borra a los 90 días); **el pedido crudo está mientras no se confirma** y se borra al confirmar.
- El monto, si existe, es mayor que cero; puede ir **sin moneda** (se elige en la bandeja). Los últimos 4 son exactamente cuatro dígitos. La lista de avisos existe siempre (vacía si no hay).
- **Una regla por patrón** (`pattern_key` único por cuenta), con el patrón no vacío y la prioridad de 0 en adelante.
- **Una captura da a lo más una transacción y una transacción sale de a lo más una captura** (`transaction_id` y `transactions.capture_id` únicos). La clave foránea de `transactions.capture_id`, prometida en H3, llega en su propia migración, sin cascada: una transacción no se borra con su captura.
- Borrar una cuenta borra sus capturas y sus reglas (las dos cuelgan **directo** del usuario).

## Eventos de dominio

- **Emite:** nada. `CaptureReceived` (plan) **no se creó** porque nadie lo escucharía (decidido el 2026-10-04), igual que `GoalContributionAdded` en H6: llega con las notificaciones de H8, si hace falta. El contador de la bandeja se calcula al consultar.
- **Escucha:** `catalog.category.merged` (ADR-0005; decidido el 2026-10-04): las reglas y las capturas **sin confirmar** de la categoría origen pasan a la destino. Si no, la regla dejaría de sugerir y la captura no se podría confirmar, porque la origen queda archivada. Las confirmadas no se tocan: su transacción sigue a la fusión por su lado. Si falla, se registra y la fusión sigue; volver a fusionar las mueve.

## Endpoints

Bajo `/api/v1`, con `@RequiresFeature('capture')`: **404** y fuera de OpenAPI con el flag apagado. La bandeja y las reglas llegan con las tareas 07 y 08, solo con sesión.

| Método   | Ruta                         | Qué hace                                                                                                                                                                     |
| -------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/captures`                  | Recibe una captura del teléfono y la deja en la bandeja: `201` con lo que se entendió (`parsed`, `warnings`), o `200` con la original si la clave de idempotencia ya existía |
| `GET`    | `/captures`                  | La bandeja: `status=inbox` (por revisar, con las duplicadas marcadas; por defecto) o `status=discarded`. Primero la más reciente; cursor y `limit` (50, máximo 100)          |
| `GET`    | `/captures/{id}`             | Una captura, con el pedido crudo mientras no se confirme                                                                                                                     |
| `PATCH`  | `/captures/{id}`             | Corrige una captura de la bandeja                                                                                                                                            |
| `POST`   | `/captures/{id}/confirm`     | La confirma: se crea su transacción. Con `rememberCategory`, recuerda la categoría para su comercio                                                                          |
| `POST`   | `/captures/confirm`          | Confirma varias (hasta 50), cada una por su lado                                                                                                                             |
| `POST`   | `/captures/{id}/discard`     | La descarta, recordando de dónde vino                                                                                                                                        |
| `POST`   | `/captures/{id}/restore`     | «Deshacer»: vuelve a la bandeja como estaba                                                                                                                                  |
| `GET`    | `/categorization-rules`      | Las reglas de la cuenta, primero la de mayor prioridad                                                                                                                       |
| `POST`   | `/categorization-rules`      | Crea una regla (`pattern`, `categoryId`, `priority`)                                                                                                                         |
| `PATCH`  | `/categorization-rules/{id}` | Cambia el patrón, la categoría o la prioridad                                                                                                                                |
| `DELETE` | `/categorization-rules/{id}` | Borra una regla                                                                                                                                                              |

### `POST /captures`

Decidido con el autor el **2026-10-04**:

- **Solo con token personal** y el scope `captures:write` (`@RequiresPersonalAccessToken`): una **sesión** válida recibe **403** (`PERSONAL_ACCESS_TOKEN_REQUIRED`); la web nunca crea capturas. Sin token, o con uno revocado, caducado o inventado, **401**. El `userId` sale del token.
- **Siempre guarda** un pedido bien formado. Solo se rechaza (**422**, sin guardar nada) si falta `source` u `occurredAt`, el instante no trae zona, sobra un campo (un `userId` en el cuerpo, por ejemplo), alguno pasa su largo máximo o la cabecera `Idempotency-Key` no vale. Si falla la búsqueda de método, reglas o duplicados, se guarda igual con `PROCESSING_FAILED`.
- **Idempotencia:** la misma `Idempotency-Key` responde **200** con la captura original, aunque el cuerpo cambie. Sin ella, la clave sale de **todo el pedido** (fuente, instante en UTC, monto, comercio, tarjeta y texto), así dos notificaciones distintas del mismo segundo no chocan. Otra cuenta puede usar la misma clave. Si dos reintentos llegan a la vez, la base decide y el segundo recibe la del primero.
- **Tope de caudal:** 30 por minuto **por IP**, contadas antes de mirar el token (frena también a quien prueba tokens al azar). Cupo propio: no gasta el del resto de la API. `CAPTURE_RATE_LIMIT_PER_MINUTE` lo cambia.
- **Los números de tarjeta se tapan** en todos los campos antes de guardar el pedido crudo. El texto de la notificación **nunca** va a los logs.
- La respuesta trae lo entendido, **sin el texto crudo**.

### La bandeja

Solo desde una **sesión**: un token personal recibe 403 en todas sus rutas (el teléfono solo crea capturas). Una captura ajena responde **404**, igual que una que no existe. Decidido con el autor el **2026-10-04**:

- **Qué se ve:** por revisar (con las duplicadas marcadas) y, en su filtro, las descartadas. **Las confirmadas no se listan**: ya son transacciones, y su texto crudo se borró al confirmar. **Primero la más reciente.**
- **Corregir** (decisión 10): todo, y `null` lo borra. Si cambia el tipo sin categoría, la que había se limpia. Una categoría o un método **nuevos** tienen que ser de la cuenta (404 si no) y estar activos, y la categoría del tipo de la captura (422); la fecha, hasta hoy, y el monto, positivo con 2 decimales, como en una transacción. Si el monto no tiene moneda y el método elegido tiene una sola, la toma (decisión 3). **La marca de duplicada se queda**: dice cómo llegó. Una confirmada o descartada no se corrige (**409** `CAPTURE_NOT_PENDING`).
- **Descartar y deshacer** (decisión 11): la descartada recuerda de dónde vino (`discarded_from`) y **vuelve como estaba**, por revisar o duplicada. Descartar dos veces, o deshacer una que no está descartada, responde **409**. Si otra pestaña cambió la captura entretanto, la base no la toca (el estado esperado va en el `UPDATE`).
- **Confirmar:** arma la transacción con `transactionFromCapture` (sin descripción, el comercio) y la registra por **`TransactionsRecorder`**, la escritura pública de `transactions`, detrás del puerto `CaptureTransactionsWriter`: pasa por `CreateTransaction`, así que se aplican todas las reglas de una transacción y se emite `TransactionCreated`. La transacción lleva su `captureId` y su origen (`IOS_SHORTCUT` / `ANDROID_AUTOMATION`). La captura queda **confirmada** con su `transactionId`, y su **texto crudo se borra** (decisión 14). Si después se borra la transacción, la captura sigue confirmada.
- **Una sola transacción por captura** (decidido el 2026-10-04): confirmar dos veces responde **409** `CAPTURE_NOT_PENDING` sin crear nada, también si llegan a la vez (la base no deja una segunda: `transactions.capture_id` es único). Si una confirmación se cortó después de crear la transacción, la siguiente la enlaza en vez de crear otra.
- **Confirmar varias** (decisión 10): **cada una por su lado**. La respuesta dice cuáles se confirmaron (con su transacción) y, de las otras, el `code` de su error. Un error inesperado corta, y las ya confirmadas quedan confirmadas.
- **«Recordar para este comercio»** (decisión 13): con la casilla marcada, crea la regla del comercio (prioridad 0) o, si ya hay una con ese patrón sin tildes ni mayúsculas, le cambia la categoría. **Sin comercio, 422** `CAPTURE_MERCHANT_MISSING` y no se confirma.
- `CaptureConfirmed` **no se creó**, como `CaptureReceived`: nadie lo escucharía.
- **Reglas** (decisión 12; decidido el 2026-10-04): solo desde una sesión. La categoría, de la cuenta (404 si no) y **activa** (422), de cualquier tipo: se sugiere solo a capturas de su tipo. Un patrón que la cuenta ya tiene, sin tildes ni mayúsculas, responde **409** `RULE_PATTERN_TAKEN`: se edita esa. Al **crear o cambiar** una regla, las capturas de la bandeja **sin categoría** a las que aplique toman la suya (pesan todas las reglas, como al recibir); las que ya tienen una, sugerida o elegida, no se tocan. Borrar una regla no quita lo que ya sugirió. Una regla cuya categoría se archiva después se queda, pero no sugiere mientras esté archivada.
- **Borrado a los 90 días** (decisiones 11 y 14): una **tarea diaria dentro de la API** (`@nestjs/schedule`, a las 4:30 de Lima) borra del todo las descartadas hace más de 90 días, con su texto crudo, cuenta por cuenta. Se cumple aunque nadie abra la bandeja. Con el módulo apagado no hace nada; si falla, lo intenta al día siguiente.

## En la web

**«Bandeja»** (`/capture`), con su flag leído en el servidor (`requireFeature`). Decidido con el autor el **2026-10-04**:

- **Por revisar**, primero la más reciente, y **Descartadas** en su pestaña (con «Restaurar»). Cada captura en una tarjeta: el monto («Sin monto» o «25.90 (sin moneda)»), el comercio, el día, los últimos 4, la categoría, el método, la marca de **posible duplicado**, sus **avisos en palabras** (los códigos se traducen en la web) y, plegado, **lo que llegó del teléfono** completo (decisión 14).
- **Confirmar** con un toque si está completa; si no, dice qué falta («Falta la categoría.»). Con comercio se ofrece **«Recordar la categoría para «Tambo»»** (decisión 13).
- **Corregir en la misma tarjeta**, sin cambiar de pantalla: monto, moneda (si el método no la fija), categoría (el tipo sale de ella, como al registrar un movimiento), método, fecha, comercio y descripción. Los errores de la API van junto a su campo.
- **Descartar** con «Deshacer» (decisión 11). **«Confirmar las N completas»** confirma todas las que están listas, cada una por su lado, y dice cuántas no se pudieron.
- La lista se pide de nuevo al volver a ella (`staleTime: 0`): llegan capturas mientras se mira.
- **«Bandeja» con su contador** en el menú (decisión 17): cuántas hay por revisar, **exacto hasta 99 y luego «99+»**, contadas con la misma lista de la bandeja (una página de 100), sin endpoint aparte. Sin pendientes no muestra nada.
- **Menú desplegable en el teléfono** (decidido el 2026-10-04): con 8 secciones ya no cabían. En pantallas angostas las secciones van detrás de «Menú»; **«Bandeja» queda siempre a la vista**, fuera del desplegable (`pinned` en su manifest). En escritorio, todo en una fila como antes.
- **Aviso en «Inicio»** cuando hay pendientes: «Tienes 3 capturas por revisar: lo que llegó del teléfono todavía no cuenta en el mes», con enlace a la bandeja. La página lee el flag en el servidor (`showPendingCaptures`): apagado, no se pide nada de capturas.

## Estado

- Feature flag: `FEATURE_CAPTURE` (apagado hasta cumplir la Definition of Done)
- Escenarios: [`features/capture/`](../../features/capture/)
