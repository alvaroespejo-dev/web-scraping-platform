import { Injectable } from '@nestjs/common';
import { crawl, CrawlSite } from './crawl';
import { ExtractedItem } from './extractor';
import { SourceFactory } from './source.factory';

export interface PreviewResult {
  pageUrl: string;
  itemCount: number;
  invalidCount: number;
  items: ExtractedItem[];
  invalid: { pageUrl: string; reasons: string[] }[];
  durationMs: number;
  error?: string;
}

/** Runs only the first page of a configuration, without saving anything to the database. */
@Injectable()
export class PreviewService {
  constructor(private readonly sources: SourceFactory) {}

  async preview(site: CrawlSite & { waitForSelector?: string | null }, maxItems: number): Promise<PreviewResult> {
    const started = Date.now();
    const source = await this.sources.create(site);
    try {
      let result: PreviewResult = {
        pageUrl: site.baseUrl,
        itemCount: 0,
        invalidCount: 0,
        items: [],
        invalid: [],
        durationMs: 0,
      };
      for await (const page of crawl(site, source, { firstPageOnly: true })) {
        result = {
          ...result,
          pageUrl: page.url,
          itemCount: page.items.length,
          invalidCount: page.invalid.length,
          items: page.items.slice(0, maxItems),
          invalid: page.invalid.slice(0, 10),
          error: page.error,
        };
      }
      return { ...result, durationMs: Date.now() - started };
    } finally {
      await source.close();
    }
  }
}
