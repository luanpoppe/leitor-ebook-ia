import axios from "axios";
import { env } from "@/env";

const REMOTE_API_PATH = "/leitor-api";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

/**
 * Base da API no navegador. Localmente usa NEXT_PUBLIC_API_URL; quando a tela é
 * aberta pelo Tailscale (ou qualquer outro host), usa o mesmo host da página no
 * caminho /leitor-api, que o Tailscale encaminha para o backend local.
 */
export function getApiBaseUrl(): string {
  if (typeof window === "undefined") return env.NEXT_PUBLIC_API_URL;

  const isLocalhost = LOCAL_HOSTNAMES.has(window.location.hostname);
  if (isLocalhost) return env.NEXT_PUBLIC_API_URL;

  return `${window.location.origin}${REMOTE_API_PATH}`;
}

export const api = axios.create({ baseURL: getApiBaseUrl() });
