import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: env.corsOrigin.split(','), credentials: true });
  app.enableShutdownHooks();

  const swagger = new DocumentBuilder()
    .setTitle('Scraping Management Platform')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  await app.listen(env.port);
  console.log(`API listening on http://localhost:${env.port} (docs at /docs)`);

  // Single-process deployments: run the queue worker in this process too.
  if (env.enableWorker) {
    const { WorkerModule } = await import("./worker.module");
    await NestFactory.createApplicationContext(WorkerModule);
    console.log("Queue worker running inside the API process (ENABLE_WORKER=true)");
  }
}

bootstrap();
