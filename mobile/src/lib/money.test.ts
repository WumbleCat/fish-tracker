import { MINUS, fmtMinor, fmtSigned, parseToMinor } from './money';

describe('fmtMinor', () => {
  it('formats zero', () => {
    expect(fmtMinor(0, 'GBP', 2)).toBe('£0.00');
  });

  it('formats negatives with a true minus sign, never a hyphen', () => {
    const out = fmtMinor(-600, 'GBP', 2);
    expect(out).toBe(`${MINUS}£6.00`);
    expect(out).not.toContain('-');
  });

  it('formats large values exactly', () => {
    expect(fmtMinor(123456789012, 'GBP', 2)).toBe('£1234567890.12');
  });

  it('renders a zero-exponent currency with no decimal places', () => {
    expect(fmtMinor(5000, 'JPY', 0)).toBe('¥5000');
    expect(fmtMinor(-5000, 'JPY', 0)).toBe(`${MINUS}¥5000`);
  });

  it('refuses non-integer amounts outright', () => {
    expect(() => fmtMinor(12.5, 'GBP', 2)).toThrow();
  });
});

describe('fmtSigned', () => {
  it('marks positive pending amounts with an explicit plus', () => {
    expect(fmtSigned(4000, 'GBP', 2)).toBe('+£40.00');
  });
});

describe('parseToMinor', () => {
  it('parses with integer arithmetic, never through a float', () => {
    expect(parseToMinor('12.34', 2)).toBe(1234);
    expect(parseToMinor('0.10', 2)! + parseToMinor('0.20', 2)!).toBe(30);
  });

  it('rejects excess decimals rather than rounding', () => {
    expect(parseToMinor('12.345', 2)).toBeNull();
    expect(parseToMinor('50.00', 0)).toBeNull();
  });

  it('rejects negatives and garbage', () => {
    expect(parseToMinor('-5', 2)).toBeNull();
    expect(parseToMinor('abc', 2)).toBeNull();
  });
});
