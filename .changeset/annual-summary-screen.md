---
'@sol-a-sol/web': patch
---

«Resumen» › «Anual» (`/reports/annual`): el año mes a mes, con barras de ingresos, gastos, ahorro e inversión, la tabla de cada fila con sus 12 meses y su total (la versión en texto de las barras), la tasa de ahorro del año y la dona del gasto. Pestañas Mensual y Anual entre las dos vistas.

- El selector de mes y el de año comparten `PeriodNavigator`; el de año no pasa del año de hoy.
- La dona del dashboard (`DistributionChart`) acepta no enlazar y un texto propio sin gastos.
