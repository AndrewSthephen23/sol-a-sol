---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/domain': patch
---

Registrar una transacción (`POST /api/v1/transactions`) y leerla por su id (`GET /api/v1/transactions/{id}`), con el evento `transactions.transaction.created`. El monto viaja como string decimal y se guarda sin pérdida en `NUMERIC(18,2)`. Nueva regla de dominio: un método de pago archivado no se usa en transacciones nuevas (`PAYMENT_METHOD_ARCHIVED`). `catalog` expone `CatalogLookup` para que otros módulos comprueben categorías y métodos de pago.
