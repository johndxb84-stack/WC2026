'use client';

import { FormEvent, useState } from 'react';
import { fixtures } from '@/lib/mock-data';

type SubmitState = { status: 'idle' | 'saving' | 'success' | 'error'; message: string };

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim();
  return text === '' ? null : Number(text);
}

export function AdminResultsForm() {
  const [state, setState] = useState<SubmitState>({ status: 'idle', message: 'Paste the official result here after the match and the app will recalculate points.' });

  async function submitResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setState({ status: 'saving', message: 'Saving official result and recalculating points…' });

    const fixtureId = String(formData.get('fixtureId'));
    const body = {
      fixture: {
        fixtureId,
        homeScore90: Number(formData.get('homeScore90')),
        awayScore90: Number(formData.get('awayScore90')),
        homePossession: optionalNumber(formData.get('homePossession')) ?? undefined,
        awayPossession: optionalNumber(formData.get('awayPossession')) ?? undefined,
        firstGoalscorerId: String(formData.get('firstGoalscorerId') ?? '').trim() || null,
        homeScoreExtraTime: optionalNumber(formData.get('homeScoreExtraTime')),
        awayScoreExtraTime: optionalNumber(formData.get('awayScoreExtraTime')),
        homePenaltyScore: optionalNumber(formData.get('homePenaltyScore')),
        awayPenaltyScore: optionalNumber(formData.get('awayPenaltyScore')),
      },
    };

    const response = await fetch('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      setState({ status: 'error', message: `Could not save result: ${text}` });
      return;
    }

    const payload = await response.json() as { scores?: unknown[]; leaderboard?: Array<{ userName: string; totalPoints: number }> };
    const leaderboard = payload.leaderboard?.map((row) => `${row.userName}: ${row.totalPoints} pts`).join(' • ');
    setState({
      status: 'success',
      message: `Result saved. ${payload.scores?.length ?? 0} prediction scores recalculated.${leaderboard ? ` Leaderboard: ${leaderboard}` : ''}`,
    });
  }

  return (
    <form onSubmit={submitResult} className="mt-8 grid gap-5 rounded-3xl border border-cyan-200/20 bg-slate-950/60 p-6">
      <div>
        <p className="text-sm uppercase tracking-[0.35em] text-cyan-200">Manual settlement</p>
        <h2 className="mt-2 text-2xl font-black">Enter official result</h2>
        <p className="mt-2 text-white/70">This does not delete bets. It stores the final result separately and recalculates points from existing predictions.</p>
      </div>

      <label className="grid gap-2 text-sm font-bold text-white/80">
        Match
        <select name="fixtureId" className="rounded-2xl bg-slate-800 p-3 text-white" required>
          {fixtures.map((fixture) => (
            <option key={fixture.id} value={fixture.id}>{fixture.homeTeam.name} vs {fixture.awayTeam.name}</option>
          ))}
        </select>
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold text-white/80">Home 90-min score<input name="homeScore90" type="number" min="0" defaultValue="0" required className="rounded-2xl bg-slate-800 p-3 text-white" /></label>
        <label className="grid gap-2 text-sm font-bold text-white/80">Away 90-min score<input name="awayScore90" type="number" min="0" defaultValue="0" required className="rounded-2xl bg-slate-800 p-3 text-white" /></label>
        <label className="grid gap-2 text-sm font-bold text-white/80">Home possession %<input name="homePossession" type="number" min="0" max="100" placeholder="Optional" className="rounded-2xl bg-slate-800 p-3 text-white" /></label>
        <label className="grid gap-2 text-sm font-bold text-white/80">Away possession %<input name="awayPossession" type="number" min="0" max="100" placeholder="Optional" className="rounded-2xl bg-slate-800 p-3 text-white" /></label>
      </div>

      <label className="grid gap-2 text-sm font-bold text-white/80">
        First goalscorer
        <input name="firstGoalscorerId" placeholder="Exact player name, or leave blank for no scorer / N/A" className="rounded-2xl bg-slate-800 p-3 text-white" />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold text-white/80">Home after extra time<input name="homeScoreExtraTime" type="number" min="0" placeholder="Blank = N/A" className="rounded-2xl bg-slate-800 p-3 text-white" /></label>
        <label className="grid gap-2 text-sm font-bold text-white/80">Away after extra time<input name="awayScoreExtraTime" type="number" min="0" placeholder="Blank = N/A" className="rounded-2xl bg-slate-800 p-3 text-white" /></label>
        <label className="grid gap-2 text-sm font-bold text-white/80">Home penalties<input name="homePenaltyScore" type="number" min="0" placeholder="Blank = N/A" className="rounded-2xl bg-slate-800 p-3 text-white" /></label>
        <label className="grid gap-2 text-sm font-bold text-white/80">Away penalties<input name="awayPenaltyScore" type="number" min="0" placeholder="Blank = N/A" className="rounded-2xl bg-slate-800 p-3 text-white" /></label>
      </div>

      <button type="submit" disabled={state.status === 'saving'} className="rounded-full bg-yellow-300 px-6 py-3 font-black text-slate-950 disabled:opacity-60">
        {state.status === 'saving' ? 'Saving…' : 'Save result and calculate points'}
      </button>

      <p className={state.status === 'error' ? 'text-red-300' : state.status === 'success' ? 'text-green-300' : 'text-white/70'}>{state.message}</p>
    </form>
  );
}
