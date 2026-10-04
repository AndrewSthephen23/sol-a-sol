import { defineConfig, globalIgnores } from 'eslint/config';

import base from './base.js';

const determinism = 'Un paquete puro es determinista';

/**
 * ESLint para un paquete **puro** (`@sol-a-sol/domain`, `@sol-a-sol/capture-parsers`): la base
 * del monorepo más las reglas de CLAUDE.md verificadas automáticamente. Valen también en las
 * pruebas: ninguna debe depender del reloj real ni de valores aleatorios.
 *
 * @param {string} tsconfigRootDir la carpeta del paquete (`import.meta.dirname`).
 */
export default function pure(tsconfigRootDir) {
  return defineConfig(
    globalIgnores(['dist/**', 'coverage/**', 'reports/**', '.stryker-tmp/**']),
    base,
    {
      languageOptions: {
        parserOptions: { tsconfigRootDir },
      },
    },
    {
      files: ['src/**/*.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "NewExpression[callee.name='Date'][arguments.length=0]",
            message: `${determinism}: nunca \`new Date()\`. Recibe la fecha como parámetro o usa el puerto Clock.`,
          },
          {
            selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
            message: `${determinism}: nunca \`Date.now()\`. Usa el puerto Clock.`,
          },
          {
            selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
            message: `${determinism}: nunca \`Math.random()\`.`,
          },
        ],
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                regex: '^node:',
                message: 'Un paquete puro no usa APIs de Node (ADR-0001).',
              },
              {
                regex: '^(@nestjs|@prisma|next|react|react-dom)(/|$)',
                message:
                  'Un paquete puro no depende de frameworks ni de la base de datos (ADR-0001).',
              },
            ],
          },
        ],
      },
    },
  );
}
