---
'@sol-a-sol/web': patch
'@sol-a-sol/api': patch
---

Cliente de API para la web: `pnpm api:client` exporta el documento OpenAPI de la API con todos los módulos encendidos (sin arrancar Nest ni tocar la base) y genera con `openapi-typescript` los tipos de `apps/web/src/shared/api/schema.gen.ts`, que la web usa con `openapi-fetch`. El archivo se regenera, no se edita, y un job de CI falla si quedó desactualizado.
