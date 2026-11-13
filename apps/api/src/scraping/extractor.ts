import { createHash } from 'crypto';
import * as cheerio from 'cheerio';
import { FieldType } from '@scraping/shared';
import { normalizeValue } from '../processing/normalize';

export interface FieldDefinition {
  name: string;
  selector: string;
  attribute: string;
  type: FieldType;
  required: boolean;
}

export interface ExtractedItem {
  pageUrl: string;
  data: Record<string, string | number | null>;
  contentHash: string;
}

export interface ExtractionResult {
  items: ExtractedItem[];
  invalid: { pageUrl: string; reasons: string[] }[];
}

function readAttribute(
  $el: ReturnType<cheerio.CheerioAPI>,
  attribute: string,
): string | null {
  if (attribute === 'text') return $el.text();
  if (attribute === 'html') return $el.html();
  return $el.attr(attribute) ?? null;
}

/** Applies the item selector and the field selectors to an already downloaded HTML document. */
export function extractItems(
  html: string,
  pageUrl: string,
  itemSelector: string,
  fields: FieldDefinition[],
): ExtractionResult {
  const $ = cheerio.load(html);
  const result: ExtractionResult = { items: [], invalid: [] };

  $(itemSelector).each((_, node) => {
    const $item = $(node);
    const data: Record<string, string | number | null> = {};
    const reasons: string[] = [];

    for (const field of fields) {
      const $target = field.selector === '.' ? $item : $item.find(field.selector).first();
      const raw = $target.length ? readAttribute($target, field.attribute) : null;
      const normalized = normalizeValue(raw, field.type, pageUrl);

      if (!normalized.ok) {
        reasons.push(`${field.name}: ${normalized.reason}`);
        continue;
      }
      if (field.required && normalized.value === null) {
        reasons.push(`${field.name}: required field is empty`);
        continue;
      }
      data[field.name] = normalized.value;
    }

    if (reasons.length > 0) {
      result.invalid.push({ pageUrl, reasons });
      return;
    }
    const contentHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    result.items.push({ pageUrl, data, contentHash });
  });

  return result;
}
