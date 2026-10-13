import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// O .env de dev vive na raiz do monorepo; o Next roda com cwd packages/frontend.
loadEnv({ path: resolve(process.cwd(), "../../.env") });

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
