/** Sets the default currency for NEW games and the display currency for
 * lifetime history. It never converts anything: inside a game the game's
 * currency always wins, and this control says so rather than surprising. */

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';

const CHOICES = ['GBP', 'EUR', 'USD', 'JPY', 'AUD', 'CAD'];

export function CurrencyBar({
  value,
  inGameCurrency,
}: {
  value: string;
  /** When viewing a game, its currency — shown as the immovable truth. */
  inGameCurrency?: string;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (currency: string) => api.updateMe({ default_currency: currency }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      void queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });

  return (
    <span className="flex items-center gap-2 text-xs text-neutral-500">
      {inGameCurrency && (
        <span
          className="rounded bg-neutral-200 px-1.5 py-0.5 font-medium text-neutral-700"
          title="This game's currency is fixed; the selector below never changes it."
        >
          game: {inGameCurrency}
        </span>
      )}
      <label className="flex items-center gap-1">
        default
        <select
          value={value}
          onChange={(e) => mutation.mutate(e.target.value)}
          className="rounded border border-neutral-300 bg-white px-1 py-0.5"
          title="Applies to new games and your own history display — never to an existing ledger."
        >
          {CHOICES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
    </span>
  );
}
