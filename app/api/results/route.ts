import { NextResponse } from 'next/server';
import { z } from 'zod';
import { settleFixtureOnce } from '@/lib/settlement';
const schema = z.object({ fixture: z.any(), predictions: z.array(z.any()) });
export async function POST(request: Request) { const body = schema.parse(await request.json()); return NextResponse.json(settleFixtureOnce(body.fixture, body.predictions)); }
