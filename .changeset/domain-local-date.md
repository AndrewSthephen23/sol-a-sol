---
'@sol-a-sol/domain': patch
---

Fechas de negocio sin hora (`LocalDate`) y el puerto `Clock`. `LocalDate` valida fechas reales (rechaza el 30 de febrero), lee ISO (`2026-09-17`) y formato peruano cuando el origen lo justifica (`17/09/2026`), suma días y meses ajustando al último día del mes cuando el destino es más corto (un día de corte 31 cierra el 30 de abril o el 28 de febrero), y convierte un instante a la fecha de Lima. `Clock` permite fijar el "hoy" en las pruebas, así que los cálculos de vencimientos y ciclos son reproducibles.
