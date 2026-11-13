import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSites, useResults, useSite } from '../api/hooks';
import { download } from '../api/client';
import { Button, Card, Empty, Input, Select, formatDate } from '../components/ui';

const PAGE_SIZE = 50;

export default function ResultsPage() {
  const [params, setParams] = useSearchParams();
  const siteId = params.get('siteId') ?? '';
  const executionId = params.get('executionId') ?? '';
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);

  const sites = useSites();
  const site = useSite(siteId || undefined);
  const results = useResults({ siteId, executionId, q: submitted, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil((results.data?.total ?? 0) / PAGE_SIZE));
  const columns = site.data?.fields.map((f) => f.name) ?? [];

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('executionId');
    setParams(next);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Results</h1>

      <div className="flex flex-wrap items-end gap-3">
        <Select value={siteId} onChange={(e) => setFilter('siteId', e.target.value)}>
          <option value="">All sites</option>
          {sites.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(q.trim());
            setPage(1);
          }}
        >
          <Input placeholder="Search by source URL…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        {executionId && (
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-800">
            Execution {executionId.slice(0, 8)}…{' '}
            <button className="underline" onClick={() => setFilter('executionId', '')}>
              remove
            </button>
          </span>
        )}
        {executionId && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => download(`/executions/${executionId}/export?format=csv`, `execution-${executionId}.csv`)}>
              CSV
            </Button>
            <Button variant="secondary" onClick={() => download(`/executions/${executionId}/export?format=json`, `execution-${executionId}.json`)}>
              JSON
            </Button>
          </div>
        )}
      </div>

      <Card>
        {results.isLoading && <Empty>Loading…</Empty>}
        {results.data?.items.length === 0 && <Empty>No results match these filters.</Empty>}
        {results.data && results.data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-[color:var(--color-muted)]">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="py-2 pr-4">
                      {c}
                    </th>
                  ))}
                  <th className="py-2 pr-4">Source</th>
                  <th className="py-2 pr-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-line)]">
                {results.data.items.map((item) => (
                  <tr key={item.id}>
                    {columns.map((c) => (
                      <td key={c} className="max-w-xs truncate py-2 pr-4">
                        {String(item.data[c] ?? '—')}
                      </td>
                    ))}
                    <td className="max-w-[12rem] truncate py-2 pr-4 text-slate-500">
                      <a href={item.pageUrl} target="_blank" rel="noreferrer" className="hover:underline">
                        {item.pageUrl}
                      </a>
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{formatDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-[color:var(--color-muted)]">{results.data?.total ?? 0} results</span>
          <div className="flex items-center gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span>
              {page} / {totalPages}
            </span>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
