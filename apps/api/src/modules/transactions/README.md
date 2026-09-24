# Transacciones (`transactions`)

Ingresos, gastos, ahorro, inversión y pagos de deuda de cada usuario: el núcleo sobre el que calculan presupuesto, tarjetas y resúmenes.

- **Feature flag:** `FEATURE_TRANSACTIONS`
- **Capas:** `domain`, `application`, `ports`, `infrastructure`, `http` (ver [ADR-0001](../../../../docs/adr/0001-monolito-modular.md))
- **Reglas de negocio:** `packages/domain/src/transactions/`
- **Ficha completa:** [`docs/modules/transactions.md`](../../../../docs/modules/transactions.md)
