/** Global keyboard shortcuts — the reason the web app exists. All of them
 * are suppressed while a text input has focus, so typing a name never
 * triggers an action. There is deliberately no bulk-verify binding. */

import { useEffect } from 'react';

export type ShortcutMap = Partial<
  Record<
    | 'n'
    | 'r'
    | 'c'
    | 'v'
    | 'x'
    | '/'
    | 'ArrowUp'
    | 'ArrowDown'
    | 'Enter'
    | 'Escape'
    | '?',
    (event: KeyboardEvent) => void
  >
>;

function inTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export function useShortcuts(map: ShortcutMap, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      // Escape is the one key that must also work from inside an input
      if (inTextInput(event.target) && event.key !== 'Escape') return;
      const key = event.key === '?' ? '?' : event.key;
      const action = map[key as keyof ShortcutMap];
      if (action) {
        event.preventDefault();
        action(event);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [map, enabled]);
}
