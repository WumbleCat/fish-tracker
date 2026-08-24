/** The chip tiles are a display over one real input: typing, paste and
 * backspace behave like a text field, and the code is always six
 * uppercase alphanumerics. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { CodeTiles, normalizeCode } from './CodeTiles';

function Harness() {
  const [code, setCode] = useState('');
  return (
    <>
      <CodeTiles value={code} onChange={setCode} autoFocus />
      <output data-testid="code">{code}</output>
    </>
  );
}

describe('CodeTiles', () => {
  it('folds typed characters to uppercase and stops at six', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard('k7qm42zz');
    expect(screen.getByTestId('code')).toHaveTextContent('K7QM42');
    const tiles = screen.getByTestId('code-tiles').children;
    expect(Array.from(tiles).map((t) => t.textContent)).toEqual(['K', '7', 'Q', 'M', '4', '2']);
  });

  it('accepts a pasted code with noise in it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText('join code'));
    await user.paste('k7-qm 42!!');
    expect(screen.getByTestId('code')).toHaveTextContent('K7QM42');
  });

  it('backspace clears the last tile', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard('K7Q{Backspace}');
    expect(screen.getByTestId('code')).toHaveTextContent('K7');
  });

  it('normalizeCode strips everything that is not A–Z or 0–9', () => {
    expect(normalizeCode(' xy z-12 ')).toBe('XYZ12');
    expect(normalizeCode('abcdefgh')).toBe('ABCDEF');
  });
});
