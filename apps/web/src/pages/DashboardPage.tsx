import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { useMonitoring, useExecutions } from '../api/hooks';
import { Card, Empty, Stat, StatusBadge, formatDate, formatDuration } from '../components/ui';

export default function DashboardPage() {
  const monitoring = useMonitoring(30);
  const recent = useExecutions({ page: 1, pageSize: 8 });
  const m = monitoring.data;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Sites" value={m?.sites ?? '—'} />
        <Stat label="Executions (30 d)" value={m?.executions.total ?? '—'} />
        <Stat
          label="Success rate"
          value={m?.successRate === null || m?.successRate === undefined ? '—' : `${Math.round(m.successRate * 100)} %`}
          hint="SUCCESS / finished executions"
        />
        <Stat label="Average duration" value={formatDuration(m?.avgDurationMs)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Executions per day (last 14 days)">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={m?.perDay ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3e6ec" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="success" stackId="a" name="Successful" fill="#10b981" />
                  <Bar dataKey="failed" stackId="a" name="Failed" fill="#f43f5e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <Card title="Job queue">
          <dl className="space-y-3 text-sm">
            {(['waiting', 'active', 'delayed', 'completed', 'failed'] as const).map((key) => (
              <div key={key} className="flex justify-between">
                <dt className="capitalize text-slate-600">{labelQueue(key)}</dt>
                <dd className="font-medium">{m?.queue[key] ?? '—'}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-[color:var(--color-muted)]">Items extracted in total: {m?.itemsTotal ?? '—'}</p>
        </Card>
      </div>

      <Card
        title="Recent executions"
        actions={
          <Link to="/executions" className="text-sm text-[color:var(--color-accent)]">
            View all
          </Link>
        }
      >
        {recent.data?.items.length ? (
          <ul className="divide-y divide-[color:var(--color-line)]">
            {recent.data.items.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <Link to={`/executions/${e.id}`} className="font-medium hover:underline">
                  {e.site?.name ?? 'Site'}
                </Link>
                <span className="text-[color:var(--color-muted)]">{formatDate(e.createdAt)}</span>
                <span>{e.itemsExtracted} items</span>
                <StatusBadge status={e.status} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No executions yet.</Empty>
        )}
      </Card>
    </div>
  );
}

function labelQueue(key: string): string {
  return (
    { waiting: 'Waiting', active: 'Active', delayed: 'Delayed', completed: 'Completed', failed: 'Failed' } as Record<string, string>
  )[key];
}
