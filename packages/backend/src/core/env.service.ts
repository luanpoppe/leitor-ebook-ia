import { Global, Injectable } from '@nestjs/common';
import z from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3026),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  MINIO_ENDPOINT: z.string().url().optional(),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),
  MINIO_BUCKET: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

@Injectable()
@Global()
export class EnvService {
  private readonly env: Env;

  constructor() {
    const { data, error } = envSchema.safeParse(process.env);
    if (error) throw new Error(`Invalid env vars: ${error.message}`);

    this.env = data;
  }

  getEnvs(): Env {
    return this.env;
  }
}
