---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/domain': patch
---

Fusionar categorías (`POST /api/v1/categories/{id}/merge`): sus transacciones pasan a la destino, sus hijas se mudan con ella y la origen se archiva. `catalog` fusiona y publica `catalog.category.merged`; `transactions` lo escucha y mueve sus filas (ADR-0005). Los totales del listado traen `count`, que sirve de vista previa.
