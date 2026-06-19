'use client';
import { usePathname } from 'next/navigation';
import { useIdentity } from '@/lib/useIdentity';

// Sticky tab bar for phones. Hidden on md+ where the in-page links are roomy
// enough. Arena · Stats · You — "You" reflects the saved identity.
export function BottomNav() {
  const pathname = usePathname();
  const { me } = useIdentity();

  const isArena = pathname === '/' || pathname.startsWith('/matches');
  const isStats = pathname.startsWith('/stats');

  return (
    <nav className="bottom-nav md:hidden" aria-label="Primary">
      <a href="/" className={isArena ? 'active' : ''}>
        <span className="nav-ico">⚽</span>
        Arena
      </a>
      <a href="/stats" className={isStats ? 'active' : ''}>
        <span className="nav-ico">📊</span>
        Stats
      </a>
      <a href="/#you" className={!isArena && !isStats ? 'active' : ''}>
        <span className="nav-ico">{me ? me[0] : '👤'}</span>
        {me ?? 'You'}
      </a>
    </nav>
  );
}
