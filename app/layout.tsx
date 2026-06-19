import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { BottomNav } from '@/components/BottomNav';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'ANJ Predictions · World Cup 2026',
  description: 'Anthony · Nicolas · Jean — private World Cup 2026 prediction game',
};

export const viewport: Viewport = {
  themeColor: '#080412',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <div className="blobs" aria-hidden="true">
          <div className="blob blob-lavender" />
          <div className="blob blob-peach" />
          <div className="blob blob-mint" />
          <div className="blob blob-amber" />
        </div>
        <div className="has-bottom-nav" style={{ position: 'relative', zIndex: 1 }}>
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
