import { readTelegramConfig } from "@/lib/config";
import {
  getStartChatId,
  parseTelegramUpdate,
  sendStartMessage,
  webhookSecretMatches,
} from "@/lib/telegram";

const MAX_UPDATE_BYTES = 1_000_000;

function errorResponse(status: number) {
  return Response.json({ ok: false }, { status });
}

export async function POST(request: Request) {
  const config = readTelegramConfig();
  if (!config.botToken || !config.webhookSecret) return errorResponse(503);

  const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!webhookSecretMatches(receivedSecret, config.webhookSecret)) {
    return errorResponse(401);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return errorResponse(415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_UPDATE_BYTES) return errorResponse(413);

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_UPDATE_BYTES) {
    return errorResponse(413);
  }

  const update = parseTelegramUpdate(raw);
  if (!update) return errorResponse(400);

  const chatId = getStartChatId(update);
  if (chatId === null) return Response.json({ ok: true });

  try {
    await sendStartMessage(config, chatId);
    return Response.json({ ok: true });
  } catch {
    return errorResponse(502);
  }
}
