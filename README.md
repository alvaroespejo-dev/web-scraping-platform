# Scraping Management Platform

A full-stack web application to **register websites, define CSS selectors, run scraping jobs (manually or on a cron schedule), monitor executions and review or export the extracted data**.

It supports both static pages (HTML fetched with Axios and parsed with Cheerio) and JavaScript-rendered pages (driven by Playwright/Chromium), with pagination by "next" link, by URL pattern, or by clicking a button.

![Dashboard](docs/screenshots/01-dashboard.png)

---

## Table of contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Data model](#data-model)
- [API reference](#api-reference)
- [Screenshots](#screenshots)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Usage walkthrough](#usage-walkthrough)
- [Security](#security)
- [Testing](#testing)
- [Design decisions](#design-decisions)
- [Known limitations and next steps](#known-limitations-and-next-steps)

---

## Features

**Sites and extraction rules**
- Register a start URL and define an **item selector** (the element that wraps each record) and any number of **fields**, each with a CSS selector, the attribute to read (`text`, `html`, `href`, `src`, `class`, ...) and a type.
- Field types: `STRING`, `NUMBER`, `PRICE` (strips currency and handles `1.234,56` / `1,234.56`), `URL` (resolves relative links), `DATE` (normalized to ISO 8601).
- Required fields: an item with a missing required value is discarded and counted as invalid, with the reason logged.
- Three pagination modes: none, **"next" link or button** (`li.next a`), or a **URL pattern** (`?page={n}`), stopping at an empty page.
- Configurable page limit and delay between requests.
- **Test selectors** (preview): runs only the first page against the live site with the current, unsaved configuration, and shows what would be extracted.

**Execution**
- **Manual runs** and **cron schedules** per site, processed by a background worker through a Redis-backed queue (BullMQ).
- Retries with exponential backoff for failed executions.
- Live status while running: pages processed, items extracted, items discarded, elapsed time.
- Detailed **execution log** (per page, per discarded item, errors), and **cancellation** of queued or running executions.
- Statuses: `QUEUED`, `RUNNING`, `SUCCESS`, `PARTIAL` (some errors but data extracted), `FAILED`, `CANCELLED`.

**Results and export**
- Paginated results table with the columns defined on each site, search by source URL, and filter by execution.
- **Export** any execution to **CSV** (UTF-8 with BOM, opens cleanly in Excel) or **JSON**, streamed in batches so large executions do not load into memory.

**Monitoring**
- Dashboard with KPIs (sites, executions in the last 30 days, success rate, average duration), a 14-day execution chart and live job-queue counters from Redis.

**Users and access control**
- Registration and login with JWT access tokens and rotating refresh tokens.
- Roles `ADMIN` and `USER`. Users only see their own sites, executions and results; administrators see everything.
- Passwords hashed with argon2.

---

## Technology stack

| Layer | Technology | Version |
|---|---|---|
| Backend framework | NestJS (`@nestjs/common`, `core`, `platform-express`) | 11.2 |
| Authentication | `@nestjs/passport` 11.0, passport 0.7, passport-jwt 4.0, `@nestjs/jwt` 11.0, argon2 0.45 | see left |
| Validation | Zod (shared schemas between API and frontend) | 4.6 |
| Database ORM | Prisma | 6.19 |
| Databases | SQLite (default) or PostgreSQL | - |
| Queues | BullMQ + ioredis, Redis | bullmq 6.7 / @nestjs/bullmq 11.0 |
| Static scraping | Axios + Cheerio | 1.21 / 1.2 |
| Dynamic scraping | Playwright (Chromium) | 1.65 |
| API docs | Swagger (`@nestjs/swagger`) | 11.4 |
| Rate limiting | `@nestjs/throttler` | 6.7 |
| Frontend | React | 19.3 |
| Frontend tooling | Vite, TypeScript, Tailwind CSS | 8.1 / 5.9 / 4.3 |
| Data fetching | TanStack Query | 5.107 |
| Routing | React Router | 7.18 |
| Charts | Recharts | 3.10 |
| Monorepo | npm workspaces | - |
| Testing | Jest, ts-jest, Supertest, `@nestjs/testing` | 30 / 29 / 7 / 11 |
| Containers | Docker Compose (Redis; PostgreSQL optional) | - |

---

## Architecture

![Architecture overview](docs/architecture.png)

The diagram above is the overview. The Mermaid diagrams below show the components, the execution flow and the data model in more detail.

### Components

```mermaid
flowchart LR
  user([User / browser]) --> web[Dashboard<br/>React + Vite]
  web -- "REST + JWT (/api)" --> api[API<br/>NestJS]
  api -- "Prisma" --> db[(SQLite or PostgreSQL)]
  api -- "enqueue jobs / cron schedules" --> redis[(Redis<br/>BullMQ)]
  redis -- "jobs" --> worker[Worker<br/>NestJS application context]
  worker -- "Prisma" --> db
  worker --> static[Static engine<br/>Axios + Cheerio]
  worker --> dynamic[Dynamic engine<br/>Playwright / Chromium]
  static --> sites[(Target websites)]
  dynamic --> sites
  api -. "preview: first page only" .-> static
  api -. "preview" .-> dynamic
```

The **API** and the **worker** are the same codebase started as two processes (`main.ts` and `worker.ts`). The API handles HTTP requests and enqueues work; the worker consumes the queue, runs the scraping engines and writes results. This keeps long-running browser work away from request handling and lets the worker scale on its own.

### Execution flow

```mermaid
sequenceDiagram
  participant U as User
  participant A as API
  participant Q as Redis (BullMQ)
  participant W as Worker
  participant S as Scraping engine
  participant D as Database

  U->>A: POST /sites/:id/run
  A->>D: create Execution (QUEUED)
  A->>Q: enqueue job { executionId }
  A-->>U: 201 Execution
  Q->>W: deliver job
  W->>D: status = RUNNING
  loop each page (up to maxPages)
    W->>S: open page (fetch or render)
    S-->>W: HTML
    W->>W: extract items, normalize, validate
    W->>D: store valid items, update counters, write log
    W->>D: check status (cancel requested?)
    W->>S: next page (link, pattern or button click)
  end
  W->>D: status = SUCCESS / PARTIAL / FAILED / CANCELLED
  U->>A: GET /executions/:id (polling)
```

### Data model

```mermaid
erDiagram
  User ||--o{ Site : owns
  Site ||--o{ FieldSelector : defines
  Site ||--o{ Execution : has
  Site ||--o{ ScrapedItem : produces
  Execution ||--o{ ExecutionLog : records
  Execution ||--o{ ScrapedItem : contains

  User { string email UK string role }
  Site { string name string baseUrl string scraperType string paginationType string cron bool isActive }
  FieldSelector { string name string selector string attribute string type bool required int position }
  Execution { string trigger string status int pagesProcessed int itemsExtracted int itemsInvalid int durationMs }
  ExecutionLog { string level string message string pageUrl }
  ScrapedItem { json data string pageUrl string contentHash }
```

Extracted values are stored as JSON (`ScrapedItem.data`), because each site defines its own fields. Enum-like fields are stored as text so the same schema works on SQLite and PostgreSQL; their values are validated with Zod.

---

## API reference

The API is documented interactively with **Swagger** at `/docs` when the server is running.

| Method | Route | Description |
|---|---|---|
| POST | `/auth/register` | Create a user |
| POST | `/auth/login` | Get access and refresh tokens |
| POST | `/auth/refresh` | Rotate tokens |
| POST | `/auth/logout` | Revoke the refresh token |
| GET | `/sites` | List sites |
| POST | `/sites` | Create a site with its fields |
| GET / PUT / DELETE | `/sites/:id` | Read, replace or delete a site |
| PATCH | `/sites/:id/schedule` | Set or clear the cron schedule |
| POST | `/sites/preview` | Test a configuration on the first page (nothing is saved) |
| POST | `/sites/:id/run` | Start a manual execution |
| GET | `/executions` | Paginated execution history (filters: site, status, dates) |
| GET | `/executions/:id` | Execution details and counters |
| GET | `/executions/:id/logs` | Execution log |
| POST | `/executions/:id/cancel` | Cancel a queued or running execution |
| GET | `/executions/:id/export?format=csv\|json` | Stream the execution's items |
| GET | `/results` | Paginated extracted items (filters: site, execution, search by URL) |
| GET | `/monitoring/summary?days=30` | KPIs, daily chart data and queue counters |

---

## Screenshots

| Sites | Site editor |
|---|---|
| ![Sites](docs/screenshots/02-sites.png) | ![Site editor](docs/screenshots/04-site-editor.png) |

| Execution detail | Results |
|---|---|
| ![Execution detail](docs/screenshots/03-execution-detail.png) | ![Results](docs/screenshots/05-results.png) |

---

## Project structure

```
├─ docker-compose.yml             Redis (and PostgreSQL, optional)
├─ packages/shared/               Zod schemas and enums shared by the API and the frontend
├─ apps/api/
│  ├─ prisma/
│  │  ├─ schema.base.prisma       Provider-neutral schema (source of truth)
│  │  └─ schema.prisma            Generated for the selected database (do not edit)
│  ├─ scripts/use-database.js     Generates schema.prisma from schema.base.prisma
│  ├─ src/
│  │  ├─ main.ts                  HTTP entry point (Swagger, CORS)
│  │  ├─ worker.ts                Worker entry point (queue consumer)
│  │  ├─ auth/                    Login, refresh tokens, JWT strategy, roles guard
│  │  ├─ users/  sites/  executions/  results/  monitoring/
│  │  ├─ scraping/                Engine: crawl, extractor, page sources, queue, URL guard
│  │  │  └─ strategies/           Static (Axios + Cheerio) and dynamic (Playwright) sources
│  │  ├─ processing/              Value normalization (numbers, prices, URLs, dates)
│  │  └─ prisma/                  Database service, admin seed, demo case seed
│  └─ test/                       End-to-end tests with a local fixture server
└─ apps/web/
   └─ src/
      ├─ api/                     HTTP client, token handling, TanStack Query hooks
      ├─ pages/                   Login, dashboard, sites, site editor, executions, results
      └─ components/              Shared UI components
```

---

## Getting started

**Requirements:** Node.js 20+, Docker (for Redis). Chromium for Playwright is only needed for sites that use the dynamic engine.

```bash
# 1. Install dependencies
npm install

# 2. Start Redis (published on port 6380)
docker compose up -d redis

# 3. Configure the API (defaults are already set for local development)
cp apps/api/.env.example apps/api/.env
#    Change JWT_ACCESS_SECRET, JWT_REFRESH_SECRET and ADMIN_PASSWORD.

# 4. Create the database (SQLite by default) and an administrator
npm run db:migrate
npm run db:seed

# 5. Optional: load three example sites (books.toscrape.com and quotes.toscrape.com)
npm run db:seed-cases

# 6. Chromium for the dynamic engine
npx playwright install chromium

# 7. Start the three processes, each in its own terminal
npm run dev:api        # http://localhost:3000  (Swagger: /docs)
npm run dev:worker     # processes executions and cron schedules
npm run dev:web        # http://localhost:5173
```

### Using PostgreSQL instead of SQLite

Set these values in `apps/api/.env`, then run `npm run db:migrate` again:

```
DATABASE_PROVIDER=postgresql
DATABASE_URL="postgresql://scraping:scraping@localhost:54329/scraping?schema=public"
```

Start PostgreSQL with `docker compose up -d postgres`. The Compose file publishes it on port **54329** to avoid clashes with local installations.

### Production build

```bash
npm run build                                 # shared package, API, dashboard
node apps/api/dist/main.js                    # API
node apps/api/dist/worker.js                  # worker
# serve apps/web/dist with any static file server; set VITE_API_URL at build time if the API is not under /api
```

---

## Usage walkthrough

1. **Sites → New site.** Enter a start URL, the item selector (for example `article.product_pod`) and the fields to extract.
2. **Test selectors.** Click *Test selectors* to see the first page's results without saving.
3. **Pagination and schedule.** Choose a pagination mode and, optionally, a cron expression (server time, UTC by default).
4. **Run.** Click *Run* on the sites list. The execution page follows the progress live and offers cancellation.
5. **Results and export.** Browse the extracted items, search by source URL, or export the execution to CSV or JSON.

The seeded example *Books to Scrape* site extracts about 1,000 books over 50 pages; *Quotes* exists in a static and a JavaScript-rendered version, which shows the difference between the two engines.

---

## Security

- **SSRF protection.** Only `http` and `https` are accepted. Hosts that resolve to private, loopback, link-local or reserved addresses are rejected when a site is saved, before every request, and for every redirect and every resource Chromium loads.
- **Authentication.** JWT access tokens (15 minutes by default) and refresh tokens that are stored as hashes and rotated on use. Passwords are hashed with argon2.
- **Authorization.** Ownership checks on every site, execution and result. Administrators have full access.
- **Input validation.** All request bodies are validated with Zod schemas shared with the frontend.
- **Resource limits.** Maximum pages per site (configurable), 15 s timeouts per request, 5 MB response limit, configurable delay between pages, global rate limit of 120 requests per minute per client.
- **Secrets.** Configuration comes from environment variables; `.env` files are not committed.

---

## Testing

```bash
npm test                              # unit tests
npm run test:e2e -w @scraping/api     # end-to-end tests (needs Redis running)
```

| Suite | Tests | What it covers |
|---|---|---|
| Unit | 45 | Number and price parsing, date and URL normalization, SSRF rules, extraction and required fields, pagination (none, next link, URL pattern, cancellation, errors) |
| End-to-end | 10 | Real database, real Redis and worker, and a local fixture server with paginated HTML and JavaScript-rendered content. Covers authentication, selector preview, a `PARTIAL` execution with logged errors, URL pagination ending on an empty page, CSV and JSON export, the static vs dynamic engine difference, ownership isolation, cron scheduling, and the monitoring summary |

The end-to-end suite runs against SQLite by default and was also verified against PostgreSQL.

---

## Design decisions

- **Two processes, one codebase.** The API stays responsive while the worker runs browsers and long crawls. Both share the same modules and database layer.
- **One crawl loop for both engines.** The static (Axios) and dynamic (Playwright) engines implement the same small `PageSource` interface (`open`, `next`, `close`), so pagination, extraction and error handling exist once.
- **Results as JSON.** Each site has its own fields, so a fixed table per data type would need schema changes for every new site. Storing `data` as JSON keeps the platform generic; the dashboard builds table columns from each site's field definitions.
- **Database-neutral schema.** The schema is generated per provider from one base file. Enums are text, and features that only one database supports (JSON path filters, case-insensitive search) were removed so the same code runs on SQLite and PostgreSQL.
- **Zod shared between backend and frontend.** The site form validates with the same schema the API uses, so users get the same errors before the request is sent.
- **Streaming exports.** Exports read items in batches and write them directly to the response.
- **Repeatable seeds.** The example sites are recreated idempotently, so the demo can be reset at any time.

---

## Known limitations and next steps

- **Scraping behind login** and CAPTCHAs are not supported.
- **Proxies** and IP rotation are not implemented.
- **Search** matches the source URL only; searching inside extracted values needs a per-database implementation.
- **Live updates** use polling (2–3 s) rather than server-sent events.
- **Browser tokens** are kept in `localStorage`. For a public deployment they should move to `HttpOnly` cookies.
- **Migrations**: the project uses `prisma db push`, so there is no migration history yet.
- **Tooling**: ESLint and Prettier are not configured yet.
- **Deployment**: GitHub Actions builds, smoke-tests and deploys the API to Azure App Service and the dashboard to Azure Static Web Apps. There are no container images yet.
