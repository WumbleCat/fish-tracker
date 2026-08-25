import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { CurrencyBar } from './components/CurrencyBar';
import { GuestBadge } from './components/GuestBadge';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { ThemeToggle } from './components/ThemeToggle';
import { useAuth } from './lib/auth';
import { prefetchNav, useGame, useMe } from './lib/queries';
import { useShortcuts } from './lib/shortcuts';
import { Claim } from './routes/Claim';
import { JoinLink } from './routes/JoinLink';
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
    <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-200 pb-3">
      <Link
        to={status === 'guest' ? `/session/${guest?.gameId}` : '/sessions'}
        className="shrink-0 text-sm font-bold"
      >
        🐟 fish-tracker
      </Link>
      {status === 'registered' && (
        <nav className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-neutral-600">
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
      {/* ml-auto only once there is a row to push against; when the header
          wraps on a phone this group starts its own line instead. */}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:ml-auto">
        {status === 'guest' && guest && <GuestBadge displayName={guest.displayName} />}
        {status === 'registered' && me && (
          <CurrencyBar value={me.default_currency} inGameCurrency={game?.currency} />
        )}
        <ThemeToggle />
        <button
          onClick={() => setHelpOpen(true)}
          className="flex min-h-11 min-w-11 items-center justify-center text-xs text-neutral-400 sm:min-h-0 sm:min-w-0"
          title="Keyboard shortcuts"
        >
          ?
        </button>
        <button
          onClick={() => void signOut()}
          className="flex min-h-11 items-center px-1 text-xs text-neutral-400 underline sm:min-h-0 sm:px-0"
        >
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
      {/* dvh, not vh: mobile browser chrome makes 100vh taller than the
          visible viewport, which puts the bottom of the page under the URL
          bar. The safe-area insets keep content clear of the notch and the
          home indicator in landscape and on iOS standalone. */}
      <div
        className="min-h-[100dvh] pt-4
                   pl-[max(1rem,env(safe-area-inset-left))]
                   pr-[max(1rem,env(safe-area-inset-right))]
                   pb-[max(1rem,env(safe-area-inset-bottom))]
                   sm:pl-[max(1.5rem,env(safe-area-inset-left))]
                   sm:pr-[max(1.5rem,env(safe-area-inset-right))]"
      >
        <Header />
        {status === 'signedOut' && (
          // the landing page has no header; the theme is still a choice there
          <div className="flex justify-end">
            <ThemeToggle />
          </div>
        )}
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
          <Route path="/join/:code" element={<JoinLink />} />
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
