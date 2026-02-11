import { z } from 'zod';

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1).default('MISSING_DISCORD_TOKEN'),
  DISCORD_CLIENT_ID: z.string().min(1).default('MISSING_DISCORD_CLIENT_ID'),
  DATABASE_URL: z.string().min(1).default('mysql://root:root@localhost:3306/voodoo'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DISCORD_CLIENT_SECRET: z.string().default(''),
  DISCORD_REDIRECT_URI: z
    .string()
    .url()
    .default('http://localhost:3000/api/auth/discord/callback'),
  SESSION_SECRET: z
    .string()
    .min(32)
    .default('dev-session-secret-change-me-dev-session-secret-change-me'),
  ENCRYPTION_KEY: z
    .string()
    .min(32)
    .default('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='),
  CHECKOUT_SIGNING_SECRET: z
    .string()
    .min(32)
    .default('dev-checkout-signing-secret-change-me-1234567890'),
  SUPER_ADMIN_DISCORD_IDS: z.string().default(''),
  BOT_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  DISCORD_API_BASE_URL: z.string().url().default('https://discord.com/api/v10'),
});

export type AppEnv = z.infer<typeof envSchema> & {
  superAdminDiscordIds: string[];
};

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.parse(process.env);
  cachedEnv = {
    ...parsed,
    superAdminDiscordIds: parsed.SUPER_ADMIN_DISCORD_IDS.split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  };

  return cachedEnv;
}

export function resetEnvForTests(): void {
  cachedEnv = null;
}

