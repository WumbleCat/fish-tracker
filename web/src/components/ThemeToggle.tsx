/** One quiet button: light → dark → follow system. The icon shows the
 * current choice; the title says what the next click does. */

import { Monitor, Moon, Sun } from 'lucide-react';

import { nextTheme, useTheme, type Theme } from '../lib/theme';

const ICON: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };
const LABEL: Record<Theme, string> = { light: 'light', dark: 'dark', system: 'system' };

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const Icon = ICON[theme];
  const next = nextTheme(theme);
  return (
    <button
      onClick={() => setTheme(next)}
      aria-label={`theme: ${LABEL[theme]} — switch to ${LABEL[next]}`}
      title={`Theme: ${LABEL[theme]} (click for ${LABEL[next]})`}
      className="rounded p-1 text-neutral-400 hover:text-neutral-700"
    >
      <Icon size={16} />
    </button>
  );
}
