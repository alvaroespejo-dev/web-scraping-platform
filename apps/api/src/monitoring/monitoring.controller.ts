import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { MonitoringService } from './monitoring.service';

@Controller('monitoring')
@UseGuards(JwtAuthGuard)
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    const window = Math.min(365, Math.max(1, Number(days ?? 30)));
    return this.monitoring.summary(user, window);
  }
}
