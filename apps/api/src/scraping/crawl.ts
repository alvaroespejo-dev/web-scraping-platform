import { PaginationType, ScraperType } from '@scraping/shared';
import { ExtractedItem, FieldDefinition, extractItems } from './extractor';
import { LoadedPage, PageSource } from './page-source';

export interface CrawlSite {
  baseUrl: string;
  scraperType: ScraperType;
  itemSelector: string;
  paginationType: PaginationType;
  nextSelector: string | null;
  urlTemplate: string | null;
  maxPages: number;
  requestDelayMs: number;
  fields: FieldDefinition[];
}

export interface PageResult {
  pageNumber: number;
  url: string;
  items: ExtractedItem[];
  invalid: { pageUrl: string; reasons: string[] }[];
  error?: string;
}

export interface CrawlOptions {
  shouldStop?: () => Promise<boolean>;
  /** Only the first page (used by the preview). */
  firstPageOnly?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Walks through a site's pages and yields the result of each one.
 *
 * - URL_PATTERN: a failing page does not stop the walk; an empty page marks the end.
 * - NEXT_SELECTOR: stops when there is no next link, the content is identical, or on failure.
 * - NONE: only the first page.
 */
export async function* crawl(
  site: CrawlSite,
  source: PageSource,
  options: CrawlOptions = {},
): AsyncGenerator<PageResult> {
  const maxPages = options.firstPageOnly ? 1 : site.maxPages;
  const pauseBetweenPages = async () => {
    if (options.shouldStop && (await options.shouldStop())) return false;
    if (site.requestDelayMs > 0) await sleep(site.requestDelayMs);
    return true;
  };
  const extract = (page: LoadedPage) => extractItems(page.html, page.url, site.itemSelector, site.fields);

  if (site.paginationType === 'URL_PATTERN') {
    const urlFor = (n: number) => (site.urlTemplate ?? '').replace('{n}', String(n));
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
      if (pageNumber > 1 && !(await pauseBetweenPages())) return;
      const url = urlFor(pageNumber);
      let page: LoadedPage;
      try {
        page = await source.open(url);
      } catch (err) {
        yield { pageNumber, url, items: [], invalid: [], error: errorMessage(err) };
        continue;
      }
      const result = extract(page);
      yield { pageNumber, url: page.url, items: result.items, invalid: result.invalid };
      if (result.items.length === 0 && result.invalid.length === 0) return;
    }
    return;
  }

  // NONE or NEXT_SELECTOR: a chain of linked pages.
  let pageNumber = 1;
  let current: LoadedPage;
  try {
    current = await source.open(site.baseUrl);
  } catch (err) {
    yield { pageNumber, url: site.baseUrl, items: [], invalid: [], error: errorMessage(err) };
    return;
  }

  while (true) {
    const result = extract(current);
    yield { pageNumber, url: current.url, items: result.items, invalid: result.invalid };

    if (site.paginationType === 'NONE' || pageNumber >= maxPages) return;
    if (!(await pauseBetweenPages())) return;

    let next: LoadedPage | null;
    try {
      next = await source.next(current, site.nextSelector ?? '');
    } catch (err) {
      yield { pageNumber: pageNumber + 1, url: current.url, items: [], invalid: [], error: errorMessage(err) };
      return;
    }
    if (!next || next.html === current.html) return;

    pageNumber += 1;
    current = next;
  }
}
