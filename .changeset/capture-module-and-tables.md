---
'@sol-a-sol/api': patch
'@sol-a-sol/web': patch
---

Empieza el hito **H7**: nace el módulo `capture` («Bandeja», apagado con `FEATURE_CAPTURE=false`) con sus tablas, `captures` y `categorization_rules`. Todavía no tiene endpoints.

- Una captura guarda el pedido crudo del teléfono hasta confirmarla, el instante y su día en Lima, lo que se entendió (monto mayor que cero en `NUMERIC(18,2)`, con moneda o sin ella, comercio, últimos 4 dígitos, tipo, categoría y método), sus avisos y su estado: por revisar, duplicada, confirmada (con su transacción) o descartada (con su fecha).
- La clave de idempotencia es única por cuenta, y la base exige que categoría, método y transacción sean de la misma cuenta.
- Una regla de categorización tiene un patrón único por cuenta sin tildes ni mayúsculas, una categoría y una prioridad de 0 en adelante.
- `transactions.capture_id` recibe por fin su clave foránea.

Las reglas de la captura, decididas con el autor, quedan escritas en `docs/modules/capture.md`.
