---
'@sol-a-sol/api': patch
---

`capture.feature` sin `@pendiente`: las reglas de la bandeja como escenarios en español (siempre guarda, idempotencia, fecha en Lima, duplicados en ±2 minutos, reglas, método por los últimos 4, confirmar una sola vez, corregir, descartar y deshacer, cada quien lo suyo), y el aviso de capturas pendientes en `reports.feature`.

Los escenarios destaparon un error: si una notificación de Android traía el número completo de la tarjeta, se tapaba antes de leerla y se perdían sus últimos 4, así que el método de pago no se reconocía. Ahora se conservan.
