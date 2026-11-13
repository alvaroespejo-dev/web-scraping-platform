import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ExecutionRunner } from './execution-runner.service';
import { RunJobData, SCHEDULED_JOB, SCRAPING_QUEUE, ScheduledJobData } from './scraping-queue.service';

@Processor(SCRAPING_QUEUE, { concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2) })
export class ScrapingProcessor extends WorkerHost {
  private readonly logger = new Logger(ScrapingProcessor.name);

  constructor(private readonly runner: ExecutionRunner) {
    super();
  }

  async process(job: Job<RunJobData | ScheduledJobData>): Promise<void> {
    const attempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade + 1 >= attempts;

    let executionId: string;
    if (job.name === SCHEDULED_JOB) {
      const { siteId } = job.data as ScheduledJobData;
      const execution = await this.runner.createScheduled(siteId, job.id);
      executionId = execution.id;
    } else {
      executionId = (job.data as RunJobData).executionId;
    }

    this.logger.log(`Running ${executionId} (attempt ${job.attemptsMade + 1}/${attempts})`);
    await this.runner.run(executionId, isFinalAttempt);
  }
}
