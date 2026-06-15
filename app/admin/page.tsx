import { AdminResultsForm } from '@/components/AdminResultsForm';

export default function Admin() {
  return (
    <main className="min-h-screen p-8">
      <section className="glass mx-auto max-w-4xl rounded-3xl p-8">
        <h1 className="text-4xl font-black">Administration</h1>
        <ul className="mt-6 list-disc pl-6 text-white/80">
          <li>Manage players, competition timezone, rotation date, and scoring values.</li>
          <li>Refresh fixtures and run mock/live synchronization.</li>
          <li>Enter official results, recalculate points, and audit overrides.</li>
        </ul>
        <AdminResultsForm />
      </section>
    </main>
  );
}
