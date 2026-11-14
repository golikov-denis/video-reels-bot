import { readAppUrl, readTelegramConfig } from "@/lib/config";
import {
  registerTelegramUpdate,
  releaseTelegramUpdate,
} from "@/lib/start";
import {
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

  try {
    const action = await registerTelegramUpdate(update);
    if (action.kind !== "start") return Response.json({ ok: true });

    const uploadUrl = new URL(
      `/upload/${action.token}`,
      `${readAppUrl()}/`,
    ).toString();

    try {
      await sendStartMessage(config, action.chatId, uploadUrl);
      return Response.json({ ok: true });
    } catch {
      await releaseTelegramUpdate(update.update_id);
      return errorResponse(502);
    }
  } catch {
    return errorResponse(502);
  }
}
