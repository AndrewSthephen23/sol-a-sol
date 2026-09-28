---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
---

Corregir (`PATCH /api/v1/transfers/{id}`), borrar lógicamente (`DELETE`) y restaurar sin plazo (`POST /api/v1/transfers/{id}/restore`) una transferencia, con los eventos `transactions.transfer.updated`, `…deleted` y `…restored`. En un cambio de moneda, corregir el monto enviado exige mandar también el recibido.
