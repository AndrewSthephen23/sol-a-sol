---
'@sol-a-sol/api': patch
'@sol-a-sol/contracts': patch
'@sol-a-sol/domain': patch
---

Listado de transacciones (`GET /api/v1/transactions`): filtros por mes o rango, tipo, categoría (con sus subcategorías), método de pago y moneda; búsqueda sin mayúsculas ni tildes; paginación por cursor estable ante altas y bajas; y totales por moneda de todo lo filtrado. En el dominio, `totalsByCurrency` y `searchKey`, que ahora comparte `categoryNameKey`.
