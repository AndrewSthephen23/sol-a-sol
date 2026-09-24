# ADR-0004: Eventos de dominio en memoria, esperados y con errores aislados

- **Estado:** Aceptada
- **Fecha:** 2026-09-24
- **Hito:** H3

## Contexto

El [ADR-0001](0001-monolito-modular.md) decidió que los módulos se comunican por su API pública o por **eventos de dominio**, con `@nestjs/event-emitter` al inicio. Hasta H3 no hacía falta ninguno. El primero aparece con la semilla de categorías: cada cuenta nueva debe recibir sus categorías iniciales **al registrarse**, pero `identity` no puede importar `catalog`. Después vendrán `TransactionCreated` y sus hermanos (H3), y más adelante los módulos de inversión y jubilación los escucharán sin tocar `transactions`.

Antes de que haya muchos, hay que decidir **cómo** se publican y se escuchan. Tres preguntas:

1. ¿Quien publica espera a quien escucha, o se entera después?
2. ¿Qué pasa si un oyente falla?
3. ¿Dónde viven el nombre y la forma de un evento?

## Decisión

- **Bus en memoria, en el mismo proceso:** `@nestjs/event-emitter` (sobre `eventemitter2`). Se publica por un puerto propio, `EventPublisher` (`apps/api/src/shared/events/`), y no con `EventEmitter2` directamente. Así los casos de uso se prueban con un publicador en memoria, y cambiar a una cola afecta a un solo adaptador.
- **Se espera a los oyentes** (`emitAsync`). Cuando una petición responde, lo que provocó ya pasó: las categorías existen apenas termina el registro. Una prueba o la web no tienen que esperar ni reintentar.
- **Un oyente que falla no tumba a quien publica.** Un evento cuenta algo que **ya ocurrió** (la cuenta ya existe), y quien escucha no puede deshacerlo. `@OnEvent` atrapa y registra el error (`suppressErrors`, activo por defecto). Cada oyente se hace cargo de su propio arreglo: la semilla tiene `pnpm db:seed` para las cuentas que se quedaron sin categorías.
- **Se publica después de guardar**, nunca antes: un oyente puede necesitar lo que se acaba de crear.
- **El nombre y la forma del evento son API pública** del módulo que lo publica: `identity/domain/events.ts`, exportado por su `index.ts`. El nombre sigue la forma `<modulo>.<entidad>.<hecho en pasado>` (`identity.user.registered`).
- **El evento lleva lo mínimo**, casi siempre solo ids (`{ userId }`). Quien necesita más lo pide por la API pública del otro módulo. Un evento con la entidad entera ata a los oyentes a su forma interna.

## Consecuencias

**Positivas**

- `identity` no sabe que `catalog` existe. Un módulo nuevo escucha eventos existentes sin tocar a quien los publica, que es el principio rector del plan.
- El comportamiento es determinista: al volver la petición, todo terminó, y las pruebas no necesitan esperas.
- Cambiar a una cola más adelante toca un adaptador (`EventEmitterPublisher`), no los casos de uso.

**Negativas y riesgos**

- **No hay entrega garantizada.** Si el proceso cae entre guardar y publicar, o un oyente falla, el evento se pierde. Hoy se compensa con comandos idempotentes (`pnpm db:seed`). Si un día un oyente no admite perder eventos (por ejemplo, una proyección de jubilación que no se puede recalcular), habrá que pasar a un _outbox_ en la base o a una cola, con un ADR nuevo.
- **Esperar a los oyentes suma su tiempo a la petición.** Sembrar 34 categorías es una transacción corta. Un oyente lento tendría que pasar a segundo plano, y eso cambiaría la segunda decisión.
- Los oyentes corren en la transacción de nadie: lo que guarda quien publica ya se confirmó antes de que escuchen.

## Alternativas consideradas

| Alternativa                                     | Por qué se descartó                                                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Que `identity` llame a `catalog`**            | Rompe la frontera del ADR-0001: `identity` sabría de `catalog`, y cada módulo que quiera reaccionar a un registro obligaría a tocar `identity` otra vez.       |
| **Publicar sin esperar** (`emit`)               | Las categorías aparecerían "en algún momento" después del registro: la web y las pruebas tendrían que esperar o reintentar, y un error se perdería sin rastro. |
| **Que el error de un oyente falle la petición** | La cuenta ya existe: responder 500 le diría al usuario que no se registró cuando sí lo hizo, y lo empujaría a intentarlo otra vez.                             |
| **Outbox en la base o una cola desde ya**       | Entrega garantizada a costa de una tabla, un proceso que la lea y reintentos. Hoy no hay oyente que lo necesite.                                               |
