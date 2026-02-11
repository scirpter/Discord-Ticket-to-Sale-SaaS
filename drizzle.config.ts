import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './packages/core/src/infra/db/schema/tables.ts',
  out: './drizzle/migrations',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'mysql://root:root@localhost:3306/voodoo',
  },
  strict: true,
  verbose: true,
});

