import axios from "axios";
import { env } from "@/env";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

/**
 * Base da API no navegador. Em localhost usa NEXT_PUBLIC_API_URL; quando a tela
 * é aberta pelo IP da máquina (a URL de rede que o `next dev` mostra), troca só
 * o hostname da URL configurada — a API está na mesma máquina, na outra porta.
 */
export function getApiBaseUrl(): string {
  if (typeof window === "undefined") return env.NEXT_PUBLIC_API_URL;

  const isLocalhost = LOCAL_HOSTNAMES.has(window.location.hostname);
  if (isLocalhost) return env.NEXT_PUBLIC_API_URL;

  const apiUrl = new URL(env.NEXT_PUBLIC_API_URL);
  apiUrl.hostname = window.location.hostname;

  return apiUrl.toString().replace(/\/$/, "");
}

export const api = axios.create({ baseURL: getApiBaseUrl() });
