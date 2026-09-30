---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/domain': patch
'@sol-a-sol/web': patch
---

Compras en cuotas (módulo `credit-cards`, todavía apagado): `GET/POST /credit-cards/{id}/installments` y `DELETE /credit-cards/{id}/installments/{planId}`, con la tabla `installment_plans`.

- Una compra con la tarjeta se marca en 2 a 36 cuotas, con o sin intereses (el total del banco). Las cuotas suman exactamente el total.
- **El plan sigue a la compra**: se lee como está hoy; borrada se ignora hasta que se restaure, y si deja de tener sentido queda inválido.
- En el estado de la tarjeta: la deuda incluye la compra y el interés, el estado de cuenta solo las cuotas facturadas y el consumo del ciclo la cuota del ciclo. Presupuesto y dashboard no cambian.
