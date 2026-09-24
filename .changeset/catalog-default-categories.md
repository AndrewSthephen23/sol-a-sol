---
'@sol-a-sol/api': patch
---

**Cada cuenta nueva nace con sus categorías.** Son 22 categorías y 12 subcategorías, con la lista acordada con el autor: ingresos, vivienda, suscripciones, comida, transporte, ahorro (incluida la CTS), inversión y deuda. Se crean al registrarse y se editan como cualquier otra.

- **Primer evento de dominio:** `identity` avisa que se registró una cuenta y `catalog` la siembra, sin que `identity` sepa que `catalog` existe. Usa `@nestjs/event-emitter` detrás de un puerto propio, y cómo se publican y escuchan los eventos queda en el ADR-0004.
- **`pnpm db:seed`** siembra las cuentas creadas antes de la semilla, pero solo las que no tienen ninguna categoría. Se puede correr las veces que haga falta sin duplicar nada. En producción es `node dist/seed.js`, y nunca corre solo.
