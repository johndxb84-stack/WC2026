import { dashboardModel } from '@/lib/mock-data';

type MatchPageProps = {
  params: Promise<{ id: string }>;
};

export default async function MatchPage({ params }: MatchPageProps) {
  const { id } = await params;
  const model = dashboardModel();
  const fixture = model.fixtures.find((candidate) => candidate.id === id);

  if (!fixture) {
    return <main className="p-8">Not found</main>;
  }

  return (
    <main className="min-h-screen p-6">
      <div className="glass mx-auto max-w-5xl rounded-3xl p-8">
        <a href="/" className="text-flood">← Dashboard</a>
        <h1 className="mt-4 text-4xl font-black">
          {fixture.homeTeam} vs {fixture.awayTeam}
        </h1>
        <p className="text-white/70">
          {fixture.venue} · {fixture.status}
        </p>
        <h2 className="mt-8 text-2xl font-bold">Prediction comparison</h2>
        <table className="mt-4 w-full text-left">
          <thead>
            <tr>
              <th>Player</th>
              <th>90-Minute Prediction</th>
              <th>Outcome</th>
              <th>Exact</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {model.players.map((player) => (
              <tr className="border-t border-white/10" key={player.name}>
                <td>{player.name}</td>
                <td colSpan={4}>Hidden until unlocked</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
