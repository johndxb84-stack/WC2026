'use client';
import { usePathname } from 'next/navigation';
import { useIdentity } from '@/lib/useIdentity';
import { BallIcon, ChartIcon, UserIcon } from '@/components/icons';

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
        <span className="nav-ico"><BallIcon size={21} /></span>
        Arena
      </a>
      <a href="/stats" className={isStats ? 'active' : ''}>
        <span className="nav-ico"><ChartIcon size={21} /></span>
        Stats
      </a>
      <a href="/#you" className={!isArena && !isStats ? 'active' : ''}>
        <span className="nav-ico">{me ? <span className="nav-initial">{me[0]}</span> : <UserIcon size={21} />}</span>
        {me ?? 'You'}
      </a>
    </nav>
  );
}
