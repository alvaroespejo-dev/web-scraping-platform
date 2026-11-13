// Generates prisma/schema.prisma from prisma/schema.base.prisma based on DATABASE_PROVIDER.
// Usage: DATABASE_PROVIDER=postgresql|sqlite node scripts/use-database.js   (default: sqlite)
const fs = require('fs');
const path = require('path');

const provider = process.env.DATABASE_PROVIDER || 'sqlite';
if (!['postgresql', 'sqlite'].includes(provider)) {
  console.error(`Invalid DATABASE_PROVIDER: "${provider}". Use postgresql or sqlite.`);
  process.exit(1);
}

const prismaDir = path.join(__dirname, '..', 'prisma');
const base = fs.readFileSync(path.join(prismaDir, 'schema.base.prisma'), 'utf8');
fs.writeFileSync(path.join(prismaDir, 'schema.prisma'), base.replace('__DATABASE_PROVIDER__', provider));
console.log(`prisma/schema.prisma generated for ${provider}`);
