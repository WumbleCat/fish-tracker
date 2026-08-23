import { describe, expect, it } from 'vitest';

import { MINUS, fmtMinor, fmtSigned, parseToMinor, toDecimalString } from './money';

describe('fmtMinor', () => {
  it('formats zero', () => {
    expect(fmtMinor(0, 'GBP', 2)).toBe('£0.00');
  });

  it('formats positive amounts', () => {
    expect(fmtMinor(1234, 'GBP', 2)).toBe('£12.34');
    expect(fmtMinor(5, 'GBP', 2)).toBe('£0.05');
  });

  it('formats negative amounts with a true minus sign, never a hyphen', () => {
    const out = fmtMinor(-600, 'GBP', 2);
    expect(out).toBe(`${MINUS}£6.00`);
    expect(out).not.toContain('-');
    expect(MINUS).toBe('−');
  });

  it('formats large values exactly', () => {
    expect(fmtMinor(123456789012, 'GBP', 2)).toBe('£1234567890.12');
  });

  it('renders a zero-exponent currency with no decimal places', () => {
    expect(fmtMinor(5000, 'JPY', 0)).toBe('¥5000');
    expect(fmtMinor(-5000, 'JPY', 0)).toBe(`${MINUS}¥5000`);
  });

  it('respects a three-decimal currency', () => {
    expect(fmtMinor(12345, 'KWD', 3)).toBe('KWD 12.345');
  });

  it('refuses non-integer amounts outright', () => {
    expect(() => fmtMinor(12.5, 'GBP', 2)).toThrow();
    expect(() => toDecimalString(0.1 + 0.2, 'GBP', 2)).toThrow();
  });
});

describe('fmtSigned', () => {
  it('marks positive pending deltas with an explicit plus', () => {
    expect(fmtSigned(4000, 'GBP', 2)).toBe('+£40.00');
  });
  it('uses the true minus for negatives', () => {
    expect(fmtSigned(-4000, 'GBP', 2)).toBe(`${MINUS}£40.00`);
  });
  it('leaves zero unsigned', () => {
    expect(fmtSigned(0, 'GBP', 2)).toBe('£0.00');
  });
});

describe('parseToMinor', () => {
  it('parses whole and decimal input with integer arithmetic', () => {
    expect(parseToMinor('12', 2)).toBe(1200);
    expect(parseToMinor('12.3', 2)).toBe(1230);
    expect(parseToMinor('12.34', 2)).toBe(1234);
    expect(parseToMinor('0.05', 2)).toBe(5);
  });

  it('handles symbols and separators', () => {
    expect(parseToMinor('£1,234.56', 2)).toBe(123456);
  });

  it('parses zero-exponent currencies without inventing decimals', () => {
    expect(parseToMinor('5000', 0)).toBe(5000);
    expect(parseToMinor('50.00', 0)).toBeNull();
  });

  it('rejects too many decimals rather than rounding', () => {
    expect(parseToMinor('12.345', 2)).toBeNull();
  });

  it('rejects negatives, garbage and empty input', () => {
    expect(parseToMinor('-5', 2)).toBeNull();
    expect(parseToMinor('−5', 2)).toBeNull();
    expect(parseToMinor('abc', 2)).toBeNull();
    expect(parseToMinor('', 2)).toBeNull();
    expect(parseToMinor('1.2.3', 2)).toBeNull();
  });

  it('round-trips the classic float trap exactly', () => {
    // 0.1 + 0.2 !== 0.3 in floats; in minor units it is exactly 30
    expect(parseToMinor('0.10', 2)! + parseToMinor('0.20', 2)!).toBe(30);
    expect(parseToMinor('0.30', 2)).toBe(30);
  });
});
