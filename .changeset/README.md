# Changesets

Cada PR que cambia un paquete (`apps/*` o `packages/*`) incluye un archivo en esta carpeta que describe el cambio y cuánto sube la versión. Se crea con:

```bash
pnpm changeset
```

- Todos los paquetes `@sol-a-sol/*` comparten **una sola versión** (grupo `fixed` en `config.json`): la versión es la del producto, no la de cada paquete.
- Mientras estemos en `0.x`: **`minor`** para cerrar un hito del plan (H1 → 0.2.0, H2 → 0.3.0…) y **`patch`** para correcciones o cambios dentro del hito.
- Si el PR no necesita versión (refactor interno, pruebas, CI): `pnpm changeset --empty`.

El proceso completo de release está en [`CONTRIBUTING.md`](../CONTRIBUTING.md#versionado-y-releases).
