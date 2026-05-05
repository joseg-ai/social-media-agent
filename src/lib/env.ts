import { z } from "zod";

const envSchema = z.object({
  // ── Database ────────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid URL"),

  // ── Azure OpenAI ────────────────────────────────────────────────────────────
  AZURE_OPENAI_ENDPOINT: z.string().url("AZURE_OPENAI_ENDPOINT must be a valid URL"),
  AZURE_OPENAI_DEPLOYMENT: z.string().min(1, "AZURE_OPENAI_DEPLOYMENT is required"),
  // Optional in production — Managed Identity is used when this is absent.
  AZURE_OPENAI_API_KEY: z.string().optional(),

  // ── LinkedIn OAuth ──────────────────────────────────────────────────────────
  LINKEDIN_CLIENT_ID: z.string().min(1, "LINKEDIN_CLIENT_ID is required"),
  LINKEDIN_CLIENT_SECRET: z.string().min(1, "LINKEDIN_CLIENT_SECRET is required"),
  LINKEDIN_REDIRECT_URI: z.string().url("LINKEDIN_REDIRECT_URI must be a valid URL"),
  // 32-byte base64 key for AES-256-GCM. Generate: openssl rand -base64 32
  LINKEDIN_TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(44, "LINKEDIN_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 string (≥44 chars)"),

  // ── Dashboard ───────────────────────────────────────────────────────────────
  DASHBOARD_PASSWORD: z.string().min(8, "DASHBOARD_PASSWORD must be at least 8 characters"),
  // Optional: separate HMAC signing secret for session cookies.
  // If absent, DASHBOARD_PASSWORD is used as the signing key.
  // Generate: openssl rand -base64 32
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters when set")
    .optional(),

  // ── App ─────────────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url("APP_BASE_URL must be a valid URL"),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const formatted = result.error.issues
    .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`❌ Invalid environment variables:\n${formatted}`);
}

export const env = result.data;
export type Env = typeof env;
