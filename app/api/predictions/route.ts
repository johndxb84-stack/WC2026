import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { dailyOrder, validatePrediction } from '@/lib/domain';

const schema = z.object({
  fixtureId: z.string(),
  userName: z.string(),
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
});

export async function GET() {
  try {
    const [fixtures, predictions, users] = await Promise.all([
      prisma.fixture.findMany({
        where: { competition: { active: true } },
        include: { homeTeam: true, awayTeam: true },
        orderBy: { scheduledKickoff: 'asc' },
      }),
      prisma.prediction.findMany({
        include: { user: true, score: true },
      }),
      prisma.user.findMany({
        where: { role: 'PLAYER', active: true },
        include: { predictions: { include: { score: true } } },
        orderBy: { name: 'asc' },
      }),
    ]);

    type UserWithPreds = { id: string; name: string; avatarUrl: string | null; predictions: { score: { totalPoints: number } | null }[] };
    const players = (users as UserWithPreds[]).map(u => ({
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl,
      totalPoints: u.predictions.reduce((sum, p) => sum + (p.score?.totalPoints ?? 0), 0),
    }));

    return NextResponse.json({ fixtures, predictions, players });
  } catch (err) {
    console.error('GET /api/predictions failed:', err);
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());

    const fixture = await prisma.fixture.findFirst({
      where: { OR: [{ id: body.fixtureId }, { providerFixtureId: body.fixtureId }] },
    });
    if (!fixture) return NextResponse.json({ ok: false, reason: 'Fixture not found.' }, { status: 404 });

    const user = await prisma.user.findUnique({ where: { name: body.userName } });
    if (!user) return NextResponse.json({ ok: false, reason: 'User not found.' }, { status: 404 });

    const order = dailyOrder(fixture.scheduledKickoff);

    const existing = await prisma.prediction.findMany({
      where: { fixtureId: fixture.id },
      include: { user: true },
    });

    const existingForDomain = existing
      .filter(p => p.status !== 'WAITING')
      .map(p => ({
        userName: p.user.name,
        homeScore: p.predictedHomeScore90 ?? 0,
        awayScore: p.predictedAwayScore90 ?? 0,
        submittedAt: p.submittedAt ?? new Date(),
        forfeited: p.status === 'FORFEITED',
      }));

    const result = validatePrediction(
      { id: fixture.id, kickoff: fixture.scheduledKickoff },
      order,
      existingForDomain,
      { ...body, submittedAt: new Date() },
    );
    if (!result.ok) return NextResponse.json(result, { status: 409 });

    const prediction = await prisma.prediction.upsert({
      where: { fixtureId_userId: { fixtureId: fixture.id, userId: user.id } },
      update: {
        predictedHomeScore90: body.homeScore,
        predictedAwayScore90: body.awayScore,
        submittedAt: new Date(),
        status: 'SUBMITTED',
      },
      create: {
        fixtureId: fixture.id,
        userId: user.id,
        turnPosition: (order as string[]).indexOf(body.userName),
        predictedHomeScore90: body.homeScore,
        predictedAwayScore90: body.awayScore,
        submittedAt: new Date(),
        status: 'SUBMITTED',
      },
    });

    return NextResponse.json({ ok: true, prediction });
  } catch (err) {
    console.error('POST /api/predictions failed:', err);
    return NextResponse.json({ ok: false, reason: 'Server error.' }, { status: 500 });
  }
}
