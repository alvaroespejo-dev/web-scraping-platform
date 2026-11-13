import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useExecutions, useSites } from '../api/hooks';
import { Button, Card, Empty, Select, StatusBadge, formatDate, formatDuration } from '../components/ui';

const PAGE_SIZE = 20;

export default function ExecutionsPage() {
  const [siteId, setSiteId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const sites = useSites();
  const executions = useExecutions({ siteId, status, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil((executions.data?.total ?? 0) / PAGE_SIZE));

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Executions</h1>

      <div className="flex flex-wrap gap-3">
        <Select value={siteId} onChange={(e) => reset(() => setSiteId(e.target.value))}>
          <option value="">All sites</option>
          {sites.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => reset(() => setStatus(e.target.value))}>
          <option value="">All statuses</option>
          {['QUEUED', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {executions.isLoading && <Empty>Loading…</Empty>}
        {executions.data?.items.length === 0 && <Empty>No executions match these filters.</Empty>}
        {executions.data && executions.data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-[color:var(--color-muted)]">
                <tr>
                  <th className="py-2 pr-4">Site</th>
                  <th className="pr-4">Started</th>
                  <th className="pr-4">Origin</th>
                  <th className="pr-4">Status</th>
                  <th className="pr-4 text-right">Pages</th>
                  <th className="pr-4 text-right">Items</th>
                  <th className="pr-4 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-line)]">
                {executions.data.items.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-4 font-medium">
                      <Link to={`/executions/${e.id}`} className="hover:underline">
                        {e.site?.name ?? 'Site'}
                      </Link>
                    </td>
                    <td className="pr-4 text-slate-600">{formatDate(e.createdAt)}</td>
                    <td className="pr-4 text-slate-600">{e.trigger === 'SCHEDULED' ? 'Scheduled' : 'Manual'}</td>
                    <td className="pr-4">
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="pr-4 text-right">{e.pagesProcessed}</td>
                    <td className="pr-4 text-right">
                      {e.itemsExtracted}
                      {e.itemsInvalid > 0 && <span className="text-xs text-amber-700"> (+{e.itemsInvalid} invalid)</span>}
                    </td>
                    <td className="pr-4 text-right">{formatDuration(e.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-3 text-sm">
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
      </Card>
    </div>
  );
}
