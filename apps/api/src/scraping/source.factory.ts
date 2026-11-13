import { Injectable } from '@nestjs/common';
import { PageSource } from './page-source';
import { DynamicScraper } from './strategies/dynamic.scraper';
import { StaticScraper } from './strategies/static.scraper';

@Injectable()
export class SourceFactory {
  constructor(
    private readonly statics: StaticScraper,
    private readonly dynamics: DynamicScraper,
  ) {}

  create(site: { scraperType: 'STATIC' | 'DYNAMIC'; itemSelector: string; waitForSelector?: string | null }): Promise<PageSource> {
    if (site.scraperType === 'DYNAMIC') {
      return this.dynamics.createSource({ waitForSelector: site.waitForSelector || site.itemSelector });
    }
    return Promise.resolve(this.statics.createSource());
  }
}
