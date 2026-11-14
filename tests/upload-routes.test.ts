import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadMocks = vi.hoisted(() => ({
  prepareUpload: vi.fn(),
  completeUpload: vi.fn(),
}));
const telegramMocks = vi.hoisted(() => ({
  sendUploadCreatedMessage: vi.fn(),
}));
const workerMocks = vi.hoisted(() => ({ triggerWorker: vi.fn() }));

vi.mock("../src/lib/uploads", () => uploadMocks);
vi.mock("../src/lib/telegram", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/telegram")>()),
  sendUploadCreatedMessage: telegramMocks.sendUploadCreatedMessage,
}));
vi.mock("../src/lib/worker", () => workerMocks);

import { POST as preparePOST } from "../src/app/api/uploads/[token]/prepare/route";
import { POST as completePOST } from "../src/app/api/uploads/[token]/complete/route";
import { UploadError } from "../src/lib/upload-validation";

const token = "a".repeat(43);
const context = { params: Promise.resolve({ token }) };
const metadata = { fileName: "lecture.mp4", size: 1024, contentType: "video/mp4" };

function prepareRequest(body: unknown = metadata, contentType = "application/json") {
  return new Request("https://example.test/api/uploads/token/prepare", {
    method: "POST",
    headers: { "content-type": contentType },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  uploadMocks.prepareUpload.mockReset();
  uploadMocks.completeUpload.mockReset();
  telegramMocks.sendUploadCreatedMessage.mockReset().mockResolvedValue(undefined);
  workerMocks.triggerWorker.mockReset().mockResolvedValue(undefined);
});

describe("prepare upload route", () => {
  it("возвращает подписанный URL только после серверной проверки", async () => {
    uploadMocks.prepareUpload.mockResolvedValue({
      uploadUrl: "https://storage.test/signed",
      expiresIn: 600,
    });

    const response = await preparePOST(prepareRequest(), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.uploadUrl).toBe("https://storage.test/signed");
    expect(uploadMocks.prepareUpload).toHaveBeenCalledWith(token, metadata);
  });

  it("не принимает не-JSON запрос", async () => {
    const response = await preparePOST(
      prepareRequest(metadata, "text/plain"),
      context,
    );

    expect(response.status).toBe(415);
    expect(uploadMocks.prepareUpload).not.toHaveBeenCalled();
  });

  it("сообщает об истёкшей ссылке без внутренних деталей", async () => {
    uploadMocks.prepareUpload.mockRejectedValue(
      new UploadError(410, "Срок действия ссылки истёк."),
    );

    const response = await preparePOST(prepareRequest(), context);
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.error).toBe("Срок действия ссылки истёк.");
  });
});

describe("complete upload route", () => {
  it("создаёт задачу и отправляет номер в Telegram", async () => {
    uploadMocks.completeUpload.mockResolvedValue({
      jobId: "job-123",
      chatId: BigInt(42),
      created: true,
    });

    const response = await completePOST(
      new Request("https://example.test/complete", { method: "POST" }),
      context,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jobId).toBe("job-123");
    expect(telegramMocks.sendUploadCreatedMessage).toHaveBeenCalledOnce();
  });

  it("повторное завершение возвращает задачу без повторного уведомления", async () => {
    uploadMocks.completeUpload.mockResolvedValue({
      jobId: "job-123",
      chatId: BigInt(42),
      created: false,
    });

    const response = await completePOST(
      new Request("https://example.test/complete", { method: "POST" }),
      context,
    );

    expect(response.status).toBe(200);
    expect(telegramMocks.sendUploadCreatedMessage).not.toHaveBeenCalled();
  });

  it("сообщает, если HeadObject не нашёл загруженный файл", async () => {
    uploadMocks.completeUpload.mockRejectedValue(
      new UploadError(409, "Файл ещё не загружен. Повторите загрузку."),
    );

    const response = await completePOST(
      new Request("https://example.test/complete", { method: "POST" }),
      context,
    );

    expect(response.status).toBe(409);
    expect(telegramMocks.sendUploadCreatedMessage).not.toHaveBeenCalled();
  });

  it("не раскрывает внутреннюю ошибку хранилища", async () => {
    uploadMocks.completeUpload.mockRejectedValue(
      new Error("private storage details"),
    );

    const response = await completePOST(
      new Request("https://example.test/complete", { method: "POST" }),
      context,
    );

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("private storage details");
  });
});
