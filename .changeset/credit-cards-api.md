---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/domain': patch
'@sol-a-sol/web': patch
---

Configurar una tarjeta de crédito (módulo `credit-cards`, todavía apagado): `GET /credit-cards`, `POST /credit-cards` y `PATCH /credit-cards/{id}`.

- Un método de pago `CREDIT_CARD` propio y activo se configura **una vez** con su línea (en una moneda que acepte), su día de corte, su regla de pago y, si hace falta, un saldo inicial por moneda con fecha de hoy o antes.
- La lista incluye las tarjetas cuyo método se archivó; se pueden seguir corrigiendo.
- `CatalogLookup` dice el tipo del método y, en la lista, su banco y sus últimos 4.
- El cliente de la web se regeneró con las rutas nuevas.
