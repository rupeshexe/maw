import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");
if (existsSync(rootEnv)) dotenv.config({ path: rootEnv });

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@maw/ui", "@maw/shared"],
  poweredByHeader: false
};

export default nextConfig;
