# Módulo Tarjetas (`credit-cards`)

> Ficha del módulo. Estado: **en construcción** (hito H5). Hoy existen el módulo y su tabla; las reglas, los endpoints y la pantalla llegan con las tareas siguientes. Flag **apagado**.

## Qué resuelve

Dominar las tarjetas de crédito: saber, para cada una, **en qué ciclo estoy, cuánto debo, cuánto de la línea uso y cuándo y cuánto tengo que pagar**, y ver las compras en cuotas con lo que falta. Es la sección «Domina tus Tarjetas» del plan. Las compras con tarjeta ya se registran como transacciones (H3); sin este módulo no se sabe cuándo llega la cuenta ni si se está usando demasiada línea.

## Reglas de negocio

Decididas con el autor el **2026-09-29**:

| Tema                    | Regla                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lo que se debe          | **Deuda total**: saldo inicial + todo lo que la sube − todo lo que la baja, de cualquier ciclo. **Suben**: cualquier transacción con la tarjeta que no sea ingreso (gasto, deuda como intereses y comisiones, ahorro, inversión) y **sacar efectivo** (una transferencia que sale de la tarjeta). **Bajan**: **pagarla** (una transferencia que llega, con el monto **recibido**) y una **devolución** (un ingreso con la tarjeta) (2026-09-29). Negativa, es un saldo a favor |
| Utilización             | Deuda total / línea, con `percentageOf`: sin redondear al calcular, 2 decimales al mostrar. Los umbrales se comparan **sin redondear**: un céntimo por encima del 30 % ya es alto. Una **línea en cero** se permite (una adicional que usa la línea de la titular): no hay porcentaje (`null`, se muestra «—») **ni alerta de utilización**; la deuda y la alerta de pago siguen (2026-09-29)                                                                                  |
| Saldo inicial           | **Opcional**, lo que ya se debía antes de registrar en la app: **uno por moneda** (S/ y US$), **cero o más**, con **una sola fecha**. Solo cuentan las compras y los pagos posteriores a esa fecha. Sin él, la deuda arranca en cero                                                                                                                                                                                                                                           |
| Moneda de la línea      | **Una sola línea, en una moneda** (normalmente S/). La utilización solo cuenta la deuda en esa moneda; la deuda en la otra se muestra aparte, sin porcentaje. **Nunca se convierte**                                                                                                                                                                                                                                                                                           |
| Ciclo                   | La compra del **día de corte** entra en el estado que cierra ese día: con corte 20, el ciclo va del 21 del mes anterior al 20, los dos incluidos. Un día de corte que no existe en el mes cae el **último día**, y el mes siguiente vuelve a su día: un corte 31 cierra el 28 de febrero y el 31 de marzo (CLAUDE.md)                                                                                                                                                          |
| Fecha límite de pago    | **Dos reglas**: N días después del corte (1 a 60), o un día fijo del mes. Con día fijo vence **la primera vez que llega ese día después del corte**: del mismo mes si cae después, del siguiente si es **anterior o igual**. Un día que el mes no tiene cae el último, pero **nunca el mismo día del corte**: corte 28 y pago 29 en un febrero de 28 días vence el 29 de marzo. **Sin ajuste** por fines de semana ni feriados (CLAUDE.md)                                     |
| Compra en cuotas        | La compra **entera es gasto el día que se compra** (presupuesto y dashboard la ven completa). Las cuotas solo reparten cuánto se paga en cada estado de cuenta, con `allocate`: los céntimos sobrantes van a las primeras                                                                                                                                                                                                                                                      |
| Intereses de las cuotas | Con y sin intereses. Se registra el **total que da el banco**; la diferencia con el precio es interés y **cuenta como deuda** («Deuda › Tarjeta de crédito»)                                                                                                                                                                                                                                                                                                                   |
| Cuotas                  | **De 2 a 36** por compra (2026-09-29). Los montos salen de `allocate` y ninguna puede ser de cero. La primera va en el **estado del ciclo que contiene la compra** (una compra del día de corte entra en el estado de ese día, decisión 4) y cada una en el siguiente. Las pendientes se calculan **solas por fecha**: el estado que cierra hoy ya lleva su cuota                                                                                                              |
| Alertas                 | **Fijas en H5**: `HIGH` con utilización **> 30 %** (justo 30 % es `OK`), `CRITICAL` con **≥ 70 %**. Pago: aviso con **3 días o menos** (`DUE_SOON`) o ya vencido (`OVERDUE`), solo si todavía se debe algo de ese estado                                                                                                                                                                                                                                                       |
| Estado de cuenta        | El **monto del estado** es la **deuda total el día del corte**: lo que quedó sin pagar de antes se arrastra, como el «saldo total» del banco (2026-09-29). Se marca **pagado** cuando lo que llegó después del corte (pagos y devoluciones) lo cubre en cada moneda; una compra después del corte es del estado siguiente y no lo descuenta. El **pago mínimo** queda fuera de H5                                                                                              |
| Dónde se configura      | **Aparte**, en la pantalla de tarjetas (`/credit-cards`, en el menú). Un método `CREDIT_CARD` sin configurar aparece con «Configura tu tarjeta»; el formulario de métodos de pago no cambia                                                                                                                                                                                                                                                                                    |
| Dónde se ven alertas    | Un bloque **«Tarjetas»** arriba de los KPIs del dashboard (`/`), **solo si hay alguna alerta**                                                                                                                                                                                                                                                                                                                                                                                 |
| Cambiar el día de corte | **Recalcula todo**, los ciclos pasados incluidos (2026-09-29): se guarda solo el día actual y los estados de cuenta se calculan al consultar. La deuda total no cambia; solo cómo se agrupan los estados viejos                                                                                                                                                                                                                                                                |
| Archivar la tarjeta     | Se archiva su **método de pago** (no hay `DELETE`). La configuración **se conserva y se ve** marcada como archivada, **no avisa** y se puede seguir corrigiendo; restaurar el método la deja tal cual (2026-09-29). Un método archivado no se configura por primera vez                                                                                                                                                                                                        |

**Comprar con la tarjeta es un gasto; pagarla es una transferencia** cuenta → tarjeta, que no cuenta como gasto (decidido en H3, ver [`transactions.md`](transactions.md)).

**La «fecha límite de pago» no es la «fecha de vencimiento» del plástico:** en el código es `paymentDueDate`. El vencimiento del plástico, el número completo y el CVV **no se guardan nunca**.

## Modelo de datos

| Tabla          | Qué guarda                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `credit_cards` | La configuración de una tarjeta, **una por método de pago**: línea (`NUMERIC(18,2)`, ≥ 0) y su moneda, día de corte (1 a 31), regla de pago (`DAYS_AFTER_STATEMENT` con 1 a 60 días, o `DAY_OF_MONTH` con un día de 1 a 31) y el saldo inicial opcional |

Lo que identifica la tarjeta (alias, banco, últimos 4) vive en `payment_methods` de [`catalog`](catalog.md) y **no se duplica**. Lo que se debe, la utilización y los estados de cuenta **no se guardan**: se calculan al consultar con las transacciones.

La base exige por su cuenta, aunque alguien se salte la aplicación:

- **La tarjeta es de la misma cuenta que su método de pago, y el método es `CREDIT_CARD`**: `credit_cards` lleva su propio `user_id` y el `kind` del método (siempre `CREDIT_CARD`, por `CHECK`) para que la clave foránea compuesta `(payment_method_id, user_id, kind)` lo garantice, como `budget_lines` con su categoría.
- **Cada regla de pago lleva su dato y no el de la otra.**
- La línea y los saldos iniciales no son negativos; el día de corte está entre 1 y 31; **un saldo inicial va con su fecha**, y una fecha, con algún saldo (`CHECK`).
- Borrar una cuenta borra sus tarjetas (la tarjeta cuelga directo de su usuario, lección de H4); un método de pago con tarjeta configurada **no se puede borrar** (se archiva).

Que la moneda de la línea y de los saldos iniciales sea una de las que acepta el método (un método en soles no puede tener la línea en dólares) no lo puede exigir la base sin cruzar módulos: lo valida el dominio con la moneda que `CatalogLookup` da del método **hoy**. Si el método cambió de moneda después, la tarjeta no se puede corregir hasta que su línea también cambie.

## Dominio

En `@sol-a-sol/domain` (`credit-cards/`), puro y sin `new Date()`:

- `computeBillingCycle(statementDay, date)`: el ciclo `{ start, end }` que contiene `date`; `end` es la fecha del estado de cuenta. `previousBillingCycle` y `nextBillingCycle` dan los vecinos.
- `computePaymentDueDate(statement, rule)`: la fecha límite de pago del estado que cierra en `statement`, con `rule` = `{ kind: 'DAYS_AFTER_STATEMENT', days }` o `{ kind: 'DAY_OF_MONTH', day }`.
- `computeUtilization(creditLimit, used)` → `{ percentage, level }` (`OK`, `HIGH`, `CRITICAL`; los dos `null` con línea cero), y `paymentAlert(today, dueDate, amountDue)` → `DUE_SOON` u `OVERDUE` con los días que faltan, o nada. Umbrales: `HIGH_UTILIZATION_ABOVE`, `CRITICAL_UTILIZATION_FROM`, `PAYMENT_ALERT_DAYS`.
- `computeInstallmentPlan({ total, count, statementDay, purchaseDate })` → las cuotas con su monto y el estado en que se facturan; `pendingInstallments(plan, today)` las que faltan facturar; `installmentInterest(price, total)` el interés (total del banco − precio).
- `computeCardStatus({ settings, movements, today })`: el estado de hoy (ciclo en curso, deuda y cargos del ciclo por moneda, último estado cerrado con lo que falta pagar, utilización y aviso de pago). `cardMovementEffect` dice si un movimiento sube la deuda (`CHARGE`) o la baja (`CREDIT`). Un saldo inicial posterior al último corte deja ese estado en `null`: no se sabe cuánto se debía ese día.
- `assertConfigurableMethod` y `assertCreditCardSettings`: las reglas de configurar y corregir una tarjeta (ver la tabla de códigos en «Endpoints»).
- Errores: `STATEMENT_DAY_INVALID` (fuera de 1 a 31), `PAYMENT_DUE_RULE_INVALID`, `CREDIT_LIMIT_NEGATIVE`, `INSTALLMENT_COUNT_INVALID` (fuera de 2 a 36), `INSTALLMENT_TOO_SMALL` (alguna cuota quedaría en cero) e `INSTALLMENT_TOTAL_BELOW_PRICE`. Los días restantes hasta el pago salen de `LocalDate.daysUntil` (0 el mismo día, negativo si ya pasó).

## Eventos de dominio

- **Emite:** nada todavía (`CreditCardThresholdExceeded` llega con las alertas).
- **Escucha:** nada. Lo que se compró y se pagó se lee al consultar con `TransactionsLookup.paymentMethodTotalsByDay`, detrás del puerto propio `CreditCardMovementsReader`.

## Endpoints

Bajo `/api/v1`, solo con sesión (un token personal recibe **403**) y con `FEATURE_CREDIT_CARDS=true` (apagado: **404**, y fuera de OpenAPI). La cuenta sale del token; nunca del cuerpo ni de la ruta.

| Método  | Ruta                        | Qué hace                                                                                                                                                                                                                                                                  |
| ------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/credit-cards`             | Las tarjetas configuradas, en el orden en que se configuraron, **archivadas incluidas**, cada una con lo que la identifica (leído de `catalog`)                                                                                                                           |
| `POST`  | `/credit-cards`             | Configura un método `CREDIT_CARD` propio y activo: línea, corte, regla de pago y saldo inicial opcional. **201**                                                                                                                                                          |
| `PATCH` | `/credit-cards/{id}`        | Corrige lo que llegue (`openingBalance: null` lo quita), revisando la tarjeta **como quedaría**. El método de pago no se cambia                                                                                                                                           |
| `GET`   | `/credit-cards/status`      | Todas, con su estado de hoy (Lima)                                                                                                                                                                                                                                        |
| `GET`   | `/credit-cards/{id}/status` | Una, con su estado de hoy: ciclo, deuda y cargos del ciclo por moneda, último estado cerrado (monto, lo pagado, lo que falta, fecha límite, días restantes, pagado), utilización y aviso de pago. Una archivada también responde; los avisos los filtra quien los muestra |

Los montos viajan como `{ amount: "5000.00", currency: "PEN" }`; la regla de pago como `{ kind: "DAYS_AFTER_STATEMENT", days: 25 }` o `{ kind: "DAY_OF_MONTH", day: 5 }`.

| Código                              | Estado | Cuándo                                                             |
| ----------------------------------- | ------ | ------------------------------------------------------------------ |
| `PAYMENT_METHOD_NOT_FOUND`          | 404    | El método de pago no existe o es de otra cuenta                    |
| `CREDIT_CARD_NOT_FOUND`             | 404    | La tarjeta no existe o es de otra cuenta                           |
| `CREDIT_CARD_ALREADY_CONFIGURED`    | 409    | El método ya tiene su tarjeta                                      |
| `PAYMENT_METHOD_NOT_CREDIT_CARD`    | 422    | El método no es una tarjeta de crédito                             |
| `PAYMENT_METHOD_ARCHIVED`           | 422    | Configurar un método archivado                                     |
| `CREDIT_CARD_CURRENCY_NOT_ACCEPTED` | 422    | La línea o un saldo inicial en una moneda que la tarjeta no acepta |
| `CREDIT_LIMIT_NEGATIVE`             | 422    | Línea negativa                                                     |
| `STATEMENT_DAY_INVALID`             | 422    | Día de corte fuera de 1 a 31                                       |
| `PAYMENT_DUE_RULE_INVALID`          | 422    | Fuera de 1 a 60 días, o un día fuera de 1 a 31                     |
| `OPENING_BALANCE_EMPTY`             | 422    | Saldo inicial sin montos                                           |
| `OPENING_BALANCE_CURRENCY_REPEATED` | 422    | La misma moneda dos veces                                          |
| `OPENING_BALANCE_NEGATIVE`          | 422    | Un saldo inicial negativo                                          |
| `OPENING_BALANCE_DATE_IN_FUTURE`    | 422    | Fecha del saldo inicial después de hoy (Lima)                      |

## Estado

- Feature flag: `FEATURE_CREDIT_CARDS` (**apagado** hasta cumplir la Definition of Done).
- Escenarios: [`features/credit-cards/`](../../features/credit-cards/), `@pendiente` hasta la tarea 10.
- Web: el manifest (`/credit-cards`) está en el registro de navegación y no se ve con el flag apagado; la pantalla llega con la tarea 08.
