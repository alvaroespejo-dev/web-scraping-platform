import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * Test cases: 3 example sites owned by the administrator (admin@example.com).
 * Idempotent: deletes existing sites with the same names (and their history) and recreates them.
 * Usage: npm run seed:cases -w @scraping/api   (requires running npm run seed first)
 */

const OWNER_EMAIL = 'admin@example.com';

const CASES = [
  {
    name: 'Case 1 · Books to Scrape',
    baseUrl: 'https://books.toscrape.com/catalogue/page-1.html',
    scraperType: 'STATIC',
    itemSelector: 'article.product_pod',
    paginationType: 'NEXT_SELECTOR',
    nextSelector: 'li.next a',
    maxPages: 50,
    requestDelayMs: 500,
    fields: [
      { name: 'title', selector: 'h3 a', attribute: 'title', type: 'STRING', required: true },
      { name: 'price', selector: '.price_color', attribute: 'text', type: 'PRICE', required: false },
      { name: 'availability', selector: '.availability', attribute: 'text', type: 'STRING', required: false },
      { name: 'rating', selector: 'p.star-rating', attribute: 'class', type: 'STRING', required: false },
      { name: 'url', selector: 'h3 a', attribute: 'href', type: 'URL', required: false },
    ],
  },
  {
    name: 'Case 2 · Quotes (static)',
    baseUrl: 'https://quotes.toscrape.com/',
    scraperType: 'STATIC',
    itemSelector: 'div.quote',
    paginationType: 'NEXT_SELECTOR',
    nextSelector: 'li.next a',
    maxPages: 10,
    requestDelayMs: 1000,
    fields: [
      { name: 'text', selector: 'span.text', attribute: 'text', type: 'STRING', required: true },
      { name: 'author', selector: 'small.author', attribute: 'text', type: 'STRING', required: true },
    ],
  },
  {
    name: 'Case 3 · Quotes (JavaScript)',
    baseUrl: 'https://quotes.toscrape.com/js/',
    scraperType: 'DYNAMIC',
    itemSelector: 'div.quote',
    waitForSelector: 'div.quote',
    paginationType: 'NEXT_SELECTOR',
    nextSelector: 'li.next a',
    maxPages: 10,
    requestDelayMs: 1000,
    fields: [
      { name: 'text', selector: 'span.text', attribute: 'text', type: 'STRING', required: true },
      { name: 'author', selector: 'small.author', attribute: 'text', type: 'STRING', required: true },
    ],
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
    if (!owner) throw new Error(`${OWNER_EMAIL} does not exist; run npm run seed first`);

    // Also removes rows created by earlier versions of these cases (names in Spanish).
    await prisma.site.deleteMany({
      where: {
        ownerId: owner.id,
        OR: [{ name: { in: CASES.map((c) => c.name) } }, { name: { startsWith: 'Caso ' } }],
      },
    });

    for (const { fields, ...site } of CASES) {
      await prisma.site.create({
        data: {
          ...site,
          ownerId: owner.id,
          waitForSelector: 'waitForSelector' in site ? site.waitForSelector : null,
          nextSelector: site.nextSelector ?? null,
          fields: { create: fields.map((f, position) => ({ ...f, position })) },
        },
      });
      console.log(`Created: ${site.name}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
