import { Link, useNavigate } from 'react-router-dom';
import { useDeleteSite, useRunSite, useSites } from '../api/hooks';
import { Button, Card, Empty, ErrorText, formatDate } from '../components/ui';

export default function SitesPage() {
  const sites = useSites();
  const run = useRunSite();
  const remove = useDeleteSite();
  const navigate = useNavigate();

  const onRun = async (id: string) => {
    const execution = await run.mutateAsync(id);
    navigate(`/executions/${execution.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Sites</h1>
        <Link to="/sites/new">
          <Button>New site</Button>
        </Link>
      </div>

      <ErrorText error={run.error ?? remove.error ?? sites.error} />

      <Card>
        {sites.isLoading && <Empty>Loading…</Empty>}
        {sites.data?.length === 0 && <Empty>No sites yet. Create the first one with "New site".</Empty>}
        {sites.data && sites.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-[color:var(--color-muted)]">
                <tr>
                  <th className="py-2 pr-4">Name</th>
                  <th className="pr-4">URL</th>
                  <th className="pr-4">Engine</th>
                  <th className="pr-4">Schedule</th>
                  <th className="pr-4">Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-line)]">
                {sites.data.map((site) => (
                  <tr key={site.id}>
                    <td className="py-3 pr-4 font-medium">
                      <Link to={`/sites/${site.id}`} className="hover:underline">
                        {site.name}
                      </Link>
                      {!site.isActive && <span className="ml-2 text-xs text-slate-500">(inactive)</span>}
                    </td>
                    <td className="max-w-xs truncate pr-4 text-slate-600">{site.baseUrl}</td>
                    <td className="pr-4">{site.scraperType === 'DYNAMIC' ? 'Playwright' : 'Cheerio'}</td>
                    <td className="pr-4 font-mono text-xs">{site.cron ?? 'manual'}</td>
                    <td className="pr-4 text-slate-500">{formatDate(site.createdAt)}</td>
                    <td className="space-x-2 text-right">
                      <Button variant="secondary" onClick={() => onRun(site.id)} disabled={run.isPending || !site.isActive}>
                        Run
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Delete site "${site.name}" and all its history?`)) remove.mutate(site.id);
                        }}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
