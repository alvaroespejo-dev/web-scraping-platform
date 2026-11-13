import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExecutionStatus, FieldType, PaginationType, ScraperType } from '@scraping/shared';
import { PrismaService } from '../prisma/prisma.service';
import { crawl, CrawlSite, PageResult } from './crawl';
import { SourceFactory } from './source.factory';

const INSERT_BATCH = 500;
const MAX_INVALID_LOGS_PER_PAGE = 5;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** SQLite stores enum-like fields as text: convert them back to the Zod-validated types here. */
function toCrawlSite(site: {
  baseUrl: string; scraperType: string; itemSelector: string; paginationType: string;
  nextSelector: string | null; urlTemplate: string | null; maxPages: number; requestDelayMs: number;
  fields: { name: string; selector: string; attribute: string; type: string; required: boolean }[];
}): CrawlSite {
  return {
    baseUrl: site.baseUrl,
    scraperType: site.scraperType as ScraperType,
    itemSelector: site.itemSelector,
    paginationType: site.paginationType as PaginationType,
    nextSelector: site.nextSelector,
    urlTemplate: site.urlTemplate,
    maxPages: site.maxPages,
    requestDelayMs: site.requestDelayMs,
    fields: site.fields.map((f) => ({ ...f, type: f.type as FieldType })),
  };
}

/**
 * Runs an Execution from start to finish: status, pages, items, logs and counters.
 * Independent of BullMQ so it can be tested directly.
 */
@Injectable()
export class ExecutionRunner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: SourceFactory,
  ) {}

  /** Creates a SCHEDULED Execution for a cron trigger. */
  async createScheduled(siteId: string, bullJobId: string | undefined) {
    return this.prisma.execution.create({
      data: { siteId, trigger: 'SCHEDULED', status: 'QUEUED', bullJobId },
    });
  }

  async run(executionId: string, isFinalAttempt: boolean): Promise<void> {
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      include: { site: { include: { fields: { orderBy: { position: 'asc' } } } } },
    });
    if (!execution || execution.status === 'CANCELLED' || execution.status === 'SUCCESS') return;

    const { site } = execution;
    const startedAt = new Date();

    // A retry starts from scratch: previously stored items of this execution are removed.
    await this.prisma.scrapedItem.deleteMany({ where: { executionId } });
    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        status: 'RUNNING',
        startedAt,
        finishedAt: null,
        pagesProcessed: 0,
        itemsExtracted: 0,
        itemsInvalid: 0,
        errorMessage: null,
      },
    });
    await this.log(executionId, 'INFO', `Execution started (${site.scraperType})`);

    const crawlSite = toCrawlSite(site);
    const source = await this.sources.create({ ...crawlSite, waitForSelector: site.waitForSelector });
    const seen = new Set<string>();
    const counters = { pages: 0, items: 0, invalid: 0, errors: 0, firstError: null as string | null };

    try {
      const stop = async () => (await this.currentStatus(executionId)) === 'CANCELLED';

      for await (const page of crawl(
        crawlSite,
        source,
        { shouldStop: stop },
      )) {
        counters.pages += 1;
        const inserted = await this.persistPage(executionId, site.id, page, seen);
        counters.items += inserted;
        counters.invalid += page.invalid.length;

        if (page.error) {
          counters.errors += 1;
          counters.firstError ??= page.error;
          await this.log(executionId, 'ERROR', page.error, page.url);
        } else {
          await this.log(
            executionId,
            'INFO',
            `Page ${page.pageNumber}: ${page.items.length} valid, ${page.invalid.length} invalid`,
            page.url,
          );
        }

        await this.prisma.execution.update({
          where: { id: executionId },
          data: {
            pagesProcessed: counters.pages,
            itemsExtracted: counters.items,
            itemsInvalid: counters.invalid,
          },
        });
      }
    } catch (err) {
      if (!isFinalAttempt) {
        await this.prisma.execution.update({ where: { id: executionId }, data: { status: 'QUEUED' } });
        throw err;
      }
      counters.errors += 1;
      counters.firstError ??= errorMessage(err);
      await this.log(executionId, 'ERROR', `Unexpected failure: ${errorMessage(err)}`);
    } finally {
      await source.close().catch(() => undefined);
    }

    const finishedAt = new Date();
    const cancelled = (await this.currentStatus(executionId)) === 'CANCELLED';
    const status: ExecutionStatus = cancelled
      ? 'CANCELLED'
      : counters.errors === 0
        ? 'SUCCESS'
        : counters.items > 0
          ? 'PARTIAL'
          : 'FAILED';

    if (cancelled) {
      await this.log(executionId, 'WARN', 'Execution cancelled by the user');
    }
    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        status,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        errorMessage: cancelled ? null : counters.firstError,
      },
    });
    await this.log(executionId, status === 'FAILED' ? 'ERROR' : 'INFO', `Finished: ${status}`);
  }

  /** Stores the valid items of a page, without duplicating content within the same execution. */
  private async persistPage(
    executionId: string,
    siteId: string,
    page: PageResult,
    seen: Set<string>,
  ): Promise<number> {
    const rows = page.items
      .filter((item) => {
        if (seen.has(item.contentHash)) return false;
        seen.add(item.contentHash);
        return true;
      })
      .map((item) => ({
        executionId,
        siteId,
        pageUrl: item.pageUrl,
        data: item.data as Prisma.InputJsonValue,
        contentHash: item.contentHash,
      }));

    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      await this.prisma.scrapedItem.createMany({ data: rows.slice(i, i + INSERT_BATCH) });
    }

    for (const invalid of page.invalid.slice(0, MAX_INVALID_LOGS_PER_PAGE)) {
      await this.log(executionId, 'WARN', `Item discarded: ${invalid.reasons.join('; ')}`, invalid.pageUrl);
    }
    return rows.length;
  }

  private async currentStatus(executionId: string): Promise<ExecutionStatus | undefined> {
    const row = await this.prisma.execution.findUnique({
      where: { id: executionId },
      select: { status: true },
    });
    return row?.status as ExecutionStatus | undefined;
  }

  private log(executionId: string, level: 'INFO' | 'WARN' | 'ERROR', message: string, pageUrl?: string) {
    return this.prisma.executionLog.create({
      data: { executionId, level, message, pageUrl: pageUrl ?? null },
    });
  }
}
