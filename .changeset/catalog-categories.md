---
'@sol-a-sol/api': patch
'@sol-a-sol/domain': patch
'@sol-a-sol/contracts': patch
---

Categorías en la API (`catalog`, todavía **apagado**): `GET`, `POST` y `PATCH` de `/api/v1/categories`, con las subcategorías anidadas. No hay `DELETE`: una categoría se archiva.

- **Un solo nivel de subcategorías.** La subcategoría hereda el tipo de su madre, y también su color e ícono si no se indican.
- **El nombre no se repite** entre hermanas del mismo tipo, sin distinguir mayúsculas **ni acentos** ("Café" = "cafe"). La ñ sí cuenta.
- **Archivar una categoría archiva sus subcategorías.** Al restaurarla vuelven solo las que se archivaron con ella, y una subcategoría no se restaura mientras su madre siga archivada.
- **El tipo y la madre no se cambian.** Archivar no reescribe las transacciones que ya usan la categoría.
