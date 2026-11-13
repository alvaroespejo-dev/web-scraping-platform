import { SiteSchema } from '@scraping/shared';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSaveSite, usePreview, useSite } from '../api/hooks';
import type { Field, PreviewResult, Site, SiteForm } from '../api/types';
import { Button, Card, ErrorText, Field as FormField, Input, Select, formatDuration } from '../components/ui';

const EMPTY_FIELD: Field = { name: '', selector: '', attribute: 'text', type: 'STRING', required: false };

const EMPTY_SITE: SiteForm = {
  name: '',
  baseUrl: '',
  scraperType: 'STATIC',
  itemSelector: '',
  paginationType: 'NONE',
  nextSelector: null,
  urlTemplate: null,
  maxPages: 1,
  waitForSelector: null,
  requestDelayMs: 1000,
  cron: null,
  isActive: true,
  fields: [{ ...EMPTY_FIELD, name: 'title', selector: 'h2', required: true }],
};

function toForm(site: Site): SiteForm {
  return {
    name: site.name,
    baseUrl: site.baseUrl,
    scraperType: site.scraperType,
    itemSelector: site.itemSelector,
    paginationType: site.paginationType,
    nextSelector: site.nextSelector,
    urlTemplate: site.urlTemplate,
    maxPages: site.maxPages,
    waitForSelector: site.waitForSelector,
    requestDelayMs: site.requestDelayMs,
    cron: site.cron,
    isActive: site.isActive,
    fields: site.fields.map(({ name, selector, attribute, type, required }) => ({ name, selector, attribute, type, required })),
  };
}

export default function SiteEditorPage() {
  const { id } = useParams();
  const existing = useSite(id);

  if (id && existing.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (id && existing.error) return <ErrorText error={existing.error} />;
  // The key forces a fresh form when the loaded site changes.
  return <SiteEditor key={existing.data?.id ?? 'new'} id={id} initial={existing.data ? toForm(existing.data) : EMPTY_SITE} />;
}

function SiteEditor({ id, initial }: { id?: string; initial: SiteForm }) {
  const navigate = useNavigate();
  const [form, setForm] = useState<SiteForm>(initial);
  const [issues, setIssues] = useState<string[]>([]);
  const save = useSaveSite(id);
  const preview = usePreview();

  const set = <K extends keyof SiteForm>(key: K, value: SiteForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setField = (index: number, patch: Partial<Field>) =>
    set(
      'fields',
      form.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );

  /** Validates with the same schema as the API (shared package) and returns the body ready to send. */
  const validated = (): SiteForm | null => {
    const result = SiteSchema.safeParse(form);
    if (result.success) {
      setIssues([]);
      return result.data as SiteForm;
    }
    setIssues(result.error.issues.map((i) => `${i.path.join('.') || 'form'}: ${i.message}`));
    return null;
  };

  const onPreview = () => {
    const body = validated();
    if (body) preview.mutate(body);
  };

  const onSave = async () => {
    const body = validated();
    if (!body) return;
    await save.mutateAsync(body);
    navigate('/sites');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{id ? 'Edit site' : 'New site'}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/sites')}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {issues.map((msg) => (
            <li key={msg}>• {msg}</li>
          ))}
        </ul>
      )}
      <ErrorText error={save.error} />

      <Card title="Source">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Name">
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </FormField>
          <FormField label="Start URL">
            <Input type="url" placeholder="https://…" value={form.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} />
          </FormField>
          <FormField label="Extraction engine" hint="Dynamic uses Chromium: for pages that load content with JavaScript.">
            <Select value={form.scraperType} onChange={(e) => set('scraperType', e.target.value as SiteForm['scraperType'])}>
              <option value="STATIC">Static (Axios + Cheerio)</option>
              <option value="DYNAMIC">Dynamic (Playwright)</option>
            </Select>
          </FormField>
          {form.scraperType === 'DYNAMIC' && (
            <FormField label="Wait for selector" hint="If empty, the item selector is used.">
              <Input
                value={form.waitForSelector ?? ''}
                onChange={(e) => set('waitForSelector', e.target.value || null)}
              />
            </FormField>
          )}
        </div>
      </Card>

      <Card title="Selectors">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Item selector (CSS)" hint="Element that wraps each record, e.g. .product-card">
            <Input value={form.itemSelector} onChange={(e) => set('itemSelector', e.target.value)} />
          </FormField>
          <FormField label="Pagination">
            <Select value={form.paginationType} onChange={(e) => set('paginationType', e.target.value as SiteForm['paginationType'])}>
              <option value="NONE">None</option>
              <option value="NEXT_SELECTOR">Next link or button</option>
              <option value="URL_PATTERN">URL pattern with {'{n}'}</option>
            </Select>
          </FormField>
          {form.paginationType === 'NEXT_SELECTOR' && (
            <FormField label="Next-page selector">
              <Input value={form.nextSelector ?? ''} onChange={(e) => set('nextSelector', e.target.value || null)} />
            </FormField>
          )}
          {form.paginationType === 'URL_PATTERN' && (
            <FormField label="URL pattern" hint="Example: https://shop.com/catalog?page={n}">
              <Input value={form.urlTemplate ?? ''} onChange={(e) => set('urlTemplate', e.target.value || null)} />
            </FormField>
          )}
          <FormField label="Maximum pages">
            <Input type="number" min={1} max={50} value={form.maxPages} onChange={(e) => set('maxPages', Number(e.target.value))} />
          </FormField>
          <FormField label="Delay between pages (ms)">
            <Input
              type="number"
              min={0}
              max={60000}
              value={form.requestDelayMs}
              onChange={(e) => set('requestDelayMs', Number(e.target.value))}
            />
          </FormField>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Fields to extract</h3>
            <Button variant="ghost" onClick={() => set('fields', [...form.fields, { ...EMPTY_FIELD }])}>
              + Add field
            </Button>
          </div>
          <div className="mb-2 hidden gap-2 px-3 text-xs md:grid md:grid-cols-[1fr_1.4fr_0.8fr_0.8fr_auto_auto]">
            <HeaderCell title="Column name" help="How the column will be named in the table and in the CSV/JSON." />
            <HeaderCell title="CSS selector" help="Where the value is inside each item. Empty or “.” = the item itself." />
            <HeaderCell title="Attribute" help="text = visible text; html = inner markup; or an attribute name (href, title, src, class)." />
            <HeaderCell title="Type" help="Text, Number, Price (strips £ or €), URL (completes relative links) or Date." />
            <HeaderCell title="Required" help="If the value is missing, the item is discarded." />
            <span />
          </div>
          <div className="space-y-2">
            {form.fields.map((field, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-[color:var(--color-line)] p-3 md:grid-cols-[1fr_1.4fr_0.8fr_0.8fr_auto_auto] md:items-center">
                <Input placeholder="name" value={field.name} onChange={(e) => setField(i, { name: e.target.value })} />
                <Input placeholder="CSS selector (empty or “.” = the item)" value={field.selector} onChange={(e) => setField(i, { selector: e.target.value })} />
                <Input placeholder="text / href / src…" value={field.attribute} onChange={(e) => setField(i, { attribute: e.target.value })} />
                <Select value={field.type} onChange={(e) => setField(i, { type: e.target.value as Field['type'] })}>
                  <option value="STRING">Text</option>
                  <option value="NUMBER">Number</option>
                  <option value="PRICE">Price</option>
                  <option value="URL">URL</option>
                  <option value="DATE">Date</option>
                </Select>
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  <input type="checkbox" checked={field.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                  required
                </label>
                <Button variant="ghost" onClick={() => set('fields', form.fields.filter((_, j) => j !== i))} disabled={form.fields.length === 1}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card title="Schedule">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Cron expression" hint="Example: 0 6 * * * (every day at 06:00, server time). Empty = manual.">
            <Input value={form.cron ?? ''} onChange={(e) => set('cron', e.target.value || null)} placeholder="0 6 * * *" />
          </FormField>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            Site active
          </label>
        </div>
      </Card>

      <Card
        title="Preview"
        actions={
          <Button variant="secondary" onClick={onPreview} disabled={preview.isPending}>
            {preview.isPending ? 'Testing…' : 'Test selectors'}
          </Button>
        }
      >
        <p className="mb-3 text-sm text-[color:var(--color-muted)]">
          Runs only the first page with the current configuration, without saving anything.
        </p>
        <ErrorText error={preview.error} />
        {preview.data && <PreviewTable result={preview.data} />}
      </Card>
    </div>
  );
}

function HeaderCell({ title, help }: { title: string; help: string }) {
  return (
    <div>
      <p className="font-semibold text-slate-700">{title}</p>
      <p className="font-normal leading-snug text-[color:var(--color-muted)]">{help}</p>
    </div>
  );
}

function PreviewTable({ result }: { result: PreviewResult }) {
  const columns = result.items[0] ? Object.keys(result.items[0].data) : [];
  return (
    <div className="space-y-3 text-sm">
      <p>
        <strong>{result.itemCount}</strong> valid items, <strong>{result.invalidCount}</strong> discarded ·{' '}
        {formatDuration(result.durationMs)} · {result.pageUrl}
      </p>
      {result.error && <ErrorText error={result.error} />}
      {result.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-xs uppercase text-[color:var(--color-muted)]">
              <tr>
                {columns.map((c) => (
                  <th key={c} className="py-2 pr-4">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--color-line)]">
              {result.items.map((item, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c} className="max-w-xs truncate py-2 pr-4">
                      {String(item.data[c] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.invalid.length > 0 && (
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer">Discarded items ({result.invalid.length})</summary>
          <ul className="mt-2 list-disc pl-5">
            {result.invalid.map((inv, i) => (
              <li key={i}>{inv.reasons.join('; ')}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
