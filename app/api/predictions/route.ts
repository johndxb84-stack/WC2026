import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dailyOrder, validatePrediction } from '@/lib/domain';
const schema = z.object({ fixtureId: z.string(), userName: z.string(), homeScore: z.number().int().min(0), awayScore: z.number().int().min(0) });
export async function POST(request: Request) {
  const body = schema.parse(await request.json());
  const fixture = { id: body.fixtureId, kickoff: new Date('2026-06-15T19:00:00+04:00') };
  const result = validatePrediction(fixture, dailyOrder(fixture.kickoff), [], { ...body, submittedAt: new Date() });
  if (!result.ok) return NextResponse.json(result, { status: 409 });
  return NextResponse.json({ ok: true, prediction: body });
}
