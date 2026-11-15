import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseWorkerCallbackPayload, WorkerCallbackError } from "../src/lib/worker-callback";

const dbMocks = vi.hoisted(() => ({ withDatabase: vi.fn() }));
const storageMocks = vi.hoisted(() => ({ createDownloadUrl: vi.fn() }));
const telegramMocks = vi.hoisted(() => ({
  sendResultVideo: vi.fn(),
  sendProcessingFailedMessage: vi.fn(),
}));

vi.mock("@/db", () => dbMocks);
vi.mock("../src/lib/storage", () => storageMocks);
vi.mock("../src/lib/telegram", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/telegram")>()),
  ...telegramMocks,
}));

import { processWorkerCallback } from "../src/lib/worker-callback";

const jobId = "51903f05-c906-4d46-98fa-8b3d5065dcea";
const completed = {
  jobId,
  status: "completed" as const,
  resultObjectKey: `results/${jobId}/reel.mp4`,
  resultSize: 12345,
  resultContentType: "video/mp4" as const,
  durationSeconds: 12,
  sourceDurationSeconds: 95.5,
  selectionStartSeconds: 11.85,
  selectionEndSeconds: 23.85,
  selectionConfidence: 0.78,
  selectionStrategy: "speech" as const,
  detectedLanguage: "ru",
};

function fakeDatabase(job: Record<string, unknown>) {
  const updates: Array<Record<string, unknown>> = [];
  const update = () => ({
    set: (values: Record<string, unknown>) => ({
      where: async () => {
        updates.push(values);
        Object.assign(job, values);
        return [];
      },
    }),
  });
  const database = {
    update,
    transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        update,
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: () => ({
                  for: async () => [{ job, chatId: BigInt(42) }],
                }),
              }),
            }),
          }),
        }),
      }),
  };
  return { database, updates };
}

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  dbMocks.withDatabase.mockReset();
  storageMocks.createDownloadUrl.mockReset().mockResolvedValue("https://storage.test/reel");
  telegramMocks.sendResultVideo.mockReset().mockResolvedValue(undefined);
  telegramMocks.sendProcessingFailedMessage.mockReset().mockResolvedValue(undefined);
});

describe("проверка payload callback", () => {
  it("принимает только результат в ожидаемом месте и до 30 секунд", () => {
    expect(parseWorkerCallbackPayload(completed)).toEqual(completed);
    expect(() => parseWorkerCallbackPayload({ ...completed, resultObjectKey: "other.mp4" })).toThrow(
      WorkerCallbackError,
    );
    expect(() => parseWorkerCallbackPayload({ ...completed, durationSeconds: 31 })).toThrow(
      WorkerCallbackError,
    );
  });

  it("остаётся совместимым со старым worker без метаданных", () => {
    const legacy = {
      jobId,
      status: "completed" as const,
      resultObjectKey: `results/${jobId}/reel.mp4`,
      resultSize: 12345,
      resultContentType: "video/mp4" as const,
      durationSeconds: 12,
    };
    expect(parseWorkerCallbackPayload(legacy)).toEqual(legacy);
  });

  it("принимает явные ошибки субтитров и перевода", () => {
    for (const errorCode of [
      "subtitles_unavailable",
      "translation_language_mismatch",
      "translation_failed",
    ] as const) {
      expect(
        parseWorkerCallbackPayload({ jobId, status: "failed", errorCode }),
      ).toEqual({ jobId, status: "failed", errorCode });
    }
    expect(() =>
      parseWorkerCallbackPayload({ jobId, status: "failed", errorCode: "unknown" }),
    ).toThrow(WorkerCallbackError);
  });

  it("отклоняет противоречивые границы и неизвестную стратегию", () => {
    const invalidPatches = [
      { selectionStartSeconds: 24, selectionEndSeconds: 23 },
      { selectionStartSeconds: 0, selectionEndSeconds: 31 },
      { selectionConfidence: Number.NaN },
      { selectionConfidence: 1.1 },
      { selectionStrategy: "unknown" },
      { detectedLanguage: "language-name-is-too-long" },
    ];
    for (const patch of invalidPatches) {
      expect(() => parseWorkerCallbackPayload({ ...completed, ...patch })).toThrow(
        WorkerCallbackError,
      );
    }
  });
});

describe("переходы и уведомления", () => {
  it("завершает processing и не отправляет повторный callback после подтверждения", async () => {
    const job = { id: jobId, status: "processing", notificationSentAt: null };
    const { database } = fakeDatabase(job);
    dbMocks.withDatabase.mockImplementation((callback) => callback(database));

    expect(await processWorkerCallback(completed)).toEqual({ duplicate: false });
    expect(job.status).toBe("completed");
    expect(job).toMatchObject({
      sourceDurationSeconds: 95.5,
      selectionStartSeconds: 11.85,
      selectionEndSeconds: 23.85,
      selectionConfidence: 0.78,
      selectionStrategy: "speech",
      detectedLanguage: "ru",
    });
    expect(job.notificationSentAt).toBeInstanceOf(Date);
    expect(telegramMocks.sendResultVideo).toHaveBeenCalledOnce();

    expect(await processWorkerCallback(completed)).toEqual({ duplicate: true });
    expect(telegramMocks.sendResultVideo).toHaveBeenCalledOnce();
  });

  it("переводит processing в failed и отправляет понятное сообщение", async () => {
    const job = { id: jobId, status: "processing", notificationSentAt: null };
    const { database } = fakeDatabase(job);
    dbMocks.withDatabase.mockImplementation((callback) => callback(database));

    await processWorkerCallback({ jobId, status: "failed", errorCode: "invalid_video" });
    expect(job.status).toBe("failed");
    expect(telegramMocks.sendProcessingFailedMessage).toHaveBeenCalledOnce();
  });

  it("не разрешает completed после failed", async () => {
    const job = { id: jobId, status: "failed", notificationSentAt: null };
    const { database } = fakeDatabase(job);
    dbMocks.withDatabase.mockImplementation((callback) => callback(database));

    await expect(processWorkerCallback(completed)).rejects.toMatchObject({ status: 409 });
    expect(telegramMocks.sendResultVideo).not.toHaveBeenCalled();
  });
});
