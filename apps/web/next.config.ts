import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Imagen Docker mínima (H0.5); la raíz del monorepo permite incluir los paquetes del workspace.
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // `next dev` escribiría un AGENTS.md y un CLAUDE.md en inglés dentro de apps/web: las reglas
  // para agentes viven en el CLAUDE.md de la raíz.
  agentRules: false,
};

export default nextConfig;
