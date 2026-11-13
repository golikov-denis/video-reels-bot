import { timingSafeEqual } from "node:crypto";
import type { TelegramConfig } from "./config";

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
};

const START_TEXT =
  "Привет! Я помогу превратить длинное видео в короткий вертикальный ролик.\n\n" +
  "Сейчас сервис запускается. Загрузка видео появится на следующем этапе.";

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
    }

    return value as unknown as TelegramUpdate;
  } catch {
    return null;
  }
}

export function getStartChatId(update: TelegramUpdate): number | null {
  const text = update.message?.text;
  if (!text || !update.message) return null;

  const isStart = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/.test(text.trim());
  return isStart ? update.message.chat.id : null;
}

export async function sendStartMessage(
  config: TelegramConfig,
  chatId: number,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(
    `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: START_TEXT }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    },
  );

  const result = (await response.json()) as { ok?: boolean };
  if (!response.ok || result.ok !== true) {
    throw new Error("Telegram message delivery failed");
  }
}
