import { FieldType } from '@scraping/shared';

export type NormalizeResult = { ok: true; value: string | number | null } | { ok: false; reason: string };

/** Parses a number written in European (1.234,56) or US (1,234.56) format. */
export function parseLocalizedNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;

  if (lastComma !== -1 && lastDot !== -1) {
    // The separator that appears last is the decimal one; the other is a thousands separator.
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned.replace(/,/g, '');
  } else if (lastComma !== -1) {
    // A single comma: decimal if followed by 1-2 digits, otherwise a thousands separator.
    normalized = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  } else if (lastDot !== -1) {
    normalized = /\.\d{1,2}$/.test(cleaned) ? cleaned : cleaned.replace(/\./g, '');
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function normalizeValue(raw: string | null, type: FieldType, pageUrl: string): NormalizeResult {
  const text = raw?.replace(/\s+/g, ' ').trim() ?? '';
  if (text === '') return { ok: true, value: null };

  switch (type) {
    case 'STRING':
      return { ok: true, value: text };

    case 'NUMBER':
    case 'PRICE': {
      const value = parseLocalizedNumber(text);
      return value === null ? { ok: false, reason: `Not a number: "${text}"` } : { ok: true, value };
    }

    case 'URL':
      try {
        return { ok: true, value: new URL(text, pageUrl).href };
      } catch {
        return { ok: false, reason: `Invalid URL: "${text}"` };
      }

    case 'DATE': {
      const time = Date.parse(text);
      return Number.isNaN(time)
        ? { ok: false, reason: `Invalid date: "${text}"` }
        : { ok: true, value: new Date(time).toISOString() };
    }
  }
}
