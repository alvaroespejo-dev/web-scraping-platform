import { Module } from '@nestjs/common';
import { ScrapingModule } from '../scraping/scraping.module';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  imports: [ScrapingModule],
  controllers: [SitesController],
  providers: [SitesService],
  exports: [SitesService],
})
export class SitesModule {}
