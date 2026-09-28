---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/domain': patch
---

Transferencias entre cuentas propias (`POST /api/v1/transfers`, `GET /api/v1/transfers/{id}`): plata que cambia de lugar sin contar como ingreso ni gasto. Con un cambio de moneda guarda los dos montos, copiados del voucher, sin convertir nunca. Pagar la tarjeta de crédito pasa a ser una transferencia; **Deuda** queda para préstamos, intereses y comisiones. Completa también las tablas de endpoints y errores de la ficha de `transactions`.
