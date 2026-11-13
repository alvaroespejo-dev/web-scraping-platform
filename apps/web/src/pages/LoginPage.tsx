import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, tokens } from '../api/client';
import { hasSession } from '../api/hooks';
import { Button, ErrorText, Field, Input } from '../components/ui';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  // Demo prefill (development only, see apps/web/.env.development).
  const [email, setEmail] = useState(import.meta.env.VITE_DEMO_EMAIL ?? '');
  const [password, setPassword] = useState(import.meta.env.VITE_DEMO_PASSWORD ?? '');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (hasSession()) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      tokens.save(await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }));
      navigate(from, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-[color:var(--color-line)] bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Scraping Platform</h1>
          <p className="text-sm text-[color:var(--color-muted)]">Sign in to continue</p>
        </div>
        <Field label="Email">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <ErrorText error={error} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
