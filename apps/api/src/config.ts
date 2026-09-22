import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

const schema = z.object({
  MAW_MODE: z.enum(["demo", "live"]).default("demo"),
  MAW_TENANT_ID: z.string().min(1).default("demo-tenant"),
  API_PORT: z.coerce.number().int().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  AUTH_MODE: z.enum(["demo", "entra"]).default("demo"),
  ENTRA_TENANT_ID: z.string().optional(),
  ENTRA_CLIENT_ID: z.string().optional(),
  ENTRA_AUDIENCE: z.string().optional(),
  ENTRA_ISSUER: z.string().optional(),
  SCHEDULER_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(60)
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(): AppConfig {
  const config = schema.parse(process.env);
  if (config.MAW_MODE === "live" && config.AUTH_MODE === "demo") {
    throw new Error("AUTH_MODE=demo is not permitted when MAW_MODE=live");
  }
  if (config.AUTH_MODE === "entra" && (!config.ENTRA_TENANT_ID || !config.ENTRA_CLIENT_ID)) {
    throw new Error("ENTRA_TENANT_ID and ENTRA_CLIENT_ID are required when AUTH_MODE=entra");
  }
  return config;
}
