---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
---

Confirmación de la importación (`POST /api/v1/transactions/import`): con una decisión por cada categoría y método de pago que falta o está archivado (crearlo, usar uno propio o restaurarlo), guarda todas las filas con origen `IMPORT` en una sola transacción de base de datos, o ninguna. Omite lo ya importado y responde 409 si otra importación guardó a la vez las mismas filas.
