import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma, Site } from '@prisma/client';
import { CronExpressionParser } from 'cron-parser';
import { AuthUser } from '../common/current-user.decorator';
import { AppEnv, ENV_TOKEN } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { ScrapingQueueService } from '../scraping/scraping-queue.service';
import { assertPublicUrl, UnsafeUrlError } from '../scraping/url-guard';

export interface SiteData {
  name: string;
  baseUrl: string;
  scraperType: 'STATIC' | 'DYNAMIC';
  itemSelector: string;
  paginationType: 'NONE' | 'NEXT_SELECTOR' | 'URL_PATTERN';
  nextSelector?: string | null;
  urlTemplate?: string | null;
  maxPages: number;
  waitForSelector?: string | null;
  requestDelayMs: number;
  cron?: string | null;
  isActive: boolean;
  fields: {
    name: string;
    selector: string;
    attribute: string;
    type: 'STRING' | 'NUMBER' | 'PRICE' | 'URL' | 'DATE';
    required: boolean;
  }[];
}

export const siteInclude = { fields: { orderBy: { position: 'asc' } } } satisfies Prisma.SiteInclude;

export function validateCron(cron: string | null | undefined): void {
  if (!cron) return;
  try {
    CronExpressionParser.parse(cron);
  } catch {
    throw new BadRequestException(`Invalid cron expression: "${cron}"`);
  }
}

@Injectable()
export class SitesService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ScrapingQueueService,
    @Inject(ENV_TOKEN) private readonly env: AppEnv,
  ) {}

  /** On startup, restores the schedules of active sites (they are stored in Redis and reconciled here). */
  async onApplicationBootstrap(): Promise<void> {
    const scheduled = await this.prisma.site.findMany({ where: { cron: { not: null }, isActive: true } });
    for (const site of scheduled) {
      await this.queue.syncSchedule(site).catch(() => undefined);
    }
  }

  list(user: AuthUser) {
    return this.prisma.site.findMany({
      where: this.ownerWhere(user),
      include: siteInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(user: AuthUser, id: string) {
    return this.findOwned(user, id);
  }

  async create(user: AuthUser, data: SiteData) {
    await this.validate(data);
    const site = await this.prisma.site.create({
      data: { ...this.scalars(data), ownerId: user.id, fields: { create: this.fieldRows(data) } },
      include: siteInclude,
    });
    await this.queue.syncSchedule(site);
    return site;
  }

  async update(user: AuthUser, id: string, data: SiteData) {
    await this.findOwned(user, id);
    await this.validate(data);
    const site = await this.prisma.$transaction(async (tx) => {
      await tx.fieldSelector.deleteMany({ where: { siteId: id } });
      return tx.site.update({
        where: { id },
        data: { ...this.scalars(data), fields: { create: this.fieldRows(data) } },
        include: siteInclude,
      });
    });
    await this.queue.syncSchedule(site);
    return site;
  }

  async setSchedule(user: AuthUser, id: string, cron: string | null) {
    await this.findOwned(user, id);
    validateCron(cron);
    const site = await this.prisma.site.update({ where: { id }, data: { cron }, include: siteInclude });
    await this.queue.syncSchedule(site);
    return site;
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const site = await this.findOwned(user, id);
    await this.queue.syncSchedule({ id: site.id, cron: null, isActive: false });
    await this.prisma.site.delete({ where: { id } });
  }

  /** Manual scraping: creates a MANUAL execution and enqueues it. */
  async startManual(user: AuthUser, id: string) {
    const site = await this.findOwned(user, id);
    if (!site.isActive) {
      throw new BadRequestException('The site is disabled');
    }
    const execution = await this.prisma.execution.create({
      data: { siteId: site.id, trigger: 'MANUAL', status: 'QUEUED' },
    });
    const bullJobId = await this.queue.enqueueExecution(execution.id);
    return this.prisma.execution.update({ where: { id: execution.id }, data: { bullJobId } });
  }

  /** Checks access to a site. ADMIN users can access everything. */
  async findOwned(user: AuthUser, id: string): Promise<Site & { fields: unknown[] }> {
    const site = await this.prisma.site.findUnique({ where: { id }, include: siteInclude });
    if (!site) throw new NotFoundException('Site not found');
    if (user.role !== 'ADMIN' && site.ownerId !== user.id) {
      throw new ForbiddenException('You do not have access to this site');
    }
    return site;
  }

  ownerWhere(user: AuthUser): Prisma.SiteWhereInput {
    return user.role === 'ADMIN' ? {} : { ownerId: user.id };
  }

  private async validate(data: SiteData): Promise<void> {
    if (data.maxPages > this.env.maxPagesLimit) {
      throw new BadRequestException(`maxPages cannot exceed ${this.env.maxPagesLimit}`);
    }
    validateCron(data.cron);
    try {
      await assertPublicUrl(data.baseUrl, this.env.allowPrivateHosts);
    } catch (err) {
      if (err instanceof UnsafeUrlError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  private scalars(data: SiteData) {
    return {
      name: data.name,
      baseUrl: data.baseUrl,
      scraperType: data.scraperType,
      itemSelector: data.itemSelector,
      paginationType: data.paginationType,
      nextSelector: data.nextSelector ?? null,
      urlTemplate: data.urlTemplate ?? null,
      maxPages: data.maxPages,
      waitForSelector: data.waitForSelector ?? null,
      requestDelayMs: data.requestDelayMs,
      cron: data.cron ?? null,
      isActive: data.isActive,
    };
  }

  private fieldRows(data: SiteData) {
    return data.fields.map((field, position) => ({ ...field, position }));
  }
}
