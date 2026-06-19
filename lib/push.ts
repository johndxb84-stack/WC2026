import { redisCommand } from './redis-store';
import { getVapidKeys } from './vapid-store';

type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };

const SUBS_KEY = (name: string) => `wc2026:push:subs:${name}`;
const SUBJECT = process.env.NEXT_PUBLIC_APP_URL ?? 'https://anjfifapredictions.com';

export async function saveSubscription(player: string, sub: PushSub) {
  const raw = (await redisCommand<string>(['GET', SUBS_KEY(player)])) ?? '[]';
  const subs: PushSub[] = JSON.parse(raw);
  const deduped = subs.filter(s => s.endpoint !== sub.endpoint);
  deduped.push(sub);
  await redisCommand(['SET', SUBS_KEY(player), JSON.stringify(deduped)]);
}

export async function removeSubscription(player: string, endpoint: string) {
  const raw = (await redisCommand<string>(['GET', SUBS_KEY(player)])) ?? '[]';
  const subs: PushSub[] = JSON.parse(raw);
  await redisCommand(['SET', SUBS_KEY(player), JSON.stringify(subs.filter(s => s.endpoint !== endpoint))]);
}

export async function pushToPlayer(player: string, title: string, body: string, url = '/') {
  const vapid = await getVapidKeys();
  if (!vapid) return;
  const raw = (await redisCommand<string>(['GET', SUBS_KEY(player)])) ?? '[]';
  const subs: PushSub[] = JSON.parse(raw);
  if (subs.length === 0) return;

  const { default: webpush } = await import('web-push');
  webpush.setVapidDetails(`mailto:noreply@${SUBJECT.replace(/https?:\/\//, '')}`, vapid.publicKey, vapid.privateKey);
  const payload = JSON.stringify({ title, body, url });
  const dead: string[] = [];

  await Promise.allSettled(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(sub as Parameters<typeof webpush.sendNotification>[0], payload);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) dead.push(sub.endpoint);
      }
    }),
  );

  if (dead.length > 0) {
    const alive = subs.filter(s => !dead.includes(s.endpoint));
    await redisCommand(['SET', SUBS_KEY(player), JSON.stringify(alive)]);
  }
}

export async function pushToAll(players: string[], title: string, body: string, url = '/') {
  await Promise.allSettled(players.map(p => pushToPlayer(p, title, body, url)));
}
