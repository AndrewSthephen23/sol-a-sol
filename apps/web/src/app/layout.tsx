import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';

import { QueryProvider } from '@/shared/api/query-provider';
import { SessionProvider } from '@/shared/session/session-provider';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'Sol a Sol',
  description: 'Ordena tus finanzas y avanza hacia la libertad financiera, sol a sol.',
  applicationName: 'Sol a Sol',
};

export const viewport: Viewport = {
  themeColor: '#f59e0b',
};

/**
 * Toda página se renderiza **por petición** (`connection`): la política de contenido lleva un
 * nonce nuevo cada vez, y Next solo puede ponérselo a sus scripts al renderizar. Una página
 * prerenderizada en el build no tendría nonce y sus scripts no correrían.
 */
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  await connection();

  return (
    <html lang="es-PE">
      <body className="min-h-dvh bg-stone-50 text-stone-900 antialiased">
        <SessionProvider>
          <QueryProvider>{children}</QueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
