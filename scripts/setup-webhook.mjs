import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const appUrl = process.env.APP_URL?.trim();

  if (!token || !secret || !appUrl) {
    throw new Error("Missing configuration");
  }
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    throw new Error("Invalid webhook secret");
  }

  const baseUrl = new URL(appUrl);
  if (
    baseUrl.protocol !== "https:" ||
    ["localhost", "127.0.0.1", "0.0.0.0"].includes(baseUrl.hostname)
  ) {
    throw new Error("A public HTTPS URL is required");
  }

  const webhookUrl = new URL("/api/telegram/webhook", baseUrl).toString();
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: false,
      max_connections: 40,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json();

  if (!response.ok || result.ok !== true) {
    throw new Error("Telegram rejected the webhook");
  }

  console.log(`Telegram webhook настроен: ${webhookUrl}`);
}

main().catch(() => {
  console.error(
    "Не удалось настроить webhook. Проверьте три переменные в .env и доступность Telegram.",
  );
  process.exitCode = 1;
});
