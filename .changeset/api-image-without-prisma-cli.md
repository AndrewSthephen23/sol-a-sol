---
'@sol-a-sol/api': patch
---

La imagen de producción de la API ya no lleva la CLI de Prisma. `@prisma/client` declara `prisma` y `typescript` como peers opcionales, y pnpm los resolvía por estar en el workspace, así que `deploy --prod` los copiaba junto con `@prisma/engines`, `@prisma/studio-core` y `@electric-sql/pglite`: unos 190 MB y dos vulnerabilidades HIGH en código que nunca se ejecuta. Con `--no-optional`, la imagen solo contiene lo que la API usa en runtime (el cliente generado y `@prisma/adapter-pg`): `node_modules` baja de 362 MB a 98 MB y la imagen de 865 MB a 523 MB.
