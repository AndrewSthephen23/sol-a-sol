---
'@sol-a-sol/domain': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/api': patch
'@sol-a-sol/web': patch
---

Resumen anual: `computeAnnualSummary` en el dominio y `GET /reports/annual?year=` en la API.

- Por moneda, una fila por concepto (ingresos, gasto fijo, gasto variable, total gasto, ahorro, inversión, deuda y saldo) con sus 12 meses y su total. Un mes que todavía no llega viene vacío, no en cero.
- La tasa de ahorro del año (con inversión, `null` sin ingresos) y el gasto del año por categoría, con el mismo reparto que la dona del dashboard (`expenseDistribution`, extraído de `buildMonthlyDashboard`).
- Un año fuera de 2000 a 2100, o que todavía no empieza, responde 422.
