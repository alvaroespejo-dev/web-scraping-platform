import { Module } from '@nestjs/common';
import { ScrapingModule } from '../scraping/scraping.module';
import { SitesModule } from '../sites/sites.module';
import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';

@Module({
  imports: [ScrapingModule, SitesModule],
  controllers: [ExecutionsController],
  providers: [ExecutionsService],
  exports: [ExecutionsService],
})
export class ExecutionsModule {}
