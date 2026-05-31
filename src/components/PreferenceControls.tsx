import type { Prefs } from '../types';
import { Segmented } from './Segmented';

export function PreferenceControls({ prefs, onChange }: { prefs: Prefs; onChange: (p: Prefs) => void }) {
  const set = <K extends keyof Prefs>(key: K, v: Prefs[K]) => onChange({ ...prefs, [key]: v });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Segmented
        label="Playstyle"
        hint="early vs late"
        value={prefs.playstyle}
        onChange={(v) => set('playstyle', v)}
        options={[
          { value: 'aggressive', label: 'Aggressive' },
          { value: 'scaling', label: 'Econ & scale' },
          { value: 'any', label: 'No pref' },
        ]}
      />
      <Segmented
        label="Tempo"
        hint="how you level"
        value={prefs.tempo}
        onChange={(v) => set('tempo', v)}
        options={[
          { value: 'reroll', label: 'Reroll' },
          { value: 'fast8', label: 'Fast 8' },
          { value: 'any', label: 'No pref' },
        ]}
      />
      <Segmented
        label="Item lean"
        hint="your components"
        value={prefs.itemLean}
        onChange={(v) => set('itemLean', v)}
        options={[
          { value: 'AD', label: 'AD', accent: 'ad' },
          { value: 'AP', label: 'AP', accent: 'ap' },
          { value: 'flexible', label: 'Flexible' },
        ]}
      />
      <Segmented
        label="Contested tolerance"
        hint="risk appetite"
        value={prefs.contested}
        onChange={(v) => set('contested', v)}
        options={[
          { value: 'avoid', label: 'Avoid' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'fight', label: 'Will fight' },
        ]}
      />
    </div>
  );
}
