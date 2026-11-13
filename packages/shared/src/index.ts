import { z } from 'zod';

export const ScraperType = z.enum(['STATIC', 'DYNAMIC']);
export type ScraperType = z.infer<typeof ScraperType>;

export const PaginationType = z.enum(['NONE', 'NEXT_SELECTOR', 'URL_PATTERN']);
export type PaginationType = z.infer<typeof PaginationType>;

export const FieldType = z.enum(['STRING', 'NUMBER', 'PRICE', 'URL', 'DATE']);
export type FieldType = z.infer<typeof FieldType>;

export const ExecutionStatus = z.enum([
  'QUEUED',
  'RUNNING',
  'SUCCESS',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatus>;

export const Role = z.enum(['ADMIN', 'USER']);
export type Role = z.infer<typeof Role>;

export const FieldSelectorSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid field name'),
  selector: z.string().min(1).max(500),
  attribute: z.string().min(1).max(64).default('text'),
  type: FieldType.default('STRING'),
  required: z.boolean().default(false),
});
export type FieldSelectorInput = z.input<typeof FieldSelectorSchema>;

export const SiteSchema = z
  .object({
    name: z.string().min(1).max(120),
    baseUrl: z.url(),
    scraperType: ScraperType.default('STATIC'),
    itemSelector: z.string().min(1).max(500),
    paginationType: PaginationType.default('NONE'),
    nextSelector: z.string().max(500).nullish(),
    urlTemplate: z.string().max(500).nullish(),
    maxPages: z.number().int().min(1).max(50).default(1),
    waitForSelector: z.string().max(500).nullish(),
    requestDelayMs: z.number().int().min(0).max(60_000).default(1000),
    cron: z.string().max(100).nullish(),
    isActive: z.boolean().default(true),
    fields: z.array(FieldSelectorSchema).min(1).max(50),
  })
  .superRefine((site, ctx) => {
    if (site.paginationType === 'NEXT_SELECTOR' && !site.nextSelector) {
      ctx.addIssue({ code: 'custom', path: ['nextSelector'], message: 'Required when pagination uses a selector' });
    }
    if (site.paginationType === 'URL_PATTERN' && !site.urlTemplate?.includes('{n}')) {
      ctx.addIssue({ code: 'custom', path: ['urlTemplate'], message: 'Must contain {n}' });
    }
  });
export type SiteInput = z.input<typeof SiteSchema>;

export const ScheduleSchema = z.object({
  cron: z.string().max(100).nullable(),
});

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const RegisterSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
});

export const PreviewSchema = z.object({
  maxItems: z.number().int().min(1).max(100).default(10),
});

export interface ExecutionSummary {
  pagesProcessed: number;
  itemsExtracted: number;
  itemsInvalid: number;
  durationMs: number | null;
}

export const EXPORT_FORMATS = ['csv', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
