import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = ['Nicolas', 'Jean', 'Anthony'];
  for (const name of users) {
    await prisma.user.upsert({
      where: { name },
      update: {},
      create: {
        name,
        role: Role.PLAYER,
        avatarUrl: `/avatars/${name.toLowerCase()}.svg`,
        pinHash: 'demo-pin',
      },
    });
  }

  await prisma.user.upsert({
    where: { name: 'Admin' },
    update: {},
    create: { name: 'Admin', role: Role.ADMIN, pinHash: 'admin' },
  });

  const comp = await prisma.competition
    .create({
      data: {
        name: 'FIFA World Cup',
        season: '2026',
        timezone: 'Asia/Dubai',
        active: true,
        providerCompetitionId: 'mock-wc-2026',
      },
    })
    .catch(() => null);

  if (comp) {
    const [mex, rsa, usa, can] = await Promise.all(
      ['Mexico', 'South Africa', 'United States', 'Canada'].map(n =>
        prisma.team.create({
          data: { name: n, shortName: n.slice(0, 3).toUpperCase(), logoUrl: `/teams/${n}.svg` },
        }),
      ),
    );

    await prisma.fixture.createMany({
      data: [
        {
          competitionId: comp.id,
          homeTeamId: mex.id,
          awayTeamId: rsa.id,
          scheduledKickoff: new Date('2026-06-15T19:00:00+04:00'),
          stage: 'Group stage',
          venue: 'Estadio Azteca',
          providerFixtureId: 'mock-1',
        },
        {
          competitionId: comp.id,
          homeTeamId: usa.id,
          awayTeamId: can.id,
          scheduledKickoff: new Date('2026-06-15T22:00:00+04:00'),
          stage: 'Group stage',
          venue: 'MetLife Stadium',
          providerFixtureId: 'mock-2',
        },
      ],
    });
  }

  console.log({ seeded: true });
}

main().finally(() => prisma.$disconnect());
