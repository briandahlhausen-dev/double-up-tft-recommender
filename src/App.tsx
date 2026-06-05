import { useHashRoute } from './lib/router';
import { SiteNav } from './components/SiteNav';
import { Recommender } from './pages/Recommender';
import { ChampionsOverview } from './pages/ChampionsOverview';
import { ChampionDetail } from './pages/ChampionDetail';
import { Lab } from './pages/Lab';

export default function App() {
  const route = useHashRoute();

  return (
    <div className="relative min-h-screen">
      <div className="starfield" aria-hidden />

      <main className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        <SiteNav route={route} />

        {route.name === 'home' && <Recommender initialBoard={route.board} initialRoom={route.room} />}
        {route.name === 'champions' && <ChampionsOverview />}
        {route.name === 'champion' && <ChampionDetail id={route.id} />}
        {route.name === 'lab' && <Lab />}
      </main>
    </div>
  );
}
