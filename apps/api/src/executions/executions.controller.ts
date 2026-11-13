import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ExecutionStatus } from '@scraping/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { ExecutionQuery, ExecutionsService } from './executions.service';

class ListQuery {
  siteId?: string;
  status?: ExecutionStatus;
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
}

@Controller('executions')
@UseGuards(JwtAuthGuard)
export class ExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListQuery) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const parsed: ExecutionQuery = {
      siteId: query.siteId,
      status: query.status,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page,
      pageSize,
    };
    return this.executions.list(user, parsed);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.executions.get(user, id);
  }

  @Get(':id/logs')
  logs(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.executions.logs(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.executions.cancel(user, id);
  }
}
