import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../config/env';

async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.adminEmail || !env.adminPassword) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD to create the administrator');
  }
  const prisma = new PrismaClient();
  try {
    const exists = await prisma.user.findUnique({ where: { email: env.adminEmail } });
    if (exists) {
      console.log(`Administrator ${env.adminEmail} already exists`);
      return;
    }
    await prisma.user.create({
      data: {
        email: env.adminEmail,
        passwordHash: await argon2.hash(env.adminPassword),
        role: 'ADMIN',
      },
    });
    console.log(`Administrator created: ${env.adminEmail}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
