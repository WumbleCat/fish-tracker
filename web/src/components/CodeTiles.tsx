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
  /** Tile diameter in px. */
  size?: number;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cells = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] ?? '');
  const activeIndex = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <div className="relative">
      <div
        className="flex gap-3"
        onClick={() => inputRef.current?.focus()}
        data-testid="code-tiles"
      >
        {cells.map((char, i) => {
          const filled = char !== '';
          const active = !filled && i === activeIndex;
          return (
            <div
              key={i}
              aria-hidden
              className={`num flex items-center justify-center rounded-full border-2 text-felt-100 ${
                filled
                  ? 'border-emerald-400 bg-emerald-950'
                  : active
                    ? 'border-emerald-400 bg-white/5'
                    : 'border-felt-700 bg-white/5'
              }`}
              style={{
                width: size,
                height: size,
                fontSize: size * 0.41,
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
