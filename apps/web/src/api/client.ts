const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

const KEYS = { access: 'scraping.access', refresh: 'scraping.refresh' } as const;

// localStorage may be unavailable (private mode, blocked site data): failures are tolerated.
const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* no persistence: the user will have to sign in again */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to do */
    }
  },
};

export const tokens = {
  access: () => store.get(KEYS.access),
  refresh: () => store.get(KEYS.refresh),
  save(pair: { accessToken: string; refreshToken: string }) {
    store.set(KEYS.access, pair.accessToken);
    store.set(KEYS.refresh, pair.refreshToken);
  },
  clear() {
    store.remove(KEYS.access);
    store.remove(KEYS.refresh);
  },
  /** Reads the access token payload without verifying it: only used to display data in the UI. */
  payload(): { email?: string; role?: string } | null {
    const token = tokens.access();
    if (!token) return null;
    try {
      const body = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(body));
    } catch {
      return null;
    }
  },
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

export async function refreshTokens(): Promise<boolean> {
  const refreshToken = tokens.refresh();
  if (!refreshToken) return false;
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) {
        tokens.clear();
        return false;
      }
      tokens.save(await res.json());
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function errorFrom(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message : `Error ${res.status}`;
  return new ApiError(res.status, message, body);
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  const access = tokens.access();
  if (access) headers.set('Authorization', `Bearer ${access}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401 && retry && (await refreshTokens())) {
    return api<T>(path, init, false);
  }
  if (!res.ok) throw await errorFrom(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Downloads a file protected by the access token (plain links do not send the header). */
export async function download(path: string, filename: string): Promise<void> {
  const headers = new Headers();
  const access = tokens.access();
  if (access) headers.set('Authorization', `Bearer ${access}`);
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) throw await errorFrom(res);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
