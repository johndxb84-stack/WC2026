'use client';
import { useCallback, useEffect, useState } from 'react';
import type { PlayerName } from './useIdentity';

function urlBase64ToUint8Array(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

type Status = 'unsupported' | 'default' | 'subscribed' | 'denied';

export function useNotifications(me: PlayerName | null) {
  const [status, setStatus] = useState<Status>('default');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') { setStatus('denied'); return; }
    // Check if already subscribed
    navigator.serviceWorker.getRegistration('/sw.js').then(async reg => {
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (sub) setStatus('subscribed');
    });
  }, []);

  const subscribe = useCallback(async () => {
    if (!me || loading) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const { publicKey } = await fetch('/api/push/keys').then(r => r.json()) as { publicKey: string };
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player: me, subscription: sub.toJSON() }),
      });
      setStatus('subscribed');
    } catch {
      if (Notification.permission === 'denied') setStatus('denied');
    } finally {
      setLoading(false);
    }
  }, [me, loading]);

  const unsubscribe = useCallback(async () => {
    if (!me || loading) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      await sub.unsubscribe();
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player: me, subscription: sub.toJSON() }),
      });
      setStatus('default');
    } finally {
      setLoading(false);
    }
  }, [me, loading]);

  return { status, loading, subscribe, unsubscribe };
}
