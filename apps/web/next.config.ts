import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Imagen Docker mínima (H0.5); la raíz del monorepo permite incluir los paquetes del workspace.
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
};

export default nextConfig;
