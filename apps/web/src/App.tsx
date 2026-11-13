import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { hasSession } from './api/hooks';
import { refreshTokens, tokens } from './api/client';
import { Button } from './components/ui';
import DashboardPage from './pages/DashboardPage';
import ExecutionDetailPage from './pages/ExecutionDetailPage';
import ExecutionsPage from './pages/ExecutionsPage';
import LoginPage from './pages/LoginPage';
import ResultsPage from './pages/ResultsPage';
import SiteEditorPage from './pages/SiteEditorPage';
import SitesPage from './pages/SitesPage';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/sites', label: 'Sites' },
  { to: '/executions', label: 'Executions' },
  { to: '/results', label: 'Results' },
];

function Protected({ children }: { children: ReactElement }) {
  const location = useLocation();
  const [ready, setReady] = useState(hasSession() || !tokens.refresh());
  useEffect(() => {
    if (!ready) refreshTokens().then(() => setReady(true));
  }, [ready]);
  if (!ready) return null;
  if (!hasSession()) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function Shell({ children }: { children: ReactElement }) {
  const navigate = useNavigate();
  const user = tokens.payload();
  const logout = () => {
    tokens.clear();
    navigate('/login', { replace: true });
  };
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-[color:var(--color-line)] bg-white md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-5 py-4 md:block">
          <p className="text-lg font-semibold">Scraping</p>
          <nav className="mt-0 flex gap-1 md:mt-6 md:flex-col">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-slate-100 font-medium' : 'text-slate-600 hover:bg-slate-50'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="hidden px-5 pb-5 text-xs text-[color:var(--color-muted)] md:block">
          <p className="truncate">{user?.email}</p>
          <Button variant="ghost" className="mt-2 px-0" onClick={logout}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <Protected>
            <Shell>
              <Routes>
                <Route index element={<DashboardPage />} />
                <Route path="sites" element={<SitesPage />} />
                <Route path="sites/new" element={<SiteEditorPage />} />
                <Route path="sites/:id" element={<SiteEditorPage />} />
                <Route path="executions" element={<ExecutionsPage />} />
                <Route path="executions/:id" element={<ExecutionDetailPage />} />
                <Route path="results" element={<ResultsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Shell>
          </Protected>
        }
      />
    </Routes>
  );
}
