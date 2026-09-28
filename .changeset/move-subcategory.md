---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/domain': patch
---

Mudar una subcategoría a otra madre de primer nivel, del mismo tipo y activa, con todas sus transacciones (`parentId` en `PATCH /api/v1/categories/{id}`). Una categoría de primer nivel no se muda (`ONLY_SUBCATEGORIES_MOVE`).
