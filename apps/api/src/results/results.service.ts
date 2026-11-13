import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { SitesService } from '../sites/sites.service';

export interface ResultsQuery {
  siteId?: string;
  executionId?: string;
  q?: string;
  page: number;
  pageSize: number;
}

const EXPORT_BATCH = 500;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: SitesService,
  ) {}

  async list(user: AuthUser, query: ResultsQuery) {
    const where: Prisma.ScrapedItemWhereInput = {
      site: this.sites.ownerWhere(user),
      siteId: query.siteId,
      executionId: query.executionId,
    };
    if (query.q) {
      // Search by source URL. (Filtering inside the JSON and case-insensitive matching
      // are not portable between PostgreSQL and SQLite.)
      where.pageUrl = { contains: query.q };
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.scrapedItem.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.scrapedItem.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Streams the items of an execution as CSV or JSON, in batches of 500. */
  async exportExecution(user: AuthUser, executionId: string, format: 'csv' | 'json', res: Response): Promise<void> {
    const execution = await this.prisma.execution.findUnique({
      where: { id: executionId },
      include: { site: { include: { fields: { orderBy: { position: 'asc' } } } } },
    });
    if (!execution) {
      res.status(404).json({ message: 'Execution not found' });
      return;
    }
    await this.sites.findOwned(user, execution.siteId);

    const columns = execution.site.fields.map((f) => f.name);
    const base = `execution-${executionId}`;

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
      res.write('﻿' + ['pageUrl', ...columns].map(csvCell).join(',') + '\n');
    } else {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.json"`);
      res.write('[');
    }

    let cursor: string | undefined;
    let first = true;
    while (true) {
      const batch = await this.prisma.scrapedItem.findMany({
        where: { executionId },
        orderBy: { id: 'asc' },
        take: EXPORT_BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;

      for (const item of batch) {
        const data = (item.data ?? {}) as Record<string, unknown>;
        if (format === 'csv') {
          res.write([item.pageUrl, ...columns.map((c) => data[c])].map(csvCell).join(',') + '\n');
        } else {
          res.write((first ? '' : ',') + JSON.stringify({ pageUrl: item.pageUrl, ...data }));
        }
        first = false;
      }
      cursor = batch[batch.length - 1].id;
      if (batch.length < EXPORT_BATCH) break;
    }

    if (format === 'json') res.write(']');
    res.end();
  }
}
