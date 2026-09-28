---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/domain': patch
---

Gestión de etiquetas: `GET /api/v1/tags` (con cuántas transacciones vigentes usan cada una), `PATCH /api/v1/tags/{id}` para renombrar (con el nombre de otra etiqueta, las fusiona) y `DELETE /api/v1/tags/{id}`, que la quita de todas las transacciones.
