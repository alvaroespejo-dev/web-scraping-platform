import { extractItems, FieldDefinition } from './extractor';

const html = `
<html><body>
  <div class="product">
    <h2 class="title"> Running Shoe </h2>
    <span class="price">89,90 €</span>
    <a class="link" href="/p/1">view</a>
  </div>
  <div class="product">
    <h2 class="title">Backpack</h2>
    <span class="price">sold out</span>
    <a class="link" href="/p/2">view</a>
  </div>
  <div class="product">
    <h2 class="title">Cap</h2>
    <span class="price">15</span>
  </div>
</body></html>`;

const fields: FieldDefinition[] = [
  { name: 'title', selector: '.title', attribute: 'text', type: 'STRING', required: true },
  { name: 'price', selector: '.price', attribute: 'text', type: 'PRICE', required: false },
  { name: 'url', selector: '.link', attribute: 'href', type: 'URL', required: false },
];

describe('extractItems', () => {
  const pageUrl = 'https://shop.example.com/catalog';

  it('extracts fields, normalizes them and separates valid and invalid items', () => {
    const result = extractItems(html, pageUrl, '.product', fields);

    expect(result.items).toHaveLength(2);
    expect(result.items[0].data).toEqual({
      title: 'Running Shoe',
      price: 89.9,
      url: 'https://shop.example.com/p/1',
    });
    expect(result.items[1].data).toEqual({ title: 'Cap', price: 15, url: null });

    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].reasons[0]).toContain('price');
  });

  it('computes a stable hash to detect duplicates', () => {
    const a = extractItems(html, pageUrl, '.product', fields).items[0].contentHash;
    const b = extractItems(html, pageUrl, '.product', fields).items[0].contentHash;
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('marks an item as invalid when a required field is empty', () => {
    const withRequiredUrl: FieldDefinition[] = [
      { name: 'title', selector: '.title', attribute: 'text', type: 'STRING', required: true },
      { name: 'url', selector: '.link', attribute: 'href', type: 'URL', required: true },
    ];
    const result = extractItems(html, pageUrl, '.product', withRequiredUrl);
    expect(result.items).toHaveLength(2);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].reasons[0]).toContain('required field is empty');
  });

  it('returns empty lists when the item selector matches nothing', () => {
    const result = extractItems(html, pageUrl, '.does-not-exist', fields);
    expect(result.items).toEqual([]);
    expect(result.invalid).toEqual([]);
  });
});
