---
'@sol-a-sol/api': minor
'@sol-a-sol/web': minor
---

Cierra el hito **H4 — Presupuesto y dashboard**: ya se puede planear el mes y ver cómo va. Los módulos `budgeting` y `reports` quedan **encendidos** (`FEATURE_BUDGETING=true`, `FEATURE_REPORTS=true`):

- **Presupuesto** por categoría madre y moneda, para cualquier mes, con lo real al lado: lo que queda o cuánto me pasé en un límite, lo que falta o si se cumplió una meta, el % ejecutado y lo gastado sin partida. Se copia del mes anterior completando solo lo que falta y sigue las fusiones de categorías.
- **Dashboard del mes** en la página de inicio: KPIs por moneda, gasto por día, dona por categoría y tablas por tipo, con cada gráfico explicado también en texto y la política de contenido todavía sin `'unsafe-inline'`.

El aislamiento por usuario está probado en los 4 endpoints nuevos con la sesión de otra cuenta, los escenarios Gherkin de los dos módulos se ejecutan (cada regla se comprobó rompiéndola) y la checklist de OWASP ASVS queda al día.
