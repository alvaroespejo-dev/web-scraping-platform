import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { ResultsQuery, ResultsService } from './results.service';

class ListQuery {
  siteId?: string;
  executionId?: string;
  q?: string;
  page?: string;
  pageSize?: string;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get('results')
  list(@CurrentUser() user: AuthUser, @Query() query: ListQuery) {
    const parsed: ResultsQuery = {
      siteId: query.siteId,
      executionId: query.executionId,
      q: query.q?.trim() || undefined,
      page: Math.max(1, Number(query.page ?? 1)),
      pageSize: Math.min(200, Math.max(1, Number(query.pageSize ?? 50))),
    };
    return this.results.list(user, parsed);
  }

  @Get('executions/:id/export')
  async export(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const fmt = format === 'json' ? 'json' : 'csv';
    await this.results.exportExecution(user, id, fmt, res);
  }
}
