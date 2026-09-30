---
'@sol-a-sol/api': patch
'@sol-a-sol/domain': patch
'@sol-a-sol/web': patch
---

Estado de una tarjeta de crédito (módulo `credit-cards`, todavía apagado): `GET /credit-cards/status` y `GET /credit-cards/{id}/status`.

- Ciclo en curso, lo que se debe y lo cargado en el ciclo, por moneda y sin convertir nunca; utilización de la línea; el último estado cerrado con su monto (la deuda total el día del corte), lo pagado después, lo que falta, la fecha límite y si está pagado; y el aviso de pago.
- Suben la deuda las compras, los cargos y sacar efectivo con la tarjeta; la bajan pagarla (con lo que llegó) y las devoluciones.
- `TransactionsLookup` suma por día lo que pasó con un método de pago, transferencias incluidas (`paymentMethodTotalsByDay`).
