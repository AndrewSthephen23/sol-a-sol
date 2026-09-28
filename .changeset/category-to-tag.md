---
'@sol-a-sol/api': patch
'@sol-a-sol/domain': patch
---

Convertir una subcategoría en etiqueta (`POST /api/v1/categories/{id}/convert-to-tag`): se fusiona en su madre y sus transacciones quedan con la etiqueta de su nombre. El evento `catalog.category.merged` gana el campo opcional `tag`.
