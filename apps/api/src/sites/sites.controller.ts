import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { PreviewSchema, ScheduleSchema, SiteSchema } from '@scraping/shared';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PreviewService } from '../scraping/preview.service';
import { SiteData, SitesService } from './sites.service';

const PreviewBodySchema = z.object({ site: SiteSchema, maxItems: PreviewSchema.shape.maxItems });

@Controller('sites')
@UseGuards(JwtAuthGuard)
export class SitesController {
  constructor(
    private readonly sites: SitesService,
    private readonly preview: PreviewService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.sites.list(user);
  }

  /** Tests a configuration without saving it: runs only the first page. */
  @Post('preview')
  @HttpCode(200)
  async previewSite(
    @CurrentUser() _user: AuthUser,
    @Body(new ZodValidationPipe(PreviewBodySchema)) body: z.infer<typeof PreviewBodySchema>,
  ) {
    const site = body.site;
    return this.preview.preview(
      {
        baseUrl: site.baseUrl,
        scraperType: site.scraperType,
        itemSelector: site.itemSelector,
        paginationType: site.paginationType,
        nextSelector: site.nextSelector ?? null,
        urlTemplate: site.urlTemplate ?? null,
        maxPages: site.maxPages,
        requestDelayMs: site.requestDelayMs,
        waitForSelector: site.waitForSelector ?? null,
        fields: site.fields,
      },
      body.maxItems,
    );
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sites.get(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(SiteSchema)) body: SiteData) {
    return this.sites.create(user, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SiteSchema)) body: SiteData,
  ) {
    return this.sites.update(user, id, body);
  }

  @Patch(':id/schedule')
  schedule(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ScheduleSchema)) body: z.infer<typeof ScheduleSchema>,
  ) {
    return this.sites.setSchedule(user, id, body.cron);
  }

  /** Manual scraping: creates the execution and enqueues it. */
  @Post(':id/run')
  run(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sites.startManual(user, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.sites.remove(user, id);
  }
}
