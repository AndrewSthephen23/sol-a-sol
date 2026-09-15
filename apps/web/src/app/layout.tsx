import type { Metadata, Viewport } from 'next';
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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es-PE">
      <body className="min-h-dvh bg-stone-50 text-stone-900 antialiased">{children}</body>
    </html>
  );
}
