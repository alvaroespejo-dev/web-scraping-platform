import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppEnv, ENV_TOKEN } from '../config/env';
import { ExecutionRunner } from './execution-runner.service';
import { PreviewService } from './preview.service';
import { SCRAPING_QUEUE, ScrapingQueueService } from './scraping-queue.service';
import { SourceFactory } from './source.factory';
import { BrowserService } from './strategies/browser.service';
import { DynamicScraper } from './strategies/dynamic.scraper';
import { StaticScraper } from './strategies/static.scraper';

/**
 * Scraping logic shared by the API (queue, preview) and the worker (execution).
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ENV_TOKEN],
      useFactory: (env: AppEnv) => ({
        connection: {
          host: env.redisHost,
          port: env.redisPort,
          password: env.redisPassword,
          tls: env.redisTls ? {} : undefined,
        },
      }),
    }),
    BullModule.registerQueue({ name: SCRAPING_QUEUE }),
  ],
  providers: [
    StaticScraper,
    DynamicScraper,
    BrowserService,
    SourceFactory,
    PreviewService,
    ScrapingQueueService,
    ExecutionRunner,
  ],
  exports: [ScrapingQueueService, PreviewService, ExecutionRunner],
})
export class ScrapingModule {}
