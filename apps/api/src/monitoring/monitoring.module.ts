import { Module } from '@nestjs/common';
import { ScrapingModule } from '../scraping/scraping.module';
import { SitesModule } from '../sites/sites.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [ScrapingModule, SitesModule],
  controllers: [MonitoringController],
  providers: [MonitoringService],
})
export class MonitoringModule {}
