# ADR-0001: Monolito modular con arquitectura hexagonal

- **Estado:** Aceptada
- **Fecha:** 2026-09-15
- **Hito:** H0

## Contexto

Sol a Sol es una plataforma personal de finanzas que crecerá por fases: primero finanzas personales, presupuesto y tarjetas; después inversiones (bolsa de EE. UU., ETFs y fondos, BVL) y finalmente jubilación y FIRE.

Tres condiciones marcan la decisión:

1. **Un solo desarrollador**, que además está aprendiendo finanzas mientras construye. Las reglas de negocio se van a descubrir y corregir sobre la marcha.
2. **Se deben poder agregar módulos nuevos sin modificar los existentes.** Es el principio rector del proyecto.
3. **Presupuesto de operación cercano a cero** y necesidad de que todo corra en una laptop con un solo comando.

Microservicios darían independencia de despliegue, pero traen su costo: red entre servicios, consistencia eventual, despliegues y observabilidad multiplicados. Para un equipo de una persona, ese costo se paga en tiempo que no se dedica al dominio.

## Decisión

Se construye un **monolito modular** con **arquitectura hexagonal** (puertos y adaptadores) dentro de cada módulo.

- Cada capacidad de negocio es un módulo autocontenido en `apps/api/src/modules/<modulo>/`: `domain/`, `application/`, `ports/`, `infrastructure/`, `http/`.
- Reglas de dependencia:
  - `domain` no importa nada externo (ni framework, ni ORM, ni otros módulos);
  - `application` depende de `domain` y `ports`, nunca de `infrastructure`;
  - `http` e `infrastructure` dependen de `application`.
- **Un módulo no importa el interior de otro.** Se comunican por la API pública del módulo (su `index.ts`) o por **eventos de dominio** (`@nestjs/event-emitter` al inicio, reemplazable por una cola).
- La lógica de cálculo vive en el paquete puro `@sol-a-sol/domain`, sin dependencias de framework ni de base de datos.
- Las reglas de dependencia se verifican automáticamente en CI (`eslint-plugin-boundaries` o `dependency-cruiser`).

## Consecuencias

**Positivas**

- Un solo despliegue, un solo repositorio y una sola base de datos: menos piezas que operar.
- Las transacciones de negocio son transacciones de base de datos reales, sin consistencia eventual.
- Un módulo nuevo (por ejemplo `retirement`) escucha eventos existentes y no obliga a tocar los módulos previos.
- Las fronteras explícitas permiten extraer un módulo a un servicio aparte más adelante, si alguna vez hace falta.

**Negativas y riesgos**

- Nada impide técnicamente importar el interior de otro módulo: hace falta la verificación automática en CI, o las fronteras se erosionan.
- Todo escala junto; no se puede dar más recursos a un módulo concreto.
- Un error grave puede afectar a toda la aplicación, no solo a un servicio.

**Mitigaciones**

- Regla de dependencias bloqueante en CI.
- Eventos de dominio desde el día 1, para que los módulos nuevos ya nazcan desacoplados.
- Feature flags por módulo (`FEATURE_<MODULO>`), para integrar código incompleto sin exponerlo.

## Alternativas consideradas

| Alternativa                                   | Por qué se descartó                                                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Microservicios desde el inicio**            | Costo operativo desproporcionado para un desarrollador; consistencia eventual innecesaria en este dominio.                              |
| **Monolito sin módulos (por capas técnicas)** | `controllers/`, `services/`, `repositories/` mezclan todos los dominios; agregar una fase nueva obligaría a tocar carpetas compartidas. |
| **Serverless por función**                    | Arranques en frío, límites de conexión a PostgreSQL y peor experiencia de desarrollo local.                                             |
