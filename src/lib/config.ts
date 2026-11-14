export type TelegramConfig = {
  botToken: string;
  webhookSecret: string;
};

export function readTelegramConfig(
  env: NodeJS.ProcessEnv = process.env,
): TelegramConfig {
  return {
    botToken: env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
    webhookSecret: env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "",
  };
}

export function readDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.DATABASE_URL?.trim();
  if (!value) throw new Error("Database is not configured");
  return value;
}

export function readAppUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.APP_URL?.trim();
  if (!value) throw new Error("Application URL is not configured");

  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Application URL must use HTTPS");
  return url.origin;
}
