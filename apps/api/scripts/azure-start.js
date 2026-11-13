// Startup script for single-container hosts such as Azure App Service.
//
// 1. Creates the SQLite data directory (when DATABASE_URL is a file: URL).
// 2. Creates or updates the database tables (prisma db push).
// 3. Creates the administrator (skipped when it already exists).
// 4. Starts the API.
//
// If a step fails, the process does NOT exit. It keeps a minimal HTTP server running that
// answers 503 with the failed step. A container that exits on startup is restarted in a loop,
// and on free hosting tiers that loop exhausts the restart quota and disables the site.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const apiDir = path.join(root, 'apps', 'api');
const port = Number(process.env.PORT || 8080);
const logFile = fs.existsSync('/home/LogFiles') ? '/home/LogFiles/api-startup.log' : null;

function log(message) {
  const line = `[startup ${new Date().toISOString()}] ${message}`;
  console.log(line);
  if (logFile) {
    try {
      fs.appendFileSync(logFile, line + '\n');
    } catch {
      /* logging must never break the startup */
    }
  }
}

function run(step, args) {
  log(`${step}...`);
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env: process.env });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  if (output) log(output.split('\n').slice(-15).join('\n'));
  if (result.status !== 0) throw new Error(`${step} failed (exit code ${result.status})`);
}

function fallback(step, error) {
  log(`FAILED at "${step}": ${error.message}`);
  http
    .createServer((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'The API failed to start', step, error: error.message }));
    })
    .listen(port, () => log(`Fallback server listening on port ${port} (the API is not running)`));
}

let step = 'prepare data directory';
try {
  const url = process.env.DATABASE_URL || '';
  if (url.startsWith('file:/')) {
    fs.mkdirSync(path.dirname(url.slice('file:'.length)), { recursive: true });
  }

  step = 'create database tables';
  run(step, [
    require.resolve('prisma/build/index.js', { paths: [apiDir] }),
    'db',
    'push',
    '--schema',
    path.join(apiDir, 'prisma', 'schema.prisma'),
    '--skip-generate',
  ]);

  step = 'create administrator';
  try {
    run(step, [path.join(apiDir, 'dist', 'prisma', 'seed.js')]);
  } catch (err) {
    log(`${err.message} (continuing)`);
  }

  step = 'start API';
  const entry = path.join(apiDir, 'dist', 'main.js');
  if (!fs.existsSync(entry)) throw new Error(`${entry} not found: the application has not been deployed`);

  log(`${step}...`);
  const startedAt = Date.now();
  const api = spawn(process.execPath, [entry], { cwd: root, stdio: 'inherit', env: process.env });
  api.on('exit', (code) => {
    // A crash right after starting is a startup failure: stay alive and report it.
    // A crash after running for a while is left to the host, which restarts the container.
    if (Date.now() - startedAt < 120_000) {
      fallback(step, new Error(`the API exited with code ${code} shortly after starting`));
    } else {
      process.exit(code === null ? 1 : code);
    }
  });
} catch (err) {
  fallback(step, err);
}
