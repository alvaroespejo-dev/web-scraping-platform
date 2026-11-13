import { Module } from '@nestjs/common';
import { EnvModule } from './config/env.module';
import { PrismaModule } from './prisma/prisma.module';
import { ScrapingModule } from './scraping/scraping.module';
import { ScrapingProcessor } from './scraping/scraping.processor';

/** Worker process module: consumes the queue and runs scraping. No HTTP. */
@Module({
  imports: [EnvModule, PrismaModule, ScrapingModule],
  providers: [ScrapingProcessor],
})
export class WorkerModule {}
