---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/web': patch
---

API de metas de ahorro, detrás de `FEATURE_GOALS` (todavía apagado): `GET/POST /goals`, `PATCH /goals/{id}` y `GET/POST/DELETE /goals/{id}/contributions`, con el progreso de cada meta calculado al consultar.

- Un aporte es **manual** (aporte o retiro, con monto positivo y fecha de hoy o antes) o **enlazado** a una transacción entera de ahorro o inversión, que sigue si se corrige, se borra o se restaura. Una transacción aporta a una sola meta.
- La moneda de la meta queda fija al crearla. Una meta archivada no recibe aportes nuevos, pero se corrige y se le deshacen aportes.
- Un retiro, o deshacer un aporte, no puede dejar la meta en negativo.
- Contratos estrictos en `@sol-a-sol/contracts`, rutas en OpenAPI y cliente de la web regenerado.
