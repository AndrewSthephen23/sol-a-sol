---
'@sol-a-sol/domain': patch
---

Resumen mensual en el dominio: `monthlySummaryPeriods` (el mes cerrado entero, o el mes en curso hasta hoy contra el anterior hasta el mismo día; un mes futuro se rechaza) y `computeMonthlySummary`.

- Por moneda: totales por tipo y saldo, tasa de ahorro (con inversión, `null` sin ingresos), variación contra el mes anterior por tipo y por categoría madre (`null` con base cero), y top 5 de categorías y de comercios de gasto (los comercios se juntan sin tildes ni mayúsculas).
- Presupuesto: solo las partidas límite, % ejecutado por moneda y partidas excedidas; «sin presupuesto» si no hay.
- Tarjetas: lo cargado en el mes y el estado que vence el mes siguiente; una archivada solo si se movió.
- Metas: lo aportado en el mes y el progreso a la fecha de corte.
- Las secciones de un módulo apagado no aparecen.
