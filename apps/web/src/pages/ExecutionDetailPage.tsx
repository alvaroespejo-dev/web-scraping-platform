import { useParams, Link } from 'react-router-dom';
import { useCancelExecution, useExecution, useExecutionLogs } from '../api/hooks';
import { download } from '../api/client';
import { Button, Card, Empty, ErrorText, Stat, StatusBadge, formatDate, formatDuration } from '../components/ui';

const LEVEL_STYLE: Record<string, string> = {
  INFO: 'text-slate-600',
  WARN: 'text-amber-700',
  ERROR: 'text-rose-700',
};

export default function ExecutionDetailPage() {
  const { id } = useParams();
  const execution = useExecution(id);
  const e = execution.data;
  const live = e?.status === 'QUEUED' || e?.status === 'RUNNING';
  const logs = useExecutionLogs(id, !!live);
  const cancel = useCancelExecution();

  if (execution.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (execution.error) return <ErrorText error={execution.error} />;
  if (!e) return null;

  const exportFile = (format: 'csv' | 'json') =>
    download(`/executions/${e.id}/export?format=${format}`, `execution-${e.id}.${format}`).catch((err) => alert(err.message));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[color:var(--color-muted)]">
            <Link to="/executions" className="hover:underline">
              Executions
            </Link>{' '}
            / {e.site?.name ?? 'Site'}
          </p>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            Execution <StatusBadge status={e.status} />
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {live && (
            <Button variant="danger" onClick={() => cancel.mutate(e.id)} disabled={cancel.isPending}>
              Cancel
            </Button>
          )}
          <Button variant="secondary" onClick={() => exportFile('csv')} disabled={e.itemsExtracted === 0}>
            Export CSV
          </Button>
          <Button variant="secondary" onClick={() => exportFile('json')} disabled={e.itemsExtracted === 0}>
            Export JSON
          </Button>
          <Link to={`/results?executionId=${e.id}`}>
            <Button variant="secondary">View results</Button>
          </Link>
        </div>
      </div>

      <ErrorText error={cancel.error} />
      {e.errorMessage && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{e.errorMessage}</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Started" value={<span className="text-base">{formatDate(e.startedAt ?? e.createdAt)}</span>} />
        <Stat label="Duration" value={formatDuration(e.durationMs)} hint={live ? 'In progress…' : undefined} />
        <Stat label="Pages" value={e.pagesProcessed} />
        <Stat label="Items" value={e.itemsExtracted} hint={`${e.itemsInvalid} discarded`} />
      </div>

      <Card title="Log">
        {logs.isLoading && <Empty>Loading log…</Empty>}
        {logs.data?.length === 0 && <Empty>No log entries yet.</Empty>}
        {logs.data && logs.data.length > 0 && (
          <ol className="max-h-[28rem] space-y-1.5 overflow-y-auto font-mono text-xs">
            {logs.data.map((log) => (
              <li key={log.id} className={LEVEL_STYLE[log.level]}>
                <span className="text-slate-400">{new Date(log.createdAt).toLocaleTimeString('en-US')}</span>{' '}
                <span className="font-semibold">[{log.level}]</span> {log.message}
                {log.pageUrl && <span className="text-slate-400"> · {log.pageUrl}</span>}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
