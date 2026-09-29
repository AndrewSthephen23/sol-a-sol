---
'@sol-a-sol/domain': patch
---

Utilización, alertas y cuotas de una tarjeta de crédito:

- `computeUtilization`: deuda / línea sin redondear, con niveles fijos: `HIGH` por encima del 30 %, `CRITICAL` desde el 70 %. Con línea en cero no hay porcentaje ni nivel.
- `paymentAlert`: avisa si todavía se debe algo y el pago vence en 3 días o menos (`DUE_SOON`) o ya venció (`OVERDUE`).
- `computeInstallmentPlan`: de 2 a 36 cuotas repartidas con `allocate`, sin perder un céntimo, cada una con el estado de cuenta en que se factura; `pendingInstallments` y `installmentInterest`.
