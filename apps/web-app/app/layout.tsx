import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { ThemeProvider } from '@/components/theme-provider';

import './globals.css';

export const metadata: Metadata = {
  title: 'Voodoo SaaS Dashboard',
  description: 'Multi-tenant Discord ticket-to-sale control panel',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

