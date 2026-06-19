'use client';
import { useCallback, useEffect, useState } from 'react';

export const PLAYERS = ['Anthony', 'Nicolas', 'Jean'] as const;
export type PlayerName = (typeof PLAYERS)[number];

const KEY = 'anj:player';

function isPlayer(v: string | null): v is PlayerName {
  return v != null && (PLAYERS as readonly string[]).includes(v);
}

/**
 * Remembers which of the three players is using *this device*, in localStorage.
 * Purely client-side personalization — it never bypasses the server-side reveal
 * rules, it just pre-selects you and surfaces when it's your turn.
 */
export function useIdentity() {
  const [me, setMe] = useState<PlayerName | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (isPlayer(stored)) setMe(stored);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const choose = useCallback((name: PlayerName) => {
    setMe(name);
    try { localStorage.setItem(KEY, name); } catch { /* ignore */ }
  }, []);

  const clear = useCallback(() => {
    setMe(null);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }, []);

  return { me, ready, choose, clear };
}
