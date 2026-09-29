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
  // No anunciar con qué está hecha la web.
  poweredByHeader: false,
  // Cabeceras fijas, en todo lo que sirve la web. La política de contenido va aparte, en
  // `proxy.ts`, porque lleva un nonce distinto en cada petición.
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Lo mismo que `frame-ancestors 'none'`, para navegadores que no leen la CSP.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ]);
  },
};

export default nextConfig;
