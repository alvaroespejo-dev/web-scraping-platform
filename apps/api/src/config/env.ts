export interface AppEnv {
  port: number;
  corsOrigin: string;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessTtl: string;
  jwtRefreshTtl: string;
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  redisTls: boolean;
  enableWorker: boolean;
  workerConcurrency: number;
  maxPagesLimit: number;
  allowPrivateHosts: boolean;
  adminEmail?: string;
  adminPassword?: string;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const required = (key: string, fallback?: string): string => {
    const value = source[key] ?? fallback;
    if (value === undefined || value === '') {
      throw new Error(`Missing environment variable ${key}`);
    }
    return value;
  };
  return {
    port: Number(source.PORT ?? 3000),
    corsOrigin: source.CORS_ORIGIN ?? 'http://localhost:5173',
    jwtAccessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret'),
    jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
    jwtAccessTtl: source.JWT_ACCESS_TTL ?? '15m',
    jwtRefreshTtl: source.JWT_REFRESH_TTL ?? '7d',
    redisHost: source.REDIS_HOST ?? 'localhost',
    redisPort: Number(source.REDIS_PORT ?? 6379),
    redisPassword: source.REDIS_PASSWORD || undefined,
    redisTls: source.REDIS_TLS === 'true',
    // Runs the queue worker inside the API process (used when there is no separate worker, e.g. App Service free tier).
    enableWorker: source.ENABLE_WORKER === 'true',
    workerConcurrency: Number(source.WORKER_CONCURRENCY ?? 2),
    maxPagesLimit: Number(source.MAX_PAGES_LIMIT ?? 50),
    allowPrivateHosts: source.ALLOW_PRIVATE_HOSTS === 'true',
    adminEmail: source.ADMIN_EMAIL,
    adminPassword: source.ADMIN_PASSWORD,
  };
}

export const ENV_TOKEN = Symbol('APP_ENV');
