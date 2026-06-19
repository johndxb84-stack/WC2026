import { redisCommand } from './redis-store';

type VapidKeys = { publicKey: string; privateKey: string };
const KEY = 'wc2026:vapid';

export async function getVapidKeys(): Promise<VapidKeys | null> {
  // Prefer stable env vars set in Vercel dashboard
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  // Fall back to auto-generated keys stored in Redis
  try {
    const raw = await redisCommand<string>(['GET', KEY]);
    if (raw) return JSON.parse(raw) as VapidKeys;
    const { generateVAPIDKeys } = await import('web-push');
    const keys = generateVAPIDKeys();
    await redisCommand(['SET', KEY, JSON.stringify(keys)]);
    return keys;
  } catch {
    return null;
  }
}
