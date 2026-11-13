import { CrawlSite, crawl } from './crawl';
import { LoadedPage, PageSource } from './page-source';

/** Fake source: a map of URL -> HTML. "Next" pages are resolved from a link with the given attribute. */
function fakeSource(pages: Record<string, string | Error>): PageSource {
  const load = (url: string): LoadedPage => {
    const value = pages[url];
    if (value === undefined) throw new Error(`404 ${url}`);
    if (value instanceof Error) throw value;
    return { url, html: value };
  };
  return {
    open: async (url) => load(url),
    next: async (current, selector) => {
      const match = current.html.match(new RegExp(`<a ${selector.replace(/[\[\]]/g, '')}="([^"]+)"`));
      return match ? load(match[1]) : null;
    },
    close: async () => undefined,
  };
}

const item = (name: string) => `<li class="item">${name}</li>`;
const fields = [{ name: 'name', selector: '.', attribute: 'text', type: 'STRING' as const, required: true }];

const baseSite: CrawlSite = {
  baseUrl: 'https://s.test/p1',
  scraperType: 'STATIC',
  itemSelector: '.item',
  paginationType: 'NONE',
  nextSelector: null,
  urlTemplate: null,
  maxPages: 5,
  requestDelayMs: 0,
  fields,
};

async function collect(site: CrawlSite, source: PageSource, options = {}) {
  const results = [];
  for await (const page of crawl(site, source, options)) results.push(page);
  return results;
}

describe('crawl', () => {
  it('without pagination only processes the first page', async () => {
    const source = fakeSource({ 'https://s.test/p1': `<ul>${item('a')}</ul>` });
    const results = await collect(baseSite, source);
    expect(results).toHaveLength(1);
    expect(results[0].items).toHaveLength(1);
  });

  it('follows the "next" link up to maxPages', async () => {
    const source = fakeSource({
      'https://s.test/p1': `<ul>${item('a')}</ul><a data-next="https://s.test/p2">next</a>`,
      'https://s.test/p2': `<ul>${item('b')}</ul><a data-next="https://s.test/p3">next</a>`,
      'https://s.test/p3': `<ul>${item('c')}</ul>`,
    });
    const site: CrawlSite = { ...baseSite, paginationType: 'NEXT_SELECTOR', nextSelector: '[data-next' };
    const results = await collect(site, source);
    expect(results.map((r) => r.items[0].data.name)).toEqual(['a', 'b', 'c']);
  });

  it('stops when there is no next link', async () => {
    const source = fakeSource({ 'https://s.test/p1': `<ul>${item('a')}</ul>` });
    const site: CrawlSite = { ...baseSite, paginationType: 'NEXT_SELECTOR', nextSelector: '[data-next' };
    expect(await collect(site, source)).toHaveLength(1);
  });

  it('with URL pagination walks the pages and stops at the first empty one', async () => {
    const source = fakeSource({
      'https://s.test/page/1': `<ul>${item('a')}</ul>`,
      'https://s.test/page/2': `<ul>${item('b')}</ul>`,
      'https://s.test/page/3': '<ul></ul>',
      'https://s.test/page/4': `<ul>${item('never')}</ul>`,
    });
    const site: CrawlSite = {
      ...baseSite,
      paginationType: 'URL_PATTERN',
      urlTemplate: 'https://s.test/page/{n}',
      maxPages: 10,
    };
    const results = await collect(site, source);
    expect(results).toHaveLength(3);
    expect(results.flatMap((r) => r.items.map((i) => i.data.name))).toEqual(['a', 'b']);
  });

  it('a failing page in URL pagination does not stop the walk', async () => {
    const source = fakeSource({
      'https://s.test/page/1': `<ul>${item('a')}</ul>`,
      'https://s.test/page/2': new Error('timeout'),
      'https://s.test/page/3': `<ul>${item('c')}</ul>`,
    });
    const site: CrawlSite = {
      ...baseSite,
      paginationType: 'URL_PATTERN',
      urlTemplate: 'https://s.test/page/{n}',
      maxPages: 3,
    };
    const results = await collect(site, source);
    expect(results.map((r) => r.error)).toEqual([undefined, 'timeout', undefined]);
    expect(results[2].items[0].data.name).toBe('c');
  });

  it('reports the error when the first page fails', async () => {
    const source = fakeSource({ 'https://s.test/p1': new Error('HTTP 500') });
    const results = await collect(baseSite, source);
    expect(results).toEqual([expect.objectContaining({ pageNumber: 1, error: 'HTTP 500' })]);
  });

  it('stops when shouldStop returns true (cancellation)', async () => {
    const source = fakeSource({
      'https://s.test/page/1': `<ul>${item('a')}</ul>`,
      'https://s.test/page/2': `<ul>${item('b')}</ul>`,
    });
    const site: CrawlSite = {
      ...baseSite,
      paginationType: 'URL_PATTERN',
      urlTemplate: 'https://s.test/page/{n}',
      maxPages: 2,
    };
    const results = await collect(site, source, { shouldStop: async () => true });
    expect(results).toHaveLength(1);
  });

  it('firstPageOnly limits the preview to one page', async () => {
    const source = fakeSource({
      'https://s.test/page/1': `<ul>${item('a')}</ul>`,
      'https://s.test/page/2': `<ul>${item('b')}</ul>`,
    });
    const site: CrawlSite = {
      ...baseSite,
      paginationType: 'URL_PATTERN',
      urlTemplate: 'https://s.test/page/{n}',
      maxPages: 2,
    };
    expect(await collect(site, source, { firstPageOnly: true })).toHaveLength(1);
  });
});
