import { Link } from 'react-router-dom';

/** Quiet, never nagging: a marker and one "save my history" action. */
export function GuestBadge({ displayName }: { displayName: string }) {
  return (
    <span className="flex items-center gap-2 text-xs text-neutral-500">
      <span>
        playing as guest · <span className="font-medium">{displayName}</span>
      </span>
      <Link to="/claim" className="text-emerald-700 underline underline-offset-2">
        save my history
      </Link>
    </span>
  );
}
