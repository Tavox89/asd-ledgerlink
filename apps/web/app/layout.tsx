import type { Metadata } from 'next';

import { Providers } from '../components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'LedgerLink de ASD Labs',
  description: 'Espacio de conciliación financiera basado en evidencia.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
