/** /join/:code — the code in link form. A signed-in player is seated
 * straight away; anyone else lands on the front door with the tiles
 * already filled, so all that's left is a name. */

import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { normalizeCode } from '../components/CodeTiles';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { joinErrorMessage, Landing } from './Landing';

export function JoinLink() {
  const { code = '' } = useParams<{ code: string }>();
  const joinCode = normalizeCode(code);
  const { status } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'registered' || !joinCode) return;
    let cancelled = false;
    api
      .joinGame(joinCode)
      .then((game) => {
        if (!cancelled) navigate(`/session/${game.id}`, { replace: true });
      })
      .catch((e) => {
        if (!cancelled) setError(joinErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [status, joinCode, navigate]);

  if (status === 'loading') return null;
  if (status === 'registered') {
    return (
      <p role={error ? 'alert' : undefined} className="mt-16 text-center text-neutral-500">
        {error ?? `Joining ${joinCode}…`}
        {error && (
          <>
            {' '}
            <button onClick={() => navigate('/sessions')} className="underline">
              Back to sessions
            </button>
          </>
        )}
      </p>
    );
  }
  if (!joinCode) return <Navigate to="/" replace />;
  return <Landing initialCode={joinCode} />;
}
