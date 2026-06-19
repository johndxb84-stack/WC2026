import { NextResponse } from 'next/server';
import { getVapidKeys } from '@/lib/vapid-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const keys = await getVapidKeys();
  if (!keys) return NextResponse.json({ error: 'Push not configured' }, { status: 503 });
  return NextResponse.json({ publicKey: keys.publicKey });
}
