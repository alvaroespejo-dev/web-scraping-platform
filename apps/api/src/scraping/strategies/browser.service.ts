import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Browser, chromium } from 'playwright';
import { AppEnv, ENV_TOKEN } from '../../config/env';
import { assertPublicUrl } from '../url-guard';

/** A single shared Chromium; each execution opens its own isolated context. */
@Injectable()
export class BrowserService implements OnApplicationShutdown {
  private browserPromise: Promise<Browser> | null = null;

  constructor(@Inject(ENV_TOKEN) private readonly env: AppEnv) {}

  private getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = chromium.launch({ headless: true });
      this.browserPromise.catch(() => (this.browserPromise = null));
    }
    return this.browserPromise;
  }

  async newContext() {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: 'AEspejoScraper/1.0 (+site administrator contact)',
      viewport: { width: 1280, height: 900 },
      javaScriptEnabled: true,
    });
    // Blocks any request (document, script, image...) to private networks.
    await context.route('**/*', async (route) => {
      try {
        await assertPublicUrl(route.request().url(), this.env.allowPrivateHosts);
        await route.continue();
      } catch {
        await route.abort('blockedbyclient');
      }
    });
    return context;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.browserPromise) {
      const browser = await this.browserPromise.catch(() => null);
      await browser?.close();
    }
  }
}
