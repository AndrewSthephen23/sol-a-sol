import base from '@sol-a-sol/config/eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(globalIgnores(['dist/**', 'coverage/**']), base, {
  languageOptions: {
    parserOptions: { tsconfigRootDir: import.meta.dirname },
  },
  rules: {
    // Los módulos de NestJS son clases vacías con decorador.
    '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
  },
});
