/** Six chip tiles for the join code. One real (visually hidden) input sits
 * behind them so typing, backspace and paste all just work; the tiles are
 * the display. Anything but A–Z and 0–9 is dropped, case is folded up. */

import { useRef } from 'react';

export const CODE_LENGTH = 6;

export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
}

export function CodeTiles({
  value,
  onChange,
  size = 78,
  autoFocus,
  ariaLabel = 'join code',
}: {
  value: string;
  onChange: (code: string) => void;
  /** Largest tile diameter in px. Tiles shrink below this to fit the
   * container — six 78px tiles plus gaps need 528px, which no phone has. */
  size?: number;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cells = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? '');
  const activeIndex = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <div className="relative">
      {/* Each tile is a flex child that may shrink (min-w-0) and stays
          circular via aspect-square, capped at `size`. The row therefore
          fits any width from 320px up without a media query, and the
          character scales with the tile through cqw units. */}
      <div
        className="@container flex gap-2 sm:gap-3"
        onClick={() => inputRef.current?.focus()}
        data-testid="code-tiles"
        style={{ maxWidth: size * CODE_LENGTH + 12 * (CODE_LENGTH - 1) }}
      >
        {cells.map((char, i) => {
          const filled = char !== '';
          const active = !filled && i === activeIndex;
          return (
            <div
              key={i}
              aria-hidden
              className={`num flex aspect-square min-w-0 flex-1 items-center justify-center rounded-full border-2 text-[clamp(15px,7cqw,32px)] text-felt-100 ${
                filled
                  ? 'border-emerald-400 bg-emerald-950'
                  : active
                    ? 'border-emerald-400 bg-white/5'
                    : 'border-felt-700 bg-white/5'
              }`}
              style={{
                maxWidth: size,
                boxShadow: 'inset 0 0 0 5px rgba(255,255,255,.04), 0 6px 18px rgba(0,0,0,.45)',
              }}
            >
              {char}
            </div>
          );
        })}
      </div>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(normalizeCode(e.target.value))}
        autoFocus={autoFocus}
        // no maxLength: a pasted "K7-QM 42" must reach the normalizer whole
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        aria-label={ariaLabel}
        className="absolute left-0 top-0 h-px w-px opacity-0"
      />
    </div>
  );
}
