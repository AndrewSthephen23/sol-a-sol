# Architecture Decision Records

Cada decisión técnica estructural se registra aquí, con su contexto y sus consecuencias, para poder releerla (o revertirla) meses después sabiendo **por qué** se tomó.

| ADR                                  | Título                                                          | Estado   |
| ------------------------------------ | --------------------------------------------------------------- | -------- |
| [0001](0001-monolito-modular.md)     | Monolito modular con arquitectura hexagonal                     | Aceptada |
| [0002](0002-stack-typescript.md)     | TypeScript de punta a punta en un monorepo                      | Aceptada |
| [0003](0003-docker-desarrollo-ci.md) | Docker para desarrollo y CI; hosting en H8                      | Aceptada |
| [0004](0004-eventos-de-dominio.md)   | Eventos de dominio en memoria, esperados y con errores aislados | Aceptada |

## Cuándo escribir un ADR

- Se introduce o se reemplaza una tecnología estructural (base de datos, framework, cola, proveedor).
- Se cambia una frontera de la arquitectura (módulos, capas, contratos).
- Se toma una decisión con consecuencias difíciles de revertir (modelo de datos, autenticación, hosting).

Un cambio de versión, una dependencia menor o un refactor local **no** necesitan ADR: basta el PR.

## Formato

Copiar `0001-monolito-modular.md` como base. Secciones: **Estado**, **Contexto**, **Decisión**, **Consecuencias** (positivas, negativas y riesgos) y **Alternativas consideradas**.

- Numeración correlativa de cuatro dígitos y nombre en kebab-case.
- Los ADR **no se editan** cuando la decisión cambia: se escribe uno nuevo que la supersede y se marca el anterior como `Superseded por ADR-XXXX`.
