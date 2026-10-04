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

| Aviso                | Qué significa                                                     |
| -------------------- | ----------------------------------------------------------------- |
| `UNKNOWN_SOURCE`     | Ninguna fuente conocida reconoció el texto: se leyó solo el monto |
| `PARSER_FAILED`      | El parser de la fuente falló (quizás cambió el formato)           |
| `AMOUNT_NOT_FOUND`   | No hay monto pegado a una moneda                                  |
| `AMBIGUOUS_AMOUNT`   | Hay montos distintos y no se elige uno                            |
| `INVALID_AMOUNT`     | El monto no se puede leer (por ejemplo, con más de 2 decimales)   |
| `CARD_NUMBER_MASKED` | Traía un número de tarjeta completo: quedan solo sus últimos 4    |
| `OPERATION_REJECTED` | El banco rechazó la operación                                     |

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

- **Emite:** `CaptureReceived` al recibir una captura (tarea 06).
- **Escucha:** `catalog.category.merged`, para que capturas y reglas sigan a la categoría fusionada (tareas 07 y 08).

## Endpoints

Llegan con las tareas 06 a 08: `POST /captures` solo con token personal y el scope `captures:write`; la bandeja y las reglas, solo con sesión.

| Método | Ruta | Qué hace |
| ------ | ---- | -------- |

## Estado

- Feature flag: `FEATURE_CAPTURE` (apagado hasta cumplir la Definition of Done)
- Escenarios: [`features/capture/`](../../features/capture/)
