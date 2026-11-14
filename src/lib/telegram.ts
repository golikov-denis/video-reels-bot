import { timingSafeEqual } from "node:crypto";
import type { TelegramConfig } from "./config";

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number };
    chat: { id: number };
    text?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function webhookSecretMatches(
  received: string | null,
  expected: string,
): boolean {
  if (!received || !expected) return false;

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

export function parseTelegramUpdate(raw: string): TelegramUpdate | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !Number.isSafeInteger(value.update_id)) return null;

    if (value.message !== undefined) {
      if (!isRecord(value.message)) return null;
      if (!isRecord(value.message.chat)) return null;
      if (!Number.isSafeInteger(value.message.chat.id)) return null;
      if (
        value.message.text !== undefined &&
        typeof value.message.text !== "string"
      ) {
        return null;
      }
      if (value.message.from !== undefined) {
        if (
          !isRecord(value.message.from) ||
          !Number.isSafeInteger(value.message.from.id)
        ) {
          return null;
        }
      }
    }

    return value as unknown as TelegramUpdate;
  } catch {
    return null;
  }
}

export function getStartDetails(
  update: TelegramUpdate,
): { userId: number; chatId: number } | null {
  const message = update.message;
  const text = message?.text;
  if (!message || !text || !message.from) return null;

  const isStart = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/.test(text.trim());
  return isStart
    ? { userId: message.from.id, chatId: message.chat.id }
    : null;
}

async function sendMessage(
  config: TelegramConfig,
  chatId: number | string,
  text: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const response = await fetchImpl(
    `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    },
  );

  const result = (await response.json()) as { ok?: boolean };
  if (!response.ok || result.ok !== true) {
    throw new Error("Telegram message delivery failed");
  }
}

export async function sendStartMessage(
  config: TelegramConfig,
  chatId: number,
  uploadUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const text =
    "Привет! Загрузите длинное видео по защищённой ссылке:\n\n" +
    `${uploadUrl}\n\n` +
    "Ссылка действует 30 минут. После загрузки я создам вертикальный ролик из первых 30 секунд видео.";
  await sendMessage(config, chatId, text, fetchImpl);
}

export async function sendUploadCreatedMessage(
  config: TelegramConfig,
  chatId: bigint,
  jobId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await sendMessage(
    config,
    chatId.toString(),
    `Видео загружено. Задача ${jobId} создана. Начинаю монтаж вертикального ролика.`,
    fetchImpl,
  );
}

export async function sendResultVideo(
  config: TelegramConfig,
  chatId: bigint,
  downloadUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(
    `https://api.telegram.org/bot${config.botToken}/sendVideo`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId.toString(),
        video: downloadUrl,
        caption: "Готово! Ваш вертикальный ролик (до 30 секунд).",
        supports_streaming: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    },
  );
  const result = (await response.json()) as { ok?: boolean };
  if (!response.ok || result.ok !== true) {
    throw new Error("Telegram video delivery failed");
  }
}

export async function sendProcessingFailedMessage(
  config: TelegramConfig,
  chatId: bigint,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await sendMessage(
    config,
    chatId.toString(),
    "Не удалось обработать это видео. Проверьте, что файл открывается, его длительность не больше 60 минут, и попробуйте загрузить другое видео через /start.",
    fetchImpl,
  );
}
