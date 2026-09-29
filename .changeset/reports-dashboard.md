---
'@sol-a-sol/domain': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/api': patch
'@sol-a-sol/web': patch
---

Nace el módulo `reports` (apagado con `FEATURE_REPORTS=false`), de solo lectura y sin tablas propias, con `GET /api/v1/reports/monthly`: el dashboard del mes en una llamada, por moneda y sin convertir nunca. Trae los KPIs (ingresos, gastos, ahorro, deuda y saldo), el gasto diario con los días en cero (el mes en curso hasta hoy en Lima), la dona del gasto por categoría madre con las 6 mayores y «Otras», y las tablas por tipo. Lo arma `buildMonthlyDashboard` en el dominio, con mutation testing al 100 %.

`TransactionsLookup` suma `totalsByDay`. `reports` no entra en la navegación: el dashboard vivirá en `/`.
