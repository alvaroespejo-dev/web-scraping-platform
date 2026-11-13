import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export const SCRAPING_QUEUE = 'scraping';
export const SCHEDULED_JOB = 'scheduled';
export const RUN_JOB = 'run';

export interface RunJobData {
  executionId: string;
}

export interface ScheduledJobData {
  siteId: string;
}

/** Queue producer: enqueues executions and maintains each site's cron schedule. */
@Injectable()
export class ScrapingQueueService {
  constructor(@InjectQueue(SCRAPING_QUEUE) private readonly queue: Queue) {}

  async enqueueExecution(executionId: string): Promise<string> {
    const job = await this.queue.add(
      RUN_JOB,
      { executionId } satisfies RunJobData,
      {
        jobId: `exec-${executionId}`,
        attempts: 2,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1_000 },
      },
    );
    return job.id ?? `exec-${executionId}`;
  }

  /** Creates, updates or removes a site's cron schedule. Throws if the pattern is invalid. */
  async syncSchedule(site: { id: string; cron: string | null; isActive: boolean }): Promise<void> {
    const schedulerId = `site-${site.id}`;
    if (site.cron && site.isActive) {
      await this.queue.upsertJobScheduler(
        schedulerId,
        { pattern: site.cron },
        {
          name: SCHEDULED_JOB,
          data: { siteId: site.id } satisfies ScheduledJobData,
          opts: { attempts: 1, removeOnComplete: { count: 500 }, removeOnFail: { count: 1_000 } },
        },
      );
    } else {
      await this.queue.removeJobScheduler(schedulerId);
    }
  }

  async cancelQueuedJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    await job?.remove().catch(() => undefined);
  }

  getCounts() {
    return this.queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
  }
}
