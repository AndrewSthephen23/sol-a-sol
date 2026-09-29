---
'@sol-a-sol/api': patch
'@sol-a-sol/web': patch
---

Empieza el hito **H4**: nace el módulo `budgeting` (apagado con `FEATURE_BUDGETING=false`) con sus dos tablas, `budgets` y `budget_lines`. Todavía no tiene endpoints.

- Un presupuesto por **mes y cuenta**; una partida por **categoría y moneda**, con su monto planeado en `NUMERIC(18,2)`, cero o más.
- La base exige que la partida sea de la misma cuenta que su presupuesto y que su categoría, y que su tipo sea el de la categoría.

Las reglas del presupuesto, decididas con el autor, quedan escritas en `docs/modules/budgeting.md`.
