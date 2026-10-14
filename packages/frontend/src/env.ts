import z from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
});

/**
 * Env do frontend validada no load do módulo (startup).
 *
 * O Next só inlineia acessos ESTÁTICOS a `process.env.NEXT_PUBLIC_*` no bundle
 * do browser, então o objeto é montado explicitamente em vez de passar o
 * `process.env` inteiro. `parse` lança se alguma var faltar/for inválida
 * (fail-fast).
 */
export const env = envSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});
