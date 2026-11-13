import { Inject, Injectable } from '@nestjs/common';
import { BrowserContext, Page } from 'playwright';
import { AppEnv, ENV_TOKEN } from '../../config/env';
import { LoadedPage, PageSource } from '../page-source';
import { assertPublicUrl } from '../url-guard';
import { BrowserService } from './browser.service';

export interface DynamicOptions {
  waitForSelector: string;
}

/** Dynamic scraper: Playwright renders JavaScript and paginates by clicking "next". */
@Injectable()
export class DynamicScraper {
  constructor(
    private readonly browsers: BrowserService,
    @Inject(ENV_TOKEN) private readonly env: AppEnv,
  ) {}

  async createSource(options: DynamicOptions): Promise<PageSource> {
    const context: BrowserContext = await this.browsers.newContext();
    const page: Page = await context.newPage();
    const allowPrivate = this.env.allowPrivateHosts;

    const snapshot = async (): Promise<LoadedPage> => ({
      url: page.url(),
      html: await page.content(),
    });

    return {
      open: async (url) => {
        await assertPublicUrl(url, allowPrivate);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        // If the selector never appears, return whatever is there; the extractor reports missing items.
        await page.waitForSelector(options.waitForSelector, { timeout: 15_000 }).catch(() => undefined);
        return snapshot();
      },
      next: async (_current, nextSelector) => {
        const button = page.locator(nextSelector).first();
        if ((await button.count()) === 0 || !(await button.isVisible())) return null;
        await button.click();
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
        await page.waitForSelector(options.waitForSelector, { timeout: 10_000 }).catch(() => undefined);
        return snapshot();
      },
      close: async () => {
        await context.close();
      },
    };
  }
}
