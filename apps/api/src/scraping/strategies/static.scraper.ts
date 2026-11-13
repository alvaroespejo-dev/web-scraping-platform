import { Inject, Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { AppEnv, ENV_TOKEN } from '../../config/env';
import { LoadedPage, PageSource } from '../page-source';
import { assertPublicUrl } from '../url-guard';

const MAX_REDIRECTS = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const USER_AGENT = 'AEspejoScraper/1.0 (+site administrator contact)';

/** Static scraper: downloads the HTML with Axios and processes it with Cheerio. */
@Injectable()
export class StaticScraper {
  constructor(@Inject(ENV_TOKEN) private readonly env: AppEnv) {}

  createSource(): PageSource {
    const allowPrivate = this.env.allowPrivateHosts;

    const fetchPage = async (rawUrl: string, redirects = 0): Promise<LoadedPage> => {
      const url = await assertPublicUrl(rawUrl, allowPrivate);
      const res = await axios.get<string>(url.href, {
        timeout: 15_000,
        maxRedirects: 0,
        maxContentLength: MAX_BYTES,
        responseType: 'text',
        validateStatus: () => true,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      });

      if (res.status >= 300 && res.status < 400 && res.headers.location) {
        if (redirects >= MAX_REDIRECTS) throw new Error(`Too many redirects from ${rawUrl}`);
        return fetchPage(new URL(res.headers.location, url).href, redirects + 1);
      }
      if (res.status >= 400) {
        throw new Error(`HTTP ${res.status} while loading ${url.href}`);
      }
      return { url: url.href, html: String(res.data) };
    };

    return {
      open: (url) => fetchPage(url),
      next: async (current, nextSelector) => {
        const href = cheerio.load(current.html)(nextSelector).first().attr('href');
        if (!href) return null;
        return fetchPage(new URL(href, current.url).href);
      },
      close: async () => undefined,
    };
  }
}
