import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { CurrencyBar } from './components/CurrencyBar';
import { GuestBadge } from './components/GuestBadge';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { useAuth } from './lib/auth';
import { prefetchNav, useGame, useMe } from './lib/queries';
import { useShortcuts } from './lib/shortcuts';
import { Claim } from './routes/Claim';
import { Landing } from './routes/Landing';
import { Profile } from './routes/Profile';
import { Session } from './routes/Session';
import { Sessions } from './routes/Sessions';
import { Settings } from './routes/Settings';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
});

function Header() {
  const { status, guest, signOut } = useAuth();
  const { data: me } = useMe(status === 'registered');
  const location = useLocation();
  const gameId = /^\/session\/([0-9a-f-]+)/.exec(location.pathname)?.[1];
  const { data: game } = useGame(status === 'signedOut' ? undefined : gameId);
  const [helpOpen, setHelpOpen] = useState(false);
  useShortcuts({ '?': () => setHelpOpen((o) => !o) });
  const warm = (target: 'games' | 'history' | 'me') => () => prefetchNav(queryClient, target);

  if (status === 'signedOut' || status === 'loading') return null;

  return (
    <header className="mb-6 flex items-center gap-4 border-b border-neutral-200 pb-3">
      <Link to={status === 'guest' ? `/session/${guest?.gameId}` : '/sessions'} className="text-sm font-bold">
        🐟 fish-tracker
      </Link>
      {status === 'registered' && (
        <nav className="flex gap-3 text-sm text-neutral-600">
          {/* warm the cache on hover/focus so the click renders from data */}
          <Link to="/sessions" onMouseEnter={warm('games')} onFocus={warm('games')}>
            Sessions
          </Link>
          <Link to="/profile" onMouseEnter={warm('history')} onFocus={warm('history')}>
            Profile
          </Link>
          <Link to="/settings" onMouseEnter={warm('me')} onFocus={warm('me')}>
            Settings
          </Link>
        </nav>
      )}
      <span className="ml-auto flex items-center gap-3">
        {status === 'guest' && guest && <GuestBadge displayName={guest.displayName} />}
        {status === 'registered' && me && (
          <CurrencyBar value={me.default_currency} inGameCurrency={game?.currency} />
        )}
        <button onClick={() => setHelpOpen(true)} className="text-xs text-neutral-400" title="Keyboard shortcuts">
          ?
        </button>
        <button onClick={() => void signOut()} className="text-xs text-neutral-400 underline">
          sign out
        </button>
      </span>
      <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </header>
  );
}

export default function App() {
  const { status } = useAuth();

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen px-6 py-4">
        <Header />
        <Routes>
          <Route
            path="/"
            element={
              status === 'registered' ? (
                <Navigate to="/sessions" replace />
              ) : status === 'guest' ? (
                <Navigate to="/claim-home" replace />
              ) : (
                <Landing />
              )
            }
          />
          <Route path="/claim-home" element={<GuestHome />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/session/:id" element={<Session />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/claim" element={<Claim />} />
        </Routes>
      </div>
    </QueryClientProvider>
  );
}

function GuestHome() {
  const { guest } = useAuth();
  return guest ? <Navigate to={`/session/${guest.gameId}`} replace /> : <Navigate to="/" replace />;
}
