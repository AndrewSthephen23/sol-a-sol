/**
 * Escenarios Gherkin (`features/`) contra el dominio y los casos de uso, con los fakes de los
 * puertos: sin base de datos, sin Nest y sin navegador (decisión 7 de H3). `pnpm test:bdd`.
 *
 * - `strict`: un paso sin implementar falla la corrida, no pasa en silencio.
 * - `@pendiente`: escenarios que aún no tienen pasos, o que describen algo de un hito futuro. Se
 *   dejan fuera hasta implementarlos; quitar la etiqueta es la forma de sumarlos.
 */
export default {
  paths: ['../../features/**/*.feature'],
  import: ['test/bdd/**/*.ts'],
  tags: 'not @pendiente',
  strict: true,
  format: ['progress'],
};
