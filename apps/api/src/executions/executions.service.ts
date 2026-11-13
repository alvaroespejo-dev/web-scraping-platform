import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExecutionStatus } from '@scraping/shared';
import { AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ScrapingQueueService } from '../scraping/scraping-queue.service';
import { SitesService } from '../sites/sites.service';

export interface ExecutionQuery {
  siteId?: string;
  status?: ExecutionStatus;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

const ACTIVE: ExecutionStatus[] = ['QUEUED', 'RUNNING'];

@Injectable()
export class ExecutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ScrapingQueueService,
    private readonly sites: SitesService,
  ) {}

  async list(user: AuthUser, query: ExecutionQuery) {
    const where: Prisma.ExecutionWhereInput = {
      site: this.sites.ownerWhere(user),
      siteId: query.siteId,
      status: query.status,
      createdAt: { gte: query.from, lte: query.to },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.execution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { site: { select: { name: true } } },
      }),
      this.prisma.execution.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(user: AuthUser, id: string) {
    const execution = await this.prisma.execution.findUnique({
      where: { id },
      include: { site: { select: { name: true, ownerId: true } } },
    });
    if (!execution) throw new NotFoundException('Execution not found');
    await this.sites.findOwned(user, execution.siteId);
    return execution;
  }

  async logs(user: AuthUser, id: string, limit = 500) {
    await this.get(user, id);
    return this.prisma.executionLog.findMany({
      where: { executionId: id },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async cancel(user: AuthUser, id: string) {
    const execution = await this.get(user, id);
    if (!ACTIVE.includes(execution.status as ExecutionStatus)) {
      throw new ConflictException(`Execution is already ${execution.status}`);
    }
    if (execution.status === 'QUEUED' && execution.bullJobId) {
      await this.queue.cancelQueuedJob(execution.bullJobId);
    }
    // For RUNNING executions the worker checks the status between pages and stops.
    return this.prisma.execution.update({
      where: { id },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
  }
}
