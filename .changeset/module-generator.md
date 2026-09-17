---
'@sol-a-sol/tooling': patch
---

Generador de módulos: `pnpm gen:module <nombre>` crea el módulo en la API con sus cinco capas, la funcionalidad en la web con su manifest, la ficha en `docs/modules/` y el esqueleto Gherkin, y lo registra en la navegación, en el `AppModule`, en `.env.example` (con su flag apagado) y en los scopes de commitlint. Si algún archivo no tiene la forma esperada, no escribe nada y explica qué falta.
