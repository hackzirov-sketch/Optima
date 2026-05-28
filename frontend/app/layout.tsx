import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from './providers';

const inter = localFont({
  src: [
    { path: '../public/fonts/inter-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/inter-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/inter-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/inter-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: '../public/fonts/inter-cyrillic-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/inter-cyrillic-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/inter-cyrillic-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../public/fonts/inter-cyrillic-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'UPZ - O\'zbekiston Professional Zumradi',
  description: 'Professional development platform for Uzbekistan',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <body className={inter.variable}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
