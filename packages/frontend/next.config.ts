import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

// O .env de dev vive na raiz do monorepo (../../ a partir deste arquivo).
// Resolvemos o caminho relativo AO PRÓPRIO ARQUIVO (via import.meta.url), e não
// ao cwd: assim o build funciona mesmo se rodar de outro diretório.
const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "../../.env");

try {
  const envFileContent = readFileSync(envPath, "utf-8");
  // `parse` apenas converte o conteúdo em objeto — diferente de `config`, NÃO
  // escreve nada no stderr (o aviso que o CI/PowerShell reportava como falha).
  const parsedEnv = parse(envFileContent);

  // O .env da raiz também tem segredos do backend (MINIO_SECRET_KEY, banco).
  // Injetamos em process.env APENAS as NEXT_PUBLIC_*, que são as únicas que o
  // front consome — o resto nunca precisa entrar no processo do Next.
  //
  // Só preenchemos o que ainda não existe no ambiente (mesma precedência do
  // dotenv): uma var exportada pelo shell/CI vence o .env, o que mantém o
  // fail-fast do src/env.ts quando alguém passa um valor inválido.
  for (const [key, value] of Object.entries(parsedEnv)) {
    const isPublicVar = key.startsWith("NEXT_PUBLIC_");
    const isAlreadyDefined = process.env[key] !== undefined;
    if (isPublicVar && !isAlreadyDefined) {
      process.env[key] = value;
    }
  }
} catch (error) {
  // Sem .env é cenário válido: em CI as NEXT_PUBLIC_* vêm do ambiente. A
  // validação de verdade é do src/env.ts (que lança se faltar/for inválida),
  // então aqui só avisamos, sem derrubar o build.
  console.warn(`[next.config] Não foi possível carregar ${envPath}:`, error);
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
