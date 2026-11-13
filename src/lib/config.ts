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
