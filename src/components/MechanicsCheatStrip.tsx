interface Mechanic {
  title: string;
  body: string;
}

const MECHANICS: Mechanic[] = [
  {
    title: 'Shared HP',
    body: 'Both players draw from one team HP pool. A board can get wiped and you still survive the round if your partner holds.',
  },
  {
    title: 'Reinforcements · ~7s',
    body: 'Win your combat and your surviving units teleport to fight on your partner’s board for about 7 seconds. Stagger your strongest board.',
  },
  {
    title: 'Assist Armory',
    body: '2-5 / 2-6: grab 8 gold to hand your partner. 6-2 / 6-3: pass completed items or emblems across boards.',
  },
  {
    title: 'Rune of Allegiance',
    body: 'Shared duo-augment picks at game start, then around 4-3 and 6-1. Coordinate so your archetypes don’t clash.',
  },
];

export function MechanicsCheatStrip() {
  return (
    <section className="glass p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-white">Double Up cheat-strip</h2>
        <span className="text-xs text-slate-400">quick mechanics reference</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MECHANICS.map((m) => (
          <div key={m.title} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center gap-2">
              <span className="text-ad" aria-hidden>
                ✦
              </span>
              <h3 className="font-display text-sm font-bold text-white">{m.title}</h3>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{m.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
