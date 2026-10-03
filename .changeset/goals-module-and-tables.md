---
'@sol-a-sol/api': patch
'@sol-a-sol/web': patch
---

Empieza el hito **H6**: nace el módulo `goals` (apagado con `FEATURE_GOALS=false`) con sus tablas, `savings_goals` y `goal_contributions`. Todavía no tiene endpoints.

- Una meta tiene nombre (único por cuenta sin distinguir mayúsculas), objetivo mayor que cero en una sola moneda (`NUMERIC(18,2)`) y fechas de inicio y fin libres, con el fin después del inicio.
- Un aporte es **manual** (fecha y monto positivo, aporte o retiro) o está **enlazado** a una transacción entera, sin fecha ni monto propios. Una transacción aporta a una sola meta, y un retiro no se enlaza.
- La base exige que el aporte sea de la misma cuenta que su meta y que su transacción.

Las reglas de las metas, decididas con el autor, quedan escritas en `docs/modules/goals.md`.
