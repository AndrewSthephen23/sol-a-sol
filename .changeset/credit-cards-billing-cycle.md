---
'@sol-a-sol/domain': patch
---

Ciclo de facturación y fecha límite de pago de una tarjeta de crédito: `computeBillingCycle` (con `previousBillingCycle` y `nextBillingCycle`) y `computePaymentDueDate`, con sus reglas (`assertStatementDay`, `assertPaymentDueRule`).

- El día de corte **cierra su ciclo**: con corte 20, el ciclo va del 21 del mes anterior al 20.
- Un día de corte o de pago que el mes no tiene cae el **último día**, y el mes siguiente vuelve a su día.
- Fecha de pago a **N días del corte** o en un **día fijo del mes**: la primera vez que llega ese día después del corte, nunca el mismo día. Sin ajuste por fines de semana ni feriados.
