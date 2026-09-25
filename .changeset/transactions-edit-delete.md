---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
---

Corregir (`PATCH /api/v1/transactions/{id}`), borrar lógicamente (`DELETE`) y restaurar sin plazo (`POST /api/v1/transactions/{id}/restore`) una transacción, con los eventos `transactions.transaction.updated`, `…deleted` y `…restored`. El tipo cambia junto con una categoría de ese tipo, la moneda solo cambia si se indica, y el origen no se corrige.
