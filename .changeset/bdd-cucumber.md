---
'@sol-a-sol/api': patch
'@sol-a-sol/tooling': patch
---

Escenarios Gherkin ejecutables: `pnpm test:bdd` corre los `.feature` de `features/` con Cucumber contra el dominio y los casos de uso, con los fakes de los puertos (sin base de datos, sin Nest y sin navegador), y tiene su job de CI. Es estricto: un paso sin implementar falla. `transactions.feature` tiene todos sus pasos; los demás archivos, el escenario de la tasa de ahorro (H6) y el esqueleto que crea `pnpm gen:module` van con `@pendiente` hasta que tengan los suyos.
