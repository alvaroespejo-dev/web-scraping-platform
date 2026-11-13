import 'dotenv/config';
// The fixtures live on localhost, so private hosts are allowed in tests. Must be set before the app loads.
process.env.ALLOW_PRIVATE_HOSTS = 'true';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { WorkerModule } from '../src/worker.module';

/** Fixture server: a paginated catalog with an invalid item and a page that fails, plus JavaScript-rendered content. */
function startFixtureServer(): Promise<{ server: http.Server; base: string }> {
  const pages: Record<string, { status?: number; html: string }> = {
    '/catalog/1': {
      html: `<ul>
        <li class="item"><h2>Sneakers</h2><span class="price">89,90 €</span></li>
        <li class="item"><h2>Socks</h2><span class="price">5,00 €</span></li>
        <li class="item"><h2>Cap</h2><span class="price">15</span></li>
      </ul><a class="next" href="/catalog/2">Next</a>`,
    },
    '/catalog/2': {
      html: `<ul>
        <li class="item"><h2>Backpack</h2><span class="price">45,00 €</span></li>
        <li class="item"><h2>No price</h2><span class="price">ask</span></li>
      </ul><a class="next" href="/catalog/3">Next</a>`,
    },
    '/catalog/3': { status: 500, html: 'error' },
    '/list/1': { html: `<ul><li class="x">one</li><li class="x">two</li></ul>` },
    '/list/2': { html: `<ul><li class="x">three</li></ul>` },
    '/list/3': { html: `<ul></ul>` },
    // Content that only exists after JavaScript runs.
    '/js/1': {
      html: `<ul id="root"></ul><script>
        setTimeout(() => {
          document.getElementById('root').innerHTML =
            '<li class="jitem"><h2>Rendered one</h2></li><li class="jitem"><h2>Rendered two</h2></li>';
        }, 400);
      </script>`,
    },
  };

  const server = http.createServer((req, res) => {
    const page = pages[req.url ?? ''];
    if (!page) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(page.status ?? 200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><body>${page.html}</body></html>`);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

const waitFor = async <T>(fn: () => Promise<T | null>, timeoutMs = 30_000): Promise<T> => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Timed out');
};

describe('Scraping platform (e2e)', () => {
  let app: INestApplication;
  let worker: INestApplication;
  let fixtures: { server: http.Server; base: string };
  let token: string;
  let otherToken: string;
  const email = `e2e-${Date.now()}@test.local`;
  const otherEmail = `e2e-other-${Date.now()}@test.local`;

  beforeAll(async () => {
    fixtures = await startFixtureServer();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    const workerRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    worker = workerRef.createNestApplication();
    await worker.init();

    const http = app.getHttpServer();
    await request(http).post('/auth/register').send({ email, password: 'secure-password-1' }).expect(201);
    const login = await request(http).post('/auth/login').send({ email, password: 'secure-password-1' }).expect(200);
    token = login.body.accessToken;

    await request(http).post('/auth/register').send({ email: otherEmail, password: 'other-password-2' }).expect(201);
    const other = await request(http).post('/auth/login').send({ email: otherEmail, password: 'other-password-2' });
    otherToken = other.body.accessToken;
  });

  afterAll(async () => {
    await worker?.close();
    await app?.close();
    fixtures?.server.close();
    const prisma = new PrismaService();
    await prisma.user.deleteMany({ where: { email: { startsWith: 'e2e-' } } });
    await prisma.$disconnect();
  });

  const siteBody = (name: string, overrides: Record<string, unknown> = {}) => ({
    name,
    baseUrl: `${fixtures.base}/catalog/1`,
    scraperType: 'STATIC',
    itemSelector: '.item',
    paginationType: 'NONE',
    maxPages: 1,
    requestDelayMs: 0,
    isActive: true,
    fields: [
      { name: 'name', selector: 'h2', attribute: 'text', type: 'STRING', required: true },
      { name: 'price', selector: '.price', attribute: 'text', type: 'PRICE', required: false },
    ],
    ...overrides,
  });

  it('rejects requests without a token', async () => {
    await request(app.getHttpServer()).get('/sites').expect(401);
  });

  it('validates the body when creating a site', async () => {
    const res = await request(app.getHttpServer())
      .post('/sites')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'x', baseUrl: 'not-a-url', itemSelector: '.a', fields: [] })
      .expect(400);
    expect(res.body.issues.length).toBeGreaterThan(0);
  });

  it('preview: tests selectors without saving anything', async () => {
    const res = await request(app.getHttpServer())
      .post('/sites/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ site: siteBody('preview'), maxItems: 2 })
      .expect(200);
    expect(res.body.itemCount).toBe(3);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].data.name).toBe('Sneakers');
    expect(res.body.items[0].data.price).toBe(89.9);
  });

  it('manual run with "next" pagination → PARTIAL with error logs', async () => {
    const http = app.getHttpServer();
    const created = await request(http)
      .post('/sites')
      .set('Authorization', `Bearer ${token}`)
      .send(
        siteBody('Paginated catalog', {
          paginationType: 'NEXT_SELECTOR',
          nextSelector: 'a.next',
          maxPages: 5,
        }),
      )
      .expect(201);
    const siteId = created.body.id;

    const run = await request(http)
      .post(`/sites/${siteId}/run`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(run.body.status).toBe('QUEUED');

    const execution = await waitFor(async () => {
      const res = await request(http)
        .get(`/executions/${run.body.id}`)
        .set('Authorization', `Bearer ${token}`);
      return ['SUCCESS', 'PARTIAL', 'FAILED'].includes(res.body.status) ? res.body : null;
    });

    // Page 1: 3 valid. Page 2: 1 valid and 1 invalid. Page 3: HTTP 500 (stops the chain).
    expect(execution.status).toBe('PARTIAL');
    expect(execution.itemsExtracted).toBe(4);
    expect(execution.itemsInvalid).toBe(1);
    expect(execution.pagesProcessed).toBe(3);
    expect(execution.durationMs).toBeGreaterThanOrEqual(0);
    expect(execution.errorMessage).toContain('HTTP 500');

    const logs = await request(http).get(`/executions/${run.body.id}/logs`).set('Authorization', `Bearer ${token}`);
    const messages: string[] = logs.body.map((l: { message: string }) => l.message);
    expect(messages.some((m) => m.includes('Item discarded'))).toBe(true);
    expect(messages.some((m) => m.includes('HTTP 500'))).toBe(true);
    expect(messages.some((m) => m.startsWith('Finished: PARTIAL'))).toBe(true);
  });

  it('URL pagination with an empty page → SUCCESS, CSV and JSON export', async () => {
    const http = app.getHttpServer();
    const created = await request(http)
      .post('/sites')
      .set('Authorization', `Bearer ${token}`)
      .send(
        siteBody('Lists', {
          baseUrl: `${fixtures.base}/list/1`,
          paginationType: 'URL_PATTERN',
          urlTemplate: `${fixtures.base}/list/{n}`,
          maxPages: 10,
          itemSelector: '.x',
          fields: [{ name: 'text', selector: '.', attribute: 'text', type: 'STRING', required: true }],
        }),
      )
      .expect(201);

    const run = await request(http).post(`/sites/${created.body.id}/run`).set('Authorization', `Bearer ${token}`);
    const execution = await waitFor(async () => {
      const res = await request(http).get(`/executions/${run.body.id}`).set('Authorization', `Bearer ${token}`);
      return ['SUCCESS', 'PARTIAL', 'FAILED'].includes(res.body.status) ? res.body : null;
    });

    expect(execution.status).toBe('SUCCESS');
    expect(execution.itemsExtracted).toBe(3);
    expect(execution.pagesProcessed).toBe(3); // the third page is empty and marks the end

    const csv = await request(http)
      .get(`/executions/${run.body.id}/export?format=csv`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => cb(null, data));
      })
      .expect(200);
    const lines = (csv.body as string).replace(/^﻿/, '').trim().split('\n');
    expect(lines[0]).toBe('pageUrl,text');
    expect(lines).toHaveLength(4);

    const json = await request(http)
      .get(`/executions/${run.body.id}/export?format=json`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => cb(null, data));
      })
      .expect(200);
    const rows = JSON.parse(json.body as string);
    expect(rows.map((r: { text: string }) => r.text)).toEqual(['one', 'two', 'three']);
  });

  it('static engine does not see JavaScript-rendered content; the dynamic one does', async () => {
    const http = app.getHttpServer();
    const jsFields = [{ name: 'title', selector: 'h2', attribute: 'text', type: 'STRING', required: true }];

    const staticSite = await request(http)
      .post('/sites/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        site: siteBody('js-static', { baseUrl: `${fixtures.base}/js/1`, itemSelector: '.jitem', fields: jsFields }),
        maxItems: 10,
      })
      .expect(200);
    expect(staticSite.body.itemCount).toBe(0);

    const dynamicSite = await request(http)
      .post('/sites/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        site: siteBody('js-dynamic', {
          baseUrl: `${fixtures.base}/js/1`,
          scraperType: 'DYNAMIC',
          itemSelector: '.jitem',
          fields: jsFields,
        }),
        maxItems: 10,
      })
      .expect(200);
    expect(dynamicSite.body.itemCount).toBe(2);
    expect(dynamicSite.body.items.map((i: { data: { title: string } }) => i.data.title)).toEqual([
      'Rendered one',
      'Rendered two',
    ]);
  }, 90_000);

  it('history and results are only visible to their owner', async () => {
    const http = app.getHttpServer();
    const list = await request(http).get('/executions').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(2);

    const otherList = await request(http).get('/executions').set('Authorization', `Bearer ${otherToken}`).expect(200);
    expect(otherList.body.items.every((e: { site: { name: string } }) => e.site.name !== 'Lists')).toBe(true);

    const items = await request(http).get('/results').set('Authorization', `Bearer ${token}`).expect(200);
    expect(items.body.total).toBeGreaterThan(0);
  });

  it('schedules a cron and removes it when cleared', async () => {
    const http = app.getHttpServer();
    const created = await request(http)
      .post('/sites')
      .set('Authorization', `Bearer ${token}`)
      .send(siteBody('Scheduled', { cron: '0 3 * * *' }))
      .expect(201);

    const scheduled = await request(http)
      .patch(`/sites/${created.body.id}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cron: '30 6 * * 1-5' })
      .expect(200);
    expect(scheduled.body.cron).toBe('30 6 * * 1-5');

    await request(http)
      .patch(`/sites/${created.body.id}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cron: 'not a cron' })
      .expect(400);

    await request(http)
      .patch(`/sites/${created.body.id}/schedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cron: null })
      .expect(200);
  });

  it('prevents another user from running or reading a site they do not own', async () => {
    const http = app.getHttpServer();
    const created = await request(http)
      .post('/sites')
      .set('Authorization', `Bearer ${token}`)
      .send(siteBody('Private'))
      .expect(201);

    await request(http).post(`/sites/${created.body.id}/run`).set('Authorization', `Bearer ${otherToken}`).expect(403);
    await request(http).get(`/sites/${created.body.id}`).set('Authorization', `Bearer ${otherToken}`).expect(403);
  });

  it('exposes the monitoring summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/monitoring/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.perDay).toHaveLength(14);
    expect(res.body.executions.total).toBeGreaterThanOrEqual(2);
    expect(res.body.queue).toBeDefined();
  });
});
