import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// O .env de dev vive na raiz do monorepo; o Prisma roda com cwd packages/backend.
config({ path: '../../.env' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
