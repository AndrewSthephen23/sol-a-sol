# Módulo Tarjetas (`credit-cards`)

> Ficha del módulo. Estado: **en construcción** (hito H5). Hoy existen el módulo y su tabla; las reglas, los endpoints y la pantalla llegan con las tareas siguientes. Flag **apagado**.

## Qué resuelve

Dominar las tarjetas de crédito: saber, para cada una, **en qué ciclo estoy, cuánto debo, cuánto de la línea uso y cuándo y cuánto tengo que pagar**, y ver las compras en cuotas con lo que falta. Es la sección «Domina tus Tarjetas» del plan. Las compras con tarjeta ya se registran como transacciones (H3); sin este módulo no se sabe cuándo llega la cuenta ni si se está usando demasiada línea.

## Reglas de negocio

Decididas con el autor el **2026-09-29**:

| Tema                    | Regla                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lo que se debe          | **Deuda total**: todas las compras con la tarjeta − todos los pagos (transferencias a la tarjeta), de cualquier ciclo. Intereses, comisiones y membresía son compras que **sí suman** (H3)                                                                                                                                                                                                                                                 |
| Utilización             | Deuda total / línea, con `percentageOf`: sin redondear al calcular, 2 decimales al mostrar; con línea 0 no hay porcentaje (`null`)                                                                                                                                                                                                                                                                                                         |
| Saldo inicial           | **Opcional**, lo que ya se debía antes de registrar en la app: **uno por moneda** (S/ y US$), **cero o más**, con **una sola fecha**. Solo cuentan las compras y los pagos posteriores a esa fecha. Sin él, la deuda arranca en cero                                                                                                                                                                                                       |
| Moneda de la línea      | **Una sola línea, en una moneda** (normalmente S/). La utilización solo cuenta la deuda en esa moneda; la deuda en la otra se muestra aparte, sin porcentaje. **Nunca se convierte**                                                                                                                                                                                                                                                       |
| Ciclo                   | La compra del **día de corte** entra en el estado que cierra ese día: con corte 20, el ciclo va del 21 del mes anterior al 20, los dos incluidos. Un día de corte que no existe en el mes cae el **último día**, y el mes siguiente vuelve a su día: un corte 31 cierra el 28 de febrero y el 31 de marzo (CLAUDE.md)                                                                                                                      |
| Fecha límite de pago    | **Dos reglas**: N días después del corte (1 a 60), o un día fijo del mes. Con día fijo vence **la primera vez que llega ese día después del corte**: del mismo mes si cae después, del siguiente si es **anterior o igual**. Un día que el mes no tiene cae el último, pero **nunca el mismo día del corte**: corte 28 y pago 29 en un febrero de 28 días vence el 29 de marzo. **Sin ajuste** por fines de semana ni feriados (CLAUDE.md) |
| Compra en cuotas        | La compra **entera es gasto el día que se compra** (presupuesto y dashboard la ven completa). Las cuotas solo reparten cuánto se paga en cada estado de cuenta, con `allocate`: los céntimos sobrantes van a las primeras                                                                                                                                                                                                                  |
| Intereses de las cuotas | Con y sin intereses. Se registra el **total que da el banco**; la diferencia con el precio es interés y **cuenta como deuda** («Deuda › Tarjeta de crédito»)                                                                                                                                                                                                                                                                               |
| Primera cuota           | En el **primer corte después de la compra**. Las pendientes se calculan **solas por fecha** (cuántos cortes pasaron), no se marcan a mano                                                                                                                                                                                                                                                                                                  |
| Alertas                 | **Fijas en H5**: `HIGH` con utilización > 30 %, `CRITICAL` con ≥ 70 %, y pago próximo con 3 días o menos                                                                                                                                                                                                                                                                                                                                   |
| Estado de cuenta pagado | Se marca **pagado** cuando los pagos posteriores al corte cubren el monto del estado. El **pago mínimo** queda fuera de H5                                                                                                                                                                                                                                                                                                                 |
| Dónde se configura      | **Aparte**, en la pantalla de tarjetas (`/credit-cards`, en el menú). Un método `CREDIT_CARD` sin configurar aparece con «Configura tu tarjeta»; el formulario de métodos de pago no cambia                                                                                                                                                                                                                                                |
| Dónde se ven alertas    | Un bloque **«Tarjetas»** arriba de los KPIs del dashboard (`/`), **solo si hay alguna alerta**                                                                                                                                                                                                                                                                                                                                             |

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

Que la moneda de la línea sea una de las que acepta el método (un método en soles no puede tener la línea en dólares) no lo puede exigir la base sin cruzar módulos: lo valida el caso de uso con `CatalogLookup`.

## Dominio

En `@sol-a-sol/domain` (`credit-cards/billing-cycle.ts`), puro y sin `new Date()`:

- `computeBillingCycle(statementDay, date)`: el ciclo `{ start, end }` que contiene `date`; `end` es la fecha del estado de cuenta. `previousBillingCycle` y `nextBillingCycle` dan los vecinos.
- `computePaymentDueDate(statement, rule)`: la fecha límite de pago del estado que cierra en `statement`, con `rule` = `{ kind: 'DAYS_AFTER_STATEMENT', days }` o `{ kind: 'DAY_OF_MONTH', day }`.
- Errores: `STATEMENT_DAY_INVALID` (fuera de 1 a 31) y `PAYMENT_DUE_RULE_INVALID`. Los días restantes hasta el pago salen de `LocalDate.daysUntil` (0 el mismo día, negativo si ya pasó).

## Eventos de dominio

- **Emite:** nada todavía (`CreditCardThresholdExceeded` llega con las alertas).
- **Escucha:** nada.

## Endpoints

Llegan con las tareas 04 a 06 (`GET/POST/PATCH /credit-cards`, `GET /credit-cards/{id}/status` y las cuotas).

## Estado

- Feature flag: `FEATURE_CREDIT_CARDS` (**apagado** hasta cumplir la Definition of Done).
- Escenarios: [`features/credit-cards/`](../../features/credit-cards/), `@pendiente` hasta la tarea 10.
- Web: el manifest (`/credit-cards`) está en el registro de navegación y no se ve con el flag apagado; la pantalla llega con la tarea 08.
