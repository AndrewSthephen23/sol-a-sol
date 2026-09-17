import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Configuración ESLint base para todo el monorepo (flat config). */
export default defineConfig(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/.turbo/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true },
    },
  },
  {
    // Archivos de configuración de herramientas: no forman parte de ningún tsconfig de código.
    files: ['**/*.{js,mjs,cjs}', '**/*.config.{ts,mts}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
