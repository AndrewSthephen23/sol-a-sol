# ADR-0005: Fusionar categorías: `catalog` decide y anuncia, `transactions` mueve sus filas

- **Estado:** Aceptada
- **Fecha:** 2026-09-28
- **Hito:** H3

## Contexto

El autor necesita **fusionar categorías** ("Gaseosa" en "Bebidas") para ordenar lo que trae su hoja de cálculo: las transacciones de la origen pasan a la destino, sus hijas se mudan con ella y la origen se archiva. Decidido con él el 2026-09-28; no se deshace.

La operación cruza dos módulos: `catalog` es dueño de las categorías y `transactions` de las filas que las usan. La dependencia ya va en un sentido: `transactions` importa la API pública de `catalog` (`CatalogLookup`), así que `catalog` **no puede** importar `transactions` sin crear un ciclo. Además, el presupuesto (H4) tendrá partidas por categoría que también deberán seguir a una fusión.

Hay que decidir quién orquesta la fusión y qué pasa si una parte falla.

## Decisión

- **`catalog` decide y ejecuta su parte:** valida la fusión con `planCategoryMerge` (dominio), muda las hijas y archiva los orígenes **en una sola transacción de su base**.
- **`catalog` anuncia cada fusión** con `catalog.category.merged { userId, fromId, intoId }`, un evento por par (la pedida y, si hay, las de hijas del mismo nombre). El evento es API pública de `catalog`.
- **`transactions` escucha y mueve sus filas** (`ReassignCategory`): todas las de la origen, **borradas incluidas**, pasan a la destino. La clave foránea compuesta `(category_id, user_id, type)` vuelve a exigir que la destino sea de la misma cuenta y del mismo tipo.
- **Recuperación:** fusionar una origen **ya archivada** se permite y vuelve a anunciarse. Si un oyente falló, repetir la fusión mueve lo que quedó. Mover es idempotente: la segunda vez no hay filas que mover.
- **Vista previa:** los totales del listado de transacciones traen `count`. `GET /transactions?categoryId=<origen>` (que incluye sus hijas) dice cuántas se moverán, sin un endpoint nuevo que obligue a `catalog` a contar filas ajenas.

## Consecuencias

**Positivas**

- Se respeta la frontera del ADR-0001: `catalog` no sabe que `transactions` existe.
- El presupuesto (H4) escuchará el mismo evento para mover sus partidas **sin tocar `catalog` ni `transactions`**, que es el principio rector del plan.
- Cada módulo cambia solo sus propias tablas.

**Negativas y riesgos**

- **No es atómica entre módulos.** Si el oyente falla después de que `catalog` confirmó, la origen queda archivada con transacciones sin mover. El daño es acotado: una categoría archivada sigue siendo válida en transacciones ya registradas, así que no hay datos rotos, solo una fusión a medias. Se repara volviendo a fusionar (ver Recuperación). El error queda en el log (`@OnEvent` lo registra, ADR-0004).
- Esperar al oyente (`emitAsync`) suma a la petición el tiempo de mover las filas. Con los volúmenes de una persona es un solo `UPDATE`.

## Alternativas consideradas

| Alternativa                                                                                  | Por qué se descartó                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`transactions` orquesta** (endpoint en `transactions` que llama a `catalog` para archivar) | La ruta es de categorías y viviría en otro módulo; `catalog` tendría que exponer escrituras a otros. Y el presupuesto (H4) quedaría acoplado a `transactions` para enterarse.                             |
| **Una sola transacción de base para las dos partes**                                         | Obligaría a que un módulo escriba en las tablas del otro o a compartir un cliente transaccional entre módulos: rompe las fronteras por una atomicidad que el caso no necesita.                            |
| **Outbox o cola con reintentos**                                                             | Entrega garantizada a costa de una tabla y un proceso más. Con la recuperación por repetición alcanza hoy; si un oyente futuro no la admite, se revisa con un ADR nuevo (lo mismo que prevé el ADR-0004). |
