import { NextResponse } from 'next/server';
import { z } from 'zod';
import { saveSubscription, removeSubscription } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const subSchema = z.object({
  player: z.string(),
  subscription: z.object({
    endpoint: z.string(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
  }),
});

export async function POST(req: Request) {
  try {
    const { player, subscription } = subSchema.parse(await req.json());
    await saveSubscription(player, subscription);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { player, subscription } = subSchema.parse(await req.json());
    await removeSubscription(player, subscription.endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
