---
'@sol-a-sol/domain': patch
---

Las reglas de la captura móvil, en funciones puras (`packages/domain/src/capture/`):

- `readCaptureRequest`: mandan los campos del atajo y el texto de la notificación completa lo que falte; el monto puede quedar sin moneda.
- `captureBusinessDate`: el día en Lima, con aviso si es futuro (queda en hoy) o de más de 30 días.
- `matchPaymentMethod` (últimos 4 o alias igual, sin archivados), `resolveCaptureCurrency` (la del monto o la del método) y `suggestCategory` (reglas del mismo tipo, por prioridad y largo del patrón).
- `findDuplicate`: contra otra captura en ±2 minutos y contra una transacción del mismo día, con el mismo monto y comercio.
- `transactionFromCapture`: la transacción que sale al confirmar, o el error de lo que falta.
