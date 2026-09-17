import base from '@sol-a-sol/config/eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

const determinism = 'El dominio es determinista';

export default defineConfig(
  globalIgnores(['dist/**', 'coverage/**', 'reports/**', '.stryker-tmp/**']),
  base,
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // Reglas de CLAUDE.md verificadas automáticamente (también en las pruebas:
    // ninguna prueba debe depender del reloj real ni de valores aleatorios).
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
              message: 'El dominio es puro: sin APIs de Node (ADR-0001).',
            },
            {
              regex: '^(@nestjs|@prisma|next|react|react-dom)(/|$)',
              message: 'El dominio no depende de frameworks ni de la base de datos (ADR-0001).',
            },
          ],
        },
      ],
    },
  },
);
