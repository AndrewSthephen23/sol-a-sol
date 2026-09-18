# @sol-a-sol/tooling

## 0.2.0

### Minor Changes

- Hito H1 — Dominio base: paquete `@sol-a-sol/domain`, puro y sin dependencias, construido con TDD y con cobertura y mutation score al 100 %: `Money` con aritmética decimal exacta, redondeo bancario al presentar o persistir, reparto de cuotas sin perder céntimos y error al mezclar monedas; `parseAmount` y `findAmountInText` para leer montos escritos como texto (formato peruano, sin adivinar); `LocalDate` para fechas de negocio sin hora, con días de corte que no existen en el mes; y el puerto `Clock`, que saca `new Date()` de la lógica. Además, feature flags por módulo en la API (un módulo incompleto llega a `main` apagado y responde 404), navegación de la web armada leyendo los manifests de cada funcionalidad, y el generador `pnpm gen:module`, que crea y registra un módulo nuevo con sus cinco capas.

### Patch Changes

- bd5b817: Generador de módulos: `pnpm gen:module <nombre>` crea el módulo en la API con sus cinco capas, la funcionalidad en la web con su manifest, la ficha en `docs/modules/` y el esqueleto Gherkin, y lo registra en la navegación, en el `AppModule`, en `.env.example` (con su flag apagado) y en los scopes de commitlint. Si algún archivo no tiene la forma esperada, no escribe nada y explica qué falta.
