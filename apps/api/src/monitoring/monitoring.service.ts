import { Injectable } from '@nestjs/common';
import { AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ScrapingQueueService } from '../scraping/scraping-queue.service';
import { SitesService } from '../sites/sites.service';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: SitesService,
    private readonly queue: ScrapingQueueService,
  ) {}

  async summary(user: AuthUser, days = 30) {
    const since = new Date(Date.now() - days * DAY_MS);
    const siteScope = { site: this.sites.ownerWhere(user) };
    const execScope = { ...siteScope, createdAt: { gte: since } };

    const [byStatus, duration, itemsTotal, recent, queue, sitesCount] = await Promise.all([
      this.prisma.execution.groupBy({ by: ['status'], where: execScope, _count: { _all: true } }),
      this.prisma.execution.aggregate({
        where: { ...execScope, durationMs: { not: null } },
        _avg: { durationMs: true },
      }),
      this.prisma.scrapedItem.count({ where: { site: this.sites.ownerWhere(user) } }),
      this.prisma.execution.findMany({
        where: { ...siteScope, createdAt: { gte: new Date(Date.now() - 14 * DAY_MS) } },
        select: { createdAt: true, status: true },
      }),
      this.queue.getCounts(),
      this.prisma.site.count({ where: this.sites.ownerWhere(user) }),
    ]);

    const counts = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])) as Record<string, number>;
    const total = byStatus.reduce((sum, row) => sum + row._count._all, 0);
    const finished = ['SUCCESS', 'PARTIAL', 'FAILED'].reduce((sum, s) => sum + (counts[s] ?? 0), 0);

    const perDay = new Map<string, { date: string; total: number; success: number; failed: number }>();
    for (let i = 13; i >= 0; i--) {
      const date = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
      perDay.set(date, { date, total: 0, success: 0, failed: 0 });
    }
    for (const row of recent) {
      const day = perDay.get(row.createdAt.toISOString().slice(0, 10));
      if (!day) continue;
      day.total += 1;
      if (row.status === 'SUCCESS') day.success += 1;
      if (row.status === 'FAILED') day.failed += 1;
    }

    return {
      periodDays: days,
      sites: sitesCount,
      executions: { total, byStatus: counts },
      successRate: finished === 0 ? null : (counts.SUCCESS ?? 0) / finished,
      avgDurationMs: duration._avg.durationMs ? Math.round(duration._avg.durationMs) : null,
      itemsTotal,
      perDay: [...perDay.values()],
      queue,
    };
  }
}
