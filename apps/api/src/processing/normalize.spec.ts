import { normalizeValue, parseLocalizedNumber } from './normalize';

describe('parseLocalizedNumber', () => {
  it.each([
    ['1.234,56 €', 1234.56],
    ['1,234.56', 1234.56],
    ['19,99', 19.99],
    ['19.99', 19.99],
    ['1.500', 1500],
    ['1,500', 1500],
    ['$ 42', 42],
  ])('parses "%s" as %p', (input, expected) => {
    expect(parseLocalizedNumber(input)).toBeCloseTo(expected as number, 2);
  });

  it('returns null when there are no digits', () => {
    expect(parseLocalizedNumber('Sold out')).toBeNull();
  });
});

describe('normalizeValue', () => {
  const page = 'https://shop.example.com/catalog/page/2';

  it('trims spaces and collapses line breaks', () => {
    expect(normalizeValue('  Blue  \n  T-shirt  ', 'STRING', page)).toEqual({ ok: true, value: 'Blue T-shirt' });
  });

  it('returns null for empty values', () => {
    expect(normalizeValue('   ', 'PRICE', page)).toEqual({ ok: true, value: null });
  });

  it('converts prices to numbers', () => {
    expect(normalizeValue('12,50 €', 'PRICE', page)).toEqual({ ok: true, value: 12.5 });
  });

  it('rejects non-numeric prices', () => {
    expect(normalizeValue('ask for price', 'PRICE', page).ok).toBe(false);
  });

  it('resolves relative URLs against the source page', () => {
    expect(normalizeValue('../item/7', 'URL', page)).toEqual({
      ok: true,
      value: 'https://shop.example.com/catalog/item/7',
    });
  });

  it('normalizes dates to ISO 8601', () => {
    const result = normalizeValue('2026-03-15', 'DATE', page);
    expect(result).toEqual({ ok: true, value: '2026-03-15T00:00:00.000Z' });
  });

  it('rejects invalid dates', () => {
    expect(normalizeValue('tomorrow afternoon', 'DATE', page).ok).toBe(false);
  });
});
