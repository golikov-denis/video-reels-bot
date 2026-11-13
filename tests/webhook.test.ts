import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as healthGET } from "../src/app/api/health/route";
import { POST as webhookPOST } from "../src/app/api/telegram/webhook/route";

const originalToken = process.env.TELEGRAM_BOT_TOKEN;
const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

function makeRequest(body: string, secret = "test-secret") {
  return new Request("https://example.test/api/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body,
  });
}

function startUpdate(text = "/start") {
  return JSON.stringify({
    update_id: 1001,
    message: {
      message_id: 10,
      chat: { id: 42 },
      text,
    },
  });
}

function mockTelegramSuccess() {
  const fetchMock = vi.fn<typeof fetch>();
  fetchMock.mockResolvedValue(
    Response.json({ ok: true, result: { message_id: 11 } }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
});

afterEach(() => {
  if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = originalToken;

  if (originalSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET;
  else process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret;

  vi.unstubAllGlobals();
});

describe("health", () => {
  it("возвращает HTTP 200 без секретов", async () => {
    const response = healthGET();
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.telegram).toBe("configured");
    expect(JSON.stringify(body)).not.toContain("test-token");
    expect(JSON.stringify(body)).not.toContain("test-secret");
  });
});

describe("telegram webhook", () => {
  it("отклоняет неверный секрет и не вызывает Telegram", async () => {
    const fetchMock = mockTelegramSuccess();

    const response = await webhookPOST(makeRequest(startUpdate(), "wrong"));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("возвращает 503, если сервер не настроен", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "";

    const response = await webhookPOST(makeRequest(startUpdate()));

    expect(response.status).toBe(503);
  });

  it("отвечает на /start понятным русским сообщением", async () => {
    const fetchMock = mockTelegramSuccess();

    const response = await webhookPOST(makeRequest(startUpdate()));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = fetchMock.mock.calls[0]?.[1];
    const payload = JSON.parse(String(options?.body)) as {
      chat_id: number;
      text: string;
    };
    expect(payload.chat_id).toBe(42);
    expect(payload.text).toContain("Привет!");
    expect(payload.text).toContain("следующем этапе");
  });

  it("поддерживает /start с именем бота и параметром", async () => {
    const fetchMock = mockTelegramSuccess();

    const response = await webhookPOST(
      makeRequest(startUpdate("/start@video_reels_bot source")),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("подтверждает обычный update без отправки сообщения", async () => {
    const fetchMock = mockTelegramSuccess();

    const response = await webhookPOST(makeRequest(startUpdate("Здравствуйте")));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("отклоняет повреждённый JSON", async () => {
    mockTelegramSuccess();

    const response = await webhookPOST(makeRequest("{broken"));

    expect(response.status).toBe(400);
  });

  it("не раскрывает внутреннюю ошибку при сбое Telegram", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockRejectedValue(new Error("private network details"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await webhookPOST(makeRequest(startUpdate()));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(502);
    expect(JSON.stringify(body)).not.toContain("private network details");
  });
});
