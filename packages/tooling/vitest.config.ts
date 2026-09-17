import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: [
        'text',
        ['lcov', { projectRoot: fileURLToPath(new URL('../..', import.meta.url)) }],
      ],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/cli.ts'],
    },
  },
});
