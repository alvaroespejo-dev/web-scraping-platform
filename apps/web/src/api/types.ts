import type { ExecutionStatus, FieldType, PaginationType, ScraperType } from '@scraping/shared';

export interface Field {
  id?: string;
  name: string;
  selector: string;
  attribute: string;
  type: FieldType;
  required: boolean;
  position?: number;
}

export interface Site {
  id: string;
  name: string;
  baseUrl: string;
  scraperType: ScraperType;
  itemSelector: string;
  paginationType: PaginationType;
  nextSelector: string | null;
  urlTemplate: string | null;
  maxPages: number;
  waitForSelector: string | null;
  requestDelayMs: number;
  cron: string | null;
  isActive: boolean;
  createdAt: string;
  fields: Field[];
}

export type SiteForm = Omit<Site, 'id' | 'createdAt' | 'fields'> & { fields: Field[] };

export interface Execution {
  id: string;
  siteId: string;
  trigger: 'MANUAL' | 'SCHEDULED';
  status: ExecutionStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  pagesProcessed: number;
  itemsExtracted: number;
  itemsInvalid: number;
  errorMessage: string | null;
  site?: { name: string; ownerId?: string };
}

export interface ExecutionLog {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  pageUrl: string | null;
  message: string;
  createdAt: string;
}

export interface ScrapedItem {
  id: string;
  executionId: string;
  siteId: string;
  pageUrl: string;
  data: Record<string, string | number | null>;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PreviewResult {
  pageUrl: string;
  itemCount: number;
  invalidCount: number;
  items: { pageUrl: string; data: Record<string, string | number | null> }[];
  invalid: { pageUrl: string; reasons: string[] }[];
  durationMs: number;
  error?: string;
}

export interface MonitoringSummary {
  periodDays: number;
  sites: number;
  executions: { total: number; byStatus: Record<string, number> };
  successRate: number | null;
  avgDurationMs: number | null;
  itemsTotal: number;
  perDay: { date: string; total: number; success: number; failed: number }[];
  queue: { waiting: number; active: number; delayed: number; completed: number; failed: number };
}
