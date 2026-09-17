/**
 * Conventional Commits con scope del módulo (ver plan, sección 11.3).
 * El scope es opcional, pero si se usa debe ser uno de la lista.
 *
 * @type {import('@commitlint/types').UserConfig}
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        // Módulos de negocio
        'identity',
        'catalog',
        'transactions',
        'budgeting',
        'credit-cards',
        'goals',
        'reports',
        'capture',
        // Apps y paquetes
        'api',
        'web',
        'domain',
        'contracts',
        'capture-parsers',
        'ui',
        'config',
        'tooling',
        // Transversales
        'db',
        'docker',
        'ci',
        'deps',
        'docs',
        'security',
        'release',
        'repo',
      ],
    ],
  },
};
