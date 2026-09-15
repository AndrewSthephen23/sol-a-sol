import nextPlugin from '@next/eslint-plugin-next';
import base from '@sol-a-sol/config/eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';

// No se usa `eslint-config-next`: arrastra eslint-plugin-react 7.x, incompatible con ESLint 10.
// Se componen a mano los plugins que sí funcionan con ESLint 10.
export default defineConfig(
  globalIgnores(['.next/**', 'coverage/**', 'next-env.d.ts']),
  base,
  nextPlugin.configs['core-web-vitals'],
  reactHooks.configs.flat['recommended-latest'],
  jsxA11y.flatConfigs.recommended,
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
);
