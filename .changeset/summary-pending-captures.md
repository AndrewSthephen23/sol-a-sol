---
'@sol-a-sol/api': patch
'@sol-a-sol/domain': patch
'@sol-a-sol/web': patch
---

El resumen mensual avisa de las capturas que faltan revisar (decisión 16 de H7, lo que quedó fuera en H6):

- `computeMonthlySummary` gana la sección `captures`: cuántas del mes esperan en la bandeja (por revisar y duplicadas), su monto por moneda y cuántas no suman por no tener monto o moneda.
- `capture` expone `CaptureLookup`; `reports` lo lee detrás de un puerto propio y solo con el módulo encendido. Apagado, la sección no existe en la respuesta, en OpenAPI, en el CSV ni en la web.
- El CSV suma la sección «Capturas pendientes», y la pantalla «Resumen» dice «Tienes 3 capturas sin revisar de setiembre (S/ 85.40): el resumen puede estar incompleto», con un enlace a la bandeja.
